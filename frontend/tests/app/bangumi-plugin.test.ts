import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const path = resolve(process.cwd(), '../bangumi_plugin.js');
// jsdom is already the pinned test runtime; keep its small untyped module
// boundary local instead of adding a new dependency just for this fixture.
const { JSDOM } = createRequire(resolve(process.cwd(), 'package.json'))('jsdom') as {
  JSDOM: new (html: string, options: { url: string; runScripts: 'outside-only' }) => {
    window: Window & typeof globalThis;
  };
};
const windows: InstanceType<typeof JSDOM>[] = [];
const source = () => existsSync(path) ? readFileSync(path, 'utf8') : '';

function mount(nav = '<div id="headerNeue2"><div class="idBadgerNeue"><a class="avatar" href="/user/current-user">Me</a></div></div>', url = 'https://bgm.tv/person/6447') {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${nav}<div id="headerSubject"><h1 class="nameSingle">人物</h1><div class="subjectNav">概览</div></div><main><a href="/user/not-current">评论用户</a></main></body></html>`, { url, runScripts: 'outside-only' });
  windows.push(dom);
  dom.window.eval(source());
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window;
}

function entry(window: ReturnType<typeof mount>, type = 'anime') {
  return window.document.querySelector<HTMLAnchorElement>(`#bgmss-person-entry a[data-subject-type="${type}"]`);
}

afterEach(() => windows.splice(0).forEach(dom => dom.window.close()));

describe('Bangumi person userscript', () => {
  it.each(['bgm.tv', 'bangumi.tv', 'chii.in'])('uses current navigation identity and a fixed anime entry on %s', host => {
    const window = mount(undefined, `https://${host}/person/6447`);
    expect(entry(window), 'a person-page entry must be installed').not.toBeNull();
    const link = entry(window)!;
    const url = new URL(link.href);
    expect(url.origin + url.pathname).toBe('https://search.bgmss.fun/ranking');
    expect(Object.fromEntries(url.searchParams)).toEqual({ entry: 'bangumi-person', user: 'current-user', person: '6447', type: 'anime' });
    expect(link.rel).toContain('noopener');
    expect(link.rel).toContain('noreferrer');
  });

  it('exposes all four secondary types without changing the main action', () => {
    const window = mount();
    expect(entry(window)).not.toBeNull();
    for (const type of ['book', 'music', 'game', 'real']) {
      expect(new URL(entry(window, type)!.href).searchParams.get('type')).toBe(type);
    }
    expect(new URL(entry(window)!.href).searchParams.get('type')).toBe('anime');
  });

  it('does not identify the user from person content while logged out', () => {
    const window = mount('<div id="dock"><a href="/login">登录</a></div>');
    expect(entry(window)).not.toBeNull();
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    entry(window)!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(entry(window)!.hasAttribute('href')).toBe(false);
    expect(window.document.querySelector('[data-bgmss-status]')!.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
  });

  it.each([
    ['logged out', '<div id="dock"><a href="/login">登录</a></div>'],
    ['unknown', '<div id="dock"></div>'],
  ])('shows the login explanation immediately when identity is %s', (_state, nav) => {
    const window = mount(nav);
    expect(window.document.querySelector('[data-bgmss-status]')!.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    for (const type of ['anime', 'book', 'music', 'game', 'real']) {
      expect(entry(window, type)!.hasAttribute('href')).toBe(false);
      expect(entry(window, type)!.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('retains the login explanation through secondary-menu and context-menu interaction', () => {
    const window = mount('<div id="dock"><a href="/login">登录</a></div>');
    entry(window)!.click();
    const status = window.document.querySelector('[data-bgmss-status]')!;
    // The dropdown extends below its actions: keep the required notice above it.
    expect(window.document.querySelector('.bgmss-entry-actions')!.previousElementSibling).toBe(status);
    const button = window.document.querySelector<HTMLButtonElement>('#bgmss-person-entry button')!;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(status.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    entry(window, 'book')!.dispatchEvent(new window.MouseEvent('contextmenu', { bubbles: true }));
    expect(status.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    button.click();
    expect(status.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    window.document.querySelector('#dock')!.innerHTML = '<a href="/user/current-user">Me</a>';
    button.click();
    expect(status.textContent).toBe('');
    expect(new URL(entry(window)!.href).searchParams.get('user')).toBe('current-user');
  });

  it('fails closed on conflicting navigation identities or external profile URLs', () => {
    for (const nav of [
      '<div id="headerNeue2"><div class="idBadgerNeue"><a href="/user/alice">A</a></div></div><div id="dock"><a href="/user/bob">B</a></div>',
      '<div id="headerNeue2"><div class="idBadgerNeue"><a href="https://evil.invalid/user/alice">A</a></div></div>',
    ]) {
      const window = mount(nav);
      expect(entry(window)).not.toBeNull();
      expect(entry(window)!.hasAttribute('href')).toBe(false);
    }
  });

  it('supports dock identity and safely encodes UID without adding query fields', () => {
    const window = mount('<div id="dock"><a href="/user/a%26person%3D999">Me</a></div>');
    expect(entry(window)).not.toBeNull();
    const url = new URL(entry(window)!.href);
    expect(url.searchParams.get('user')).toBe('a&person=999');
    expect(url.searchParams.getAll('person')).toEqual(['6447']);
  });

  it('rechecks login at activation and does not launch a stale identity', () => {
    const window = mount();
    expect(entry(window)).not.toBeNull();
    window.document.querySelector('.idBadgerNeue')!.innerHTML = '<a href="/login">登录</a>';
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    entry(window)!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(entry(window)!.hasAttribute('href')).toBe(false);
  });

  it('refreshes unavailable identity before opening secondary types with ArrowDown', () => {
    const window = mount();
    window.document.querySelector('.idBadgerNeue')!.innerHTML = '<a href="/login">登录</a>';
    const button = window.document.querySelector<HTMLButtonElement>('#bgmss-person-entry button')!;
    button.focus();
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(window.document.activeElement).toBe(entry(window, 'book'));
    expect(window.document.querySelector('[data-bgmss-status]')!.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    for (const type of ['anime', 'book', 'music', 'game', 'real']) {
      expect(entry(window, type)!.hasAttribute('href')).toBe(false);
      expect(entry(window, type)!.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('is idempotent and supports Escape, outside click and keyboard focus', () => {
    const window = mount();
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
    window.eval(source());
    // JSDOM may still report loading; execute the second installation callback.
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(window.document.querySelectorAll('#bgmss-person-entry')).toHaveLength(1);
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
    const button = window.document.querySelector<HTMLButtonElement>('#bgmss-person-entry button')!;
    const panel = window.document.getElementById(button.getAttribute('aria-controls')!)!;
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
    entry(window, 'book')!.focus();
    panel.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(window.document.activeElement).toBe(button);
    button.click();
    window.document.querySelector('main')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it.each(['0', '01', '-1', '9007199254740992', '6447/works', '6447x'])('does not activate malformed or non-overview person path %s', id => {
    const window = mount(undefined, `https://bgm.tv/person/${id}`);
    expect(window.document.querySelector('#bgmss-person-entry')).toBeNull();
  });

  it('ships standards metadata limited to person pages without privileged grants', () => {
    expect(source()).toContain('// ==UserScript==');
    expect(source()).toContain('// @grant        none');
    expect(source()).not.toMatch(/@connect|document\.cookie|localStorage|GM_xmlhttpRequest/);
  });
});

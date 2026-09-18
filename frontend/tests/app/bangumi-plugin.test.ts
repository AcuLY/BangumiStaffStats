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

// Mirrors the real https://bgm.tv/person/<id> header: one subjectNav holding
// ul.navTabs with the five page tabs followed by the right-aligned 加入收藏,
// 加入黑名单 and 收集 items.
const headerHtml = (navTabs = true) => `<div id="headerSubject" class="clearit">
<h1 class="nameSingle"><a href="/person/6447">人物</a></h1>
${navTabs ? `<div class="subjectNav">
<ul class="navTabs clearit">
<li><a href="/person/6447" class="focus">概览</a></li>
<li><a href="/person/6447/album">相册</a></li>
<li><a href="/person/6447/works">作品</a></li>
<li><a href="/person/6447/collabs">合作</a></li>
<li><a href="/person/6447/collections">收藏</a></li>
<li class="collect center"><span class="collect action"></span></li>
<li class="mark center"></li>
</ul>
</div>` : ''}
</div>`;

function mount(
  nav = '<div id="headerNeue2"><div class="idBadgerNeue"><a class="avatar" href="/user/current-user">Me</a></div></div>',
  url = 'https://bgm.tv/person/6447',
  navTabs = true,
) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${nav}${headerHtml(navTabs)}<main><a href="/user/not-current">评论用户</a></main></body></html>`, { url, runScripts: 'outside-only' });
  windows.push(dom);
  dom.window.eval(source());
  dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
  return dom.window;
}

type Mounted = ReturnType<typeof mount>;

function entry(window: Mounted) {
  return window.document.querySelector<HTMLLIElement>('#bgmss-person-entry');
}

function trigger(window: Mounted) {
  return window.document.querySelector<HTMLAnchorElement>('#bgmss-person-entry > a')!;
}

function typeLink(window: Mounted, type = 'anime') {
  return window.document.querySelector<HTMLAnchorElement>(`#bgmss-person-entry a[data-subject-type="${type}"]`);
}

afterEach(() => windows.splice(0).forEach(dom => dom.window.close()));

describe('Bangumi person userscript', () => {
  it.each(['bgm.tv', 'bangumi.tv', 'chii.in'])('adds one right-aligned entry to the existing tab row on %s', host => {
    const window = mount(undefined, `https://${host}/person/6447`);
    const item = entry(window);
    expect(item, 'a person-page entry must be installed').not.toBeNull();
    const tabs = window.document.querySelector('#headerSubject ul.navTabs')!;
    expect(item!.tagName).toBe('LI');
    expect(item!.parentElement).toBe(tabs);
    expect(tabs.lastElementChild).toBe(item);
    expect(trigger(window).textContent).toBe('在 Bangumi Staff Stats 中查看');
    // The removed block, its own action row and the standalone status row are gone.
    expect(window.document.querySelector('#headerSubject > #bgmss-person-entry')).toBeNull();
    expect(window.document.querySelector('.bgmss-entry-actions')).toBeNull();
    expect(window.document.querySelector('#bgmss-person-entry button')).toBeNull();
  });

  it('keeps every work type in one merged menu with anime first', () => {
    const window = mount();
    const menu = window.document.getElementById(trigger(window).getAttribute('aria-controls')!)!;
    expect(menu).toBe(window.document.querySelector('#bgmss-person-entry > ul'));
    expect([...menu.querySelectorAll<HTMLAnchorElement>('a[data-subject-type]')].map(link => link.dataset.subjectType)).toEqual(['anime', 'book', 'music', 'game', 'real']);
    expect([...menu.querySelectorAll<HTMLAnchorElement>('a[data-subject-type]')].map(link => link.textContent)).toEqual(['动画', '书籍', '音乐', '游戏', '三次元']);
    // Bangumi's .dropdown panel styles ul > li > a; the anchors must not be
    // direct children of the list or they render inline next to each other.
    for (const link of menu.querySelectorAll<HTMLAnchorElement>('a[data-subject-type]')) {
      expect(link.parentElement?.tagName).toBe('LI');
      expect(link.parentElement?.parentElement).toBe(menu);
    }
    const main = typeLink(window)!;
    const url = new URL(main.href);
    expect(url.origin + url.pathname).toBe('https://search.bgmss.fun/ranking');
    expect(Object.fromEntries(url.searchParams)).toEqual({ entry: 'bangumi-person', user: 'current-user', person: '6447', type: 'anime' });
    expect(main.rel).toContain('noopener');
    expect(main.rel).toContain('noreferrer');
    for (const type of ['book', 'music', 'game', 'real']) {
      const link = typeLink(window, type)!;
      expect(new URL(link.href).searchParams.get('type')).toBe(type);
      expect([...new URL(link.href).searchParams.keys()]).toEqual(['entry', 'user', 'person', 'type']);
    }
  });

  it('expands on activation and keeps the announced state with the panel class', () => {
    const window = mount();
    const button = trigger(window);
    const item = entry(window)!;
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(item.classList.contains('bgmss-open')).toBe(false);
    // Hovering is not activation: only the entry itself opens the menu.
    item.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(item.classList.contains('bgmss-open')).toBe(false);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(item.classList.contains('bgmss-open')).toBe(true);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(item.classList.contains('bgmss-open')).toBe(false);
  });

  it('closes on Escape with focus returned, on outside click, and opens on ArrowDown', () => {
    const window = mount();
    const button = trigger(window);
    const menu = window.document.getElementById(button.getAttribute('aria-controls')!)!;
    button.click();
    menu.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(entry(window)!.classList.contains('bgmss-open')).toBe(false);
    window.document.querySelector('main')!.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(window.document.activeElement).toBe(typeLink(window, 'anime'));
    // Keyboard activation toggles the same panel as a click: Enter closes the
    // menu ArrowDown opened, Space opens it again.
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('returns focus to the trigger when Escape closes an open menu', () => {
    const window = mount();
    const button = trigger(window);
    button.click();
    typeLink(window, 'book')!.focus();
    entry(window)!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(window.document.activeElement).toBe(button);
  });

  it('does not identify the user from person content while logged out', () => {
    const window = mount('<div id="dock"><a href="/login">登录</a></div>');
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    typeLink(window)!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(typeLink(window)!.hasAttribute('href')).toBe(false);
    expect(window.document.querySelector('[data-bgmss-status]')!.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
  });

  it.each([
    ['logged out', '<div id="dock"><a href="/login">登录</a></div>'],
    ['unknown', '<div id="dock"></div>'],
  ])('shows the login explanation inside the menu when identity is %s', (_state, nav) => {
    const window = mount(nav);
    const notice = window.document.querySelector<HTMLElement>('[data-bgmss-status]')!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toBe('登录 Bangumi 后可查看收藏参与作品');
    expect(notice.parentElement).toBe(window.document.getElementById(trigger(window).getAttribute('aria-controls')!));
    for (const type of ['anime', 'book', 'music', 'game', 'real']) {
      expect(typeLink(window, type)!.hasAttribute('href')).toBe(false);
      expect(typeLink(window, type)!.getAttribute('aria-disabled')).toBe('true');
    }
  });

  it('hides the login explanation and restores destinations once identity is known', () => {
    const window = mount('<div id="dock"><a href="/login">登录</a></div>');
    const notice = window.document.querySelector<HTMLElement>('[data-bgmss-status]')!;
    const button = trigger(window);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(notice.hidden).toBe(false);
    window.document.querySelector('#dock')!.innerHTML = '<a href="/user/current-user">Me</a>';
    button.click();
    expect(notice.hidden).toBe(true);
    expect(notice.textContent).toBe('');
    expect(new URL(typeLink(window)!.href).searchParams.get('user')).toBe('current-user');
  });

  it('fails closed on conflicting navigation identities or external profile URLs', () => {
    for (const nav of [
      '<div id="headerNeue2"><div class="idBadgerNeue"><a href="/user/alice">A</a></div></div><div id="dock"><a href="/user/bob">B</a></div>',
      '<div id="headerNeue2"><div class="idBadgerNeue"><a href="https://evil.invalid/user/alice">A</a></div></div>',
    ]) {
      const window = mount(nav);
      expect(entry(window)).not.toBeNull();
      expect(typeLink(window)!.hasAttribute('href')).toBe(false);
    }
  });

  it('supports dock identity and safely encodes UID without adding query fields', () => {
    const window = mount('<div id="dock"><a href="/user/a%26person%3D999">Me</a></div>');
    const url = new URL(typeLink(window)!.href);
    expect(url.searchParams.get('user')).toBe('a&person=999');
    expect(url.searchParams.getAll('person')).toEqual(['6447']);
  });

  it('rechecks login at activation and does not launch a stale identity', () => {
    const window = mount();
    window.document.querySelector('.idBadgerNeue')!.innerHTML = '<a href="/login">登录</a>';
    const event = new window.MouseEvent('click', { bubbles: true, cancelable: true });
    typeLink(window)!.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(typeLink(window)!.hasAttribute('href')).toBe(false);
    expect(entry(window)!.classList.contains('bgmss-open')).toBe(false);
  });

  it('is idempotent and leaves no partial entry without the tab row', () => {
    const window = mount();
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
    window.eval(source());
    // JSDOM may still report loading; execute the second installation callback.
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(window.document.querySelectorAll('#bgmss-person-entry')).toHaveLength(1);
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
    expect(window.document.querySelector('#headerSubject ul.navTabs')!.lastElementChild).toBe(entry(window));

    const withoutTabs = mount(undefined, 'https://bgm.tv/person/6447', false);
    expect(withoutTabs.document.querySelector('#bgmss-person-entry')).toBeNull();
    expect(withoutTabs.document.querySelectorAll('style')).toHaveLength(0);
  });

  it.each(['0', '01', '-1', '9007199254740992', '6447/works', '6447x'])('does not activate malformed or non-overview person path %s', id => {
    const window = mount(undefined, `https://bgm.tv/person/${id}`);
    expect(window.document.querySelector('#bgmss-person-entry')).toBeNull();
  });

  it('ships standards metadata limited to person pages without privileged grants', () => {
    expect(source()).toContain('// ==UserScript==');
    expect(source()).toContain('// @grant        none');
    // Bangumi's own .dropdown opens on hover; this entry must stay click-driven.
    expect(source()).toMatch(/li\.bgmss-person-entry:hover\s*>\s*ul/);
    expect(source()).not.toMatch(/@connect|document\.cookie|localStorage|GM_xmlhttpRequest/);
  });
});

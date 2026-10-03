import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
// Frozen published predecessor: exercises migration against its real anonymous
// listeners, structure and styles, rather than a mock of the new implementation.
const legacy = readFileSync(resolve(process.cwd(), 'tests/fixtures/bangumi-plugin-1.1.2.js'), 'utf8');

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
  script = source(),
) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${nav}${headerHtml(navTabs)}<main><a href="/user/not-current">评论用户</a></main></body></html>`, { url, runScripts: 'outside-only' });
  windows.push(dom);
  dom.window.eval(script);
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
  return window.document.querySelector<HTMLAnchorElement>(`#bgmss-person-entry-types a[data-subject-type="${type}"]`);
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
    expect(trigger(window).textContent).toBe('在 Bangumi Staff Stats 中查看 v1.1.3');
    expect(item!.dataset.bgmssVersion).toBe('1.1.3');
    // The removed block, its own action row and the standalone status row are gone.
    expect(window.document.querySelector('#headerSubject > #bgmss-person-entry')).toBeNull();
    expect(window.document.querySelector('.bgmss-entry-actions')).toBeNull();
    expect(window.document.querySelector('#bgmss-person-entry button')).toBeNull();
  });

  it('keeps every work type in one merged menu with anime first', () => {
    const window = mount();
    const menu = window.document.getElementById(trigger(window).getAttribute('aria-controls')!)!;
    expect(menu.parentElement?.id).toBe('bgmss-person-entry-layer');
    expect(menu.parentElement?.parentElement).toBe(window.document.body);
    expect([...menu.querySelectorAll<HTMLAnchorElement>('a[data-subject-type]')].map(link => link.dataset.subjectType)).toEqual(['anime', 'book', 'music', 'game', 'real']);
    expect([...menu.querySelectorAll<HTMLAnchorElement>('a[data-subject-type]')].map(link => link.textContent)).toEqual(['动画', '书籍', '音乐', '游戏', '三次元']);
    // Keep an accessible list with one full-width link per work type.
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
    expect(window.document.getElementById('bgmss-person-entry-types')!.hidden).toBe(true);
    expect(item.classList.contains('bgmss-open')).toBe(false);
    // Hovering is not activation: only the entry itself opens the menu.
    item.dispatchEvent(new window.MouseEvent('mouseenter', { bubbles: false }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(item.classList.contains('bgmss-open')).toBe(false);
    button.click();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(window.document.getElementById('bgmss-person-entry-types')!.hidden).toBe(false);
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

  it('takes over an open 1.1.2 entry, without removing another component or stylesheet', () => {
    const window = mount(undefined, undefined, true, legacy);
    const oldItem = entry(window)!;
    const oldTrigger = trigger(window);
    const oldStyle = window.document.querySelector('style')!;
    const other = window.document.createElement('li');
    other.id = 'another-component';
    oldItem.parentElement!.append(other);
    const otherStyle = window.document.createElement('style');
    otherStyle.textContent = '#another-component { color: red; }';
    window.document.head.append(otherStyle);
    oldTrigger.click();
    window.eval(source());
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(oldItem.isConnected).toBe(false);
    expect(oldTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(oldStyle.isConnected).toBe(false);
    expect(other.isConnected).toBe(true);
    expect(otherStyle.isConnected).toBe(true);
    expect(entry(window)!.dataset.bgmssVersion).toBe('1.1.3');
    trigger(window).click();
    window.document.dispatchEvent(new window.Event('scroll'));
    expect(trigger(window).getAttribute('aria-expanded')).toBe('true');
    expect(window.document.querySelectorAll('#bgmss-person-entry-types')).toHaveLength(1);
  });

  it('retains 1.1.3 when the legacy script runs later', () => {
    const window = mount();
    const item = entry(window);
    window.eval(legacy);
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(entry(window)).toBe(item);
    expect(window.document.querySelectorAll('#bgmss-person-entry-layer')).toHaveLength(1);
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
    trigger(window).click();
    expect(typeLink(window)!.getAttribute('href')).toContain('type=anime');
  });

  it('disposes registered listeners during an upgrade and never downgrades it', () => {
    const window = mount();
    const oldItem = entry(window)!;
    const oldTrigger = trigger(window);
    const oldLayer = window.document.getElementById('bgmss-person-entry-layer')!;
    const removedWindow = vi.spyOn(window, 'removeEventListener');
    const removedDocument = vi.spyOn(window.document, 'removeEventListener');
    window.eval(source().replaceAll('1.1.3', '1.1.4'));
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(oldItem.isConnected).toBe(false);
    expect(oldLayer.isConnected).toBe(false);
    oldTrigger.click();
    expect(oldTrigger.getAttribute('aria-expanded')).toBe('false');
    expect(removedWindow.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['resize', 'blur']));
    expect(removedDocument.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(['scroll', 'click', 'pointerdown', 'focusin']));
    const current = entry(window);
    window.eval(source());
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(entry(window)).toBe(current);
    expect(current!.dataset.bgmssVersion).toBe('1.1.4');
    expect(window.document.querySelectorAll('style')).toHaveLength(1);
  });

  it('does not remove an unrelated component with a colliding ID', () => {
    const window = mount(undefined, undefined, true, '');
    const collision = window.document.createElement('li');
    collision.id = 'bgmss-person-entry';
    collision.textContent = 'Other component';
    window.document.querySelector('.navTabs')!.append(collision);
    window.eval(source());
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(entry(window)).toBe(collision);
    expect(window.document.getElementById('bgmss-person-entry-layer')).toBeNull();
  });

  it('preserves Tab and Shift+Tab between the trigger and portaled menu', () => {
    const window = mount();
    const button = trigger(window);
    button.focus();
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    button.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(window.document.activeElement).toBe(typeLink(window));
    typeLink(window)!.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
    expect(window.document.activeElement).toBe(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
  });

  it('keeps focus inside the separate menu and ignores transient null focusout', () => {
    const window = mount();
    const button = trigger(window);
    button.focus();
    button.click();
    button.dispatchEvent(new window.FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(button.getAttribute('aria-expanded')).toBe('true');
    typeLink(window, 'book')!.focus();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    typeLink(window, 'music')!.focus();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    window.document.querySelector<HTMLAnchorElement>('main a')!.focus();
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.click();
    window.document.querySelector('main')!.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });

  it.each(['0', '01', '-1', '9007199254740992', '6447/works', '6447x'])('does not activate malformed or non-overview person path %s', id => {
    const window = mount(undefined, `https://bgm.tv/person/${id}`);
    expect(window.document.querySelector('#bgmss-person-entry')).toBeNull();
  });

  it('ships standards metadata for person and user pages without privileged grants', () => {
    expect(source()).toContain('// ==UserScript==');
    expect(source()).toContain('// @grant        none');
    expect(source()).toContain('// @version      1.1.3');
    expect(source()).toContain("const VERSION = '1.1.3'");
    expect(source()).not.toMatch(/@connect|document\.cookie|localStorage|GM_xmlhttpRequest/);
  });
});

describe('Bangumi user profile userscript regression', () => {
  function profile(url: string, services = true) {
    const dom = new JSDOM(`<html><head></head><body><div id="dock"><a href="/user/viewer">Me</a></div>${services ? '<ul class="network_service"><li>Existing service</li></ul>' : ''}</body></html>`, { url, runScripts: 'outside-only' });
    windows.push(dom);
    dom.window.eval(source());
    dom.window.document.dispatchEvent(new dom.window.Event('DOMContentLoaded'));
    return dom.window;
  }

  it.each(['bgm.tv', 'bangumi.tv', 'chii.in'])('restores the viewed profile service on %s', host => {
    expect(source()).toContain(`// @match        https://${host}/user/*`);
    const window = profile(`https://${host}/user/profile-owner?ignored=value`);
    const item = window.document.querySelector('#bgmss-user-entry')!;
    expect(item.parentElement!.matches('ul.network_service')).toBe(true);
    expect(item.querySelector('.service')!.textContent).toBe('BangumiStaffStats');
    const link = item.querySelector('a')!;
    expect(link.textContent).toBe('Staff 数据统计');
    expect(link.href).toBe('https://search.bgmss.fun/?user=profile-owner');
    expect(link.target).toBe('_blank');
    expect(window.document.querySelector('#bgmss-person-entry')).toBeNull();
    window.eval(source());
    window.document.dispatchEvent(new window.Event('DOMContentLoaded'));
    expect(window.document.querySelectorAll('#bgmss-user-entry')).toHaveLength(1);
    expect(window.document.querySelectorAll('.network_service > li')).toHaveLength(2);
  });

  it('works without login and encodes the profile ID as one parameter', () => {
    const window = profile('https://bgm.tv/user/a%26person%3D999/');
    window.document.querySelector('#dock')!.remove();
    const url = new URL(window.document.querySelector<HTMLAnchorElement>('#bgmss-user-entry a')!.href);
    expect([...url.searchParams]).toEqual([['user', 'a&person=999']]);
  });

  it('leaves other pages and missing service lists untouched', () => {
    for (const path of ['/user/', '/user/name/blog', '/user/%ZZ', '/user/%00']) {
      expect(profile(`https://bgm.tv${path}`).document.querySelector('#bgmss-user-entry')).toBeNull();
    }
    expect(profile('https://bgm.tv/user/name', false).document.querySelector('#bgmss-user-entry')).toBeNull();
  });
});

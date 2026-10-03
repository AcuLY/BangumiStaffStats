// ==UserScript==
// @name         Bangumi Staff Stats · 人物收藏参与作品
// @namespace    https://github.com/AcuLY/BangumiStaffStats
// @version      1.1.5
// @description  在用户主页查看 Staff 数据统计；在人物页导航行查看当前登录用户收藏中的参与作品。
// @match        https://bgm.tv/person/*
// @match        https://bangumi.tv/person/*
// @match        https://chii.in/person/*
// @match        https://bgm.tv/user/*
// @match        https://bangumi.tv/user/*
// @match        https://chii.in/user/*
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Extend Bangumi's own person header navigation row, not its visual identity:
  // one right-aligned item grouped with 加入收藏 opens the work-type menu. No
  // separate injected block, no credentials, statistics or saved filters.
  const hosts = new Set(['bgm.tv', 'bangumi.tv', 'chii.in']);
  if (location.protocol !== 'https:' || !hosts.has(location.hostname) || window.top !== window.self) return;

  // Preserve the original profile service link: this is the viewed user's ID,
  // independent of login. The ordinary user parameter only prefills the app.
  const profile = /^\/user\/([^/]+)\/?$/.exec(location.pathname);
  if (profile) {
    let uid;
    try { uid = decodeURIComponent(profile[1]); } catch { return; }
    if (!uid || /\p{Cc}/u.test(uid) || [...uid].length > 256 || new Blob([uid]).size > 256) return;
    function installProfile() {
      const services = document.querySelector('ul.network_service');
      if (!services || document.getElementById('bgmss-user-entry')) return;
      const item = document.createElement('li');
      item.id = 'bgmss-user-entry';
      const badge = document.createElement('span');
      badge.className = 'service';
      badge.style.backgroundColor = '#FF4573';
      badge.textContent = 'BangumiStaffStats';
      const link = document.createElement('a');
      const url = new URL('https://search.bgmss.fun/');
      url.searchParams.set('user', uid);
      link.href = url.href;
      link.target = '_blank';
      link.className = 'l';
      link.rel = 'me noopener noreferrer';
      link.textContent = 'Staff 数据统计';
      item.append(badge, ' ', link);
      services.append(item);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installProfile, { once: true });
    else installProfile();
    return;
  }
  const person = /^\/person\/([1-9][0-9]*)\/?$/.exec(location.pathname)?.[1];
  if (location.protocol !== 'https:' || !hosts.has(location.hostname) ||
      !person || !Number.isSafeInteger(Number(person)) || window.top !== window.self) return;

  const ENTRY_ID = 'bgmss-person-entry';
  const MENU_ID = 'bgmss-person-entry-types';
  const LAYER_ID = 'bgmss-person-entry-layer';
  const VERSION = '1.1.5';
  const OWNER = 'bangumi-staff-stats/person-entry';
  const INSTANCE = Symbol.for(OWNER);
  const ENTRY_LABEL = '在 Bangumi Staff Stats 中查看';
  const LOGIN_NOTICE = '登录 Bangumi 后可查看收藏参与作品';
  // 动画 stays first; the four remaining types keep the previous menu's order.
  const subjectTypes = [['anime', '动画'], ['book', '书籍'], ['music', '音乐'], ['game', '游戏'], ['real', '三次元']];

  function replacePrevious(existing) {
    const previous = existing[INSTANCE];
    if (existing.dataset.bgmssOwner === OWNER && previous?.dispose) {
      if (!/^\d+\.\d+\.\d+$/.test(previous.version)) return false;
      const before = previous.version.split('.').map(Number);
      const after = VERSION.split('.').map(Number);
      const different = before.findIndex((value, index) => value !== after[index]);
      if (different === -1 || before[different] > after[different]) return false;
      previous.dispose();
      return true;
    }
    // Pre-1.1.3 had no disposer. Recognize our exact old structure, never an
    // arbitrary ID collision. Close it before detaching so its anonymous global
    // listeners only retain an inert, closed node; do not intercept host events.
    const oldTrigger = existing.firstElementChild;
    const oldMenu = existing.querySelector(`ul#${MENU_ID}`);
    const oldLinks = oldMenu?.querySelectorAll('a[data-subject-type]');
    if (existing.tagName !== 'LI' || !existing.classList.contains('bgmss-person-entry') ||
        oldTrigger?.tagName !== 'A' || oldTrigger.textContent !== ENTRY_LABEL ||
        oldTrigger.getAttribute('aria-controls') !== MENU_ID || oldLinks?.length !== subjectTypes.length ||
        !subjectTypes.every(([type, label], index) => oldLinks[index].dataset.subjectType === type && oldLinks[index].textContent === label)) return false;
    if (oldTrigger.getAttribute('aria-expanded') === 'true') oldTrigger.click();
    existing.remove();
    for (const style of document.querySelectorAll('style')) {
      const text = style.textContent.trim();
      if (!text.startsWith('/* Keep the panel readable independently of native hover-only child styles.') &&
          !text.startsWith('/* The .bgmss-open rule must stay after the :hover rule:')) continue;
      const ownedRules = rules => rules.length > 0 && [...rules].every(rule =>
        rule.selectorText ? rule.selectorText.replace(/:is\([^)]*\)/g, '').split(',').every(selector => {
          const local = selector.trim().replace(/^html\[data-theme=["']?dark["']?\]\s+/, '');
          return /^#headerSubject \.navTabs > li\.bgmss-person-entry(?=[\s.:#\[>]|$)/.test(local);
        }) : rule.cssRules ? ownedRules(rule.cssRules) : false);
      if (style.sheet && ownedRules(style.sheet.cssRules)) style.remove();
    }
    return true;
  }

  function loggedInUID() {
    // Only Bangumi's authenticated navigation landmarks are identity sources.
    // Never scan profile headings, comments, collection lists or arbitrary links.
    const roots = document.querySelectorAll('#headerNeue2 .idBadgerNeue, #dock');
    const ids = new Set();
    let guest = false;
    for (const root of roots) {
      for (const anchor of root.querySelectorAll('a[href]')) {
        try {
          const url = new URL(anchor.getAttribute('href'), location.origin);
          if (url.protocol !== 'https:' || !hosts.has(url.hostname) || url.username || url.password || url.port) continue;
          if (/^\/login\/?$/.test(url.pathname)) guest = true;
          const match = /^\/user\/([^/]+)\/?$/.exec(url.pathname);
          if (!match || url.search || url.hash) continue;
          const uid = decodeURIComponent(match[1]);
          if (!uid || /\p{Cc}/u.test(uid) || [...uid].length > 256 || new Blob([uid]).size > 256) continue;
          ids.add(uid);
        } catch {
          // Invalid navigation URLs are not evidence of a logged-in identity.
        }
      }
    }
    return !guest && ids.size === 1 ? [...ids][0] : null;
  }

  function install() {
    // The entry lives inside Bangumi's own tab row; without that row there is
    // no place for it and no partial structure is injected.
    const tabs = document.querySelector('#headerSubject ul.navTabs');
    if (!tabs) return;
    const previous = document.getElementById(ENTRY_ID);
    if (previous && !replacePrevious(previous)) return;
    // A conflicting mount not owned by the replaced instance is not ours to remove.
    if (document.getElementById(LAYER_ID) || document.getElementById(MENU_ID)) return;
    const cleanups = [];
    const listen = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      cleanups.push(() => target.removeEventListener(type, handler, options));
    };

    const item = document.createElement('li');
    item.id = ENTRY_ID;
    item.dataset.bgmssOwner = OWNER;
    item.dataset.bgmssVersion = VERSION;
    // Keep the native tab; its menu is mounted outside clipping ancestors.
    item.className = 'dropdown bgmss-person-entry';

    const trigger = document.createElement('a');
    trigger.setAttribute('role', 'button');
    trigger.tabIndex = 0;
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', MENU_ID);
    trigger.textContent = ENTRY_LABEL;

    const layer = document.createElement('div');
    layer.id = LAYER_ID;
    layer.dataset.bgmssOwner = OWNER;
    layer.hidden = true;

    const panel = document.createElement('ul');
    panel.id = MENU_ID;
    panel.hidden = true;
    panel.setAttribute('aria-label', '作品类型');

    const notice = document.createElement('li');
    notice.className = 'bgmss-entry-notice';
    notice.dataset.bgmssStatus = '';
    notice.setAttribute('role', 'status');
    notice.setAttribute('aria-live', 'polite');
    notice.hidden = true;
    panel.append(notice);

    const links = [];
    let opened = false;
    const contains = target => target instanceof Node && (item.contains(target) || layer.contains(target));

    function refreshLinks() {
      const uid = loggedInUID();
      for (const link of links) {
        if (uid) {
          const url = new URL('https://search.bgmss.fun/ranking');
          url.searchParams.set('entry', 'bangumi-person');
          url.searchParams.set('user', uid);
          url.searchParams.set('person', person);
          url.searchParams.set('type', link.dataset.subjectType);
          link.href = url.href;
          link.removeAttribute('aria-disabled');
        } else {
          link.removeAttribute('href');
          link.setAttribute('aria-disabled', 'true');
        }
      }
      notice.textContent = uid ? '' : LOGIN_NOTICE;
      notice.hidden = Boolean(uid);
      return Boolean(uid);
    }

    function positionPanel() {
      if (!opened) return;
      // Fixed coordinates escape the horizontally scrolling native tab row.
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? document.documentElement.clientWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
      const topEdge = (viewport?.offsetTop ?? 0) + 8;
      const anchor = trigger.getBoundingClientRect();
      panel.style.maxHeight = `${Math.max(0, viewportHeight - 16)}px`;
      panel.style.maxWidth = `${Math.max(0, viewportWidth - 16)}px`;
      const bounds = panel.getBoundingClientRect();
      const rightLimit = leftEdge + viewportWidth - 16 - bounds.width;
      const bottomLimit = topEdge + viewportHeight - 16 - bounds.height;
      panel.style.left = `${Math.max(leftEdge, Math.min(anchor.right - bounds.width, rightLimit))}px`;
      const top = anchor.bottom <= bottomLimit
        ? anchor.bottom
        : anchor.top - bounds.height;
      panel.style.top = `${Math.max(topEdge, Math.min(top, bottomLimit))}px`;
    }

    function setOpen(next, restoreFocus = false) {
      opened = next;
      layer.hidden = !opened;
      panel.hidden = !opened;
      item.classList.toggle('bgmss-open', opened);
      trigger.setAttribute('aria-expanded', String(opened));
      positionPanel();
      if (!opened && restoreFocus) trigger.focus();
    }

    function makeLink(type, label) {
      const link = document.createElement('a');
      link.dataset.subjectType = type;
      link.textContent = label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.tabIndex = 0;
      function activate(event) {
        // Identity is re-checked at activation so a stale menu never launches.
        const known = refreshLinks();
        if (!known) event.preventDefault();
        setOpen(false, !known);
      }
      listen(link, 'click', activate);
      listen(link, 'auxclick', activate);
      listen(link, 'contextmenu', () => refreshLinks());
      listen(link, 'keydown', event => {
        // An anchor without href stays keyboard-reachable to explain login.
        if (event.key === 'Enter' && !link.hasAttribute('href')) {
          event.preventDefault();
          link.click();
        }
      });
      links.push(link);
      return link;
    }

    for (const [type, label] of subjectTypes) {
      const option = document.createElement('li');
      option.append(makeLink(type, label));
      panel.append(option);
    }
    item.append(trigger);
    layer.append(panel);

    listen(trigger, 'click', event => {
      event.preventDefault();
      refreshLinks();
      setOpen(!opened);
    });
    listen(trigger, 'keydown', event => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        refreshLinks();
        setOpen(!opened);
      } else if (event.key === 'ArrowDown' || (event.key === 'Tab' && opened && !event.shiftKey)) {
        event.preventDefault();
        refreshLinks();
        setOpen(true);
        panel.querySelector('a')?.focus();
      }
    });
    const escape = event => {
      if (event.key === 'Escape' && opened) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false, true);
      }
    };
    listen(item, 'keydown', escape);
    listen(layer, 'keydown', escape);
    listen(layer, 'keydown', event => {
      if (event.key === 'Tab' && event.shiftKey && event.target === links[0]) {
        event.preventDefault();
        trigger.focus();
      }
    });
    const dismissOutside = event => { if (opened && !contains(event.target)) setOpen(false); };
    listen(document, 'pointerdown', dismissOutside);
    listen(document, 'click', dismissOutside);
    // Observe the destination, not focusout.relatedTarget=null during a touch.
    // This also treats the portaled links as part of the same keyboard surface.
    listen(document, 'focusin', dismissOutside);
    listen(window, 'blur', () => setOpen(false));

    listen(window, 'resize', positionPanel);
    listen(document, 'scroll', positionPanel, { capture: true, passive: true });
    if (window.visualViewport) {
      listen(window.visualViewport, 'resize', positionPanel);
      listen(window.visualViewport, 'scroll', positionPanel);
    }

    const style = document.createElement('style');
    style.dataset.bgmssOwner = OWNER;
    style.textContent = `
/* Menu rows and links own their colors; host list colors must not leak in.
   Only the native trigger stays in the tab row. The owned layer is independent
   of its overflow, transforms and backdrop compositing. */
#bgmss-person-entry-layer { all: initial; position: fixed; inset: 0; z-index: 2147483000; pointer-events: none; isolation: isolate; }
#bgmss-person-entry-layer, #bgmss-person-entry-layer * { box-sizing: border-box; opacity: 1 !important; visibility: visible !important; -webkit-text-fill-color: currentColor !important; text-shadow: none; }
#bgmss-person-entry-layer[hidden], #bgmss-person-entry-layer [hidden] { display: none !important; }
#bgmss-person-entry-layer > ul { all: initial; box-sizing: border-box; position: fixed; display: block; pointer-events: auto; width: max-content; min-width: 140px; max-width: calc(100vw - 16px); overflow: auto; overscroll-behavior: contain; margin: 0; padding: 8px; border: 1px solid #ddd; border-radius: 15px; box-shadow: 0 5px 20px #0002; background: #fefefe; color: #555 !important; font: 14px/1.5 system-ui, sans-serif; }
#bgmss-person-entry-layer > ul > li { all: unset; display: block; color: #555 !important; }
#bgmss-person-entry-layer > ul > li > a { all: unset; box-sizing: border-box; display: block; min-height: 44px; padding: 10px 14px; line-height: 24px; color: #555 !important; white-space: nowrap; cursor: pointer; border-radius: 8px; }
#bgmss-person-entry-layer > ul > li > a:is(:hover, :focus-visible) { color: #1673b8 !important; background: #edf5fc; }
#bgmss-person-entry-layer > ul > li > a:focus-visible { outline: 2px solid #1673b8; outline-offset: -2px; }
#bgmss-person-entry-layer > ul > li.bgmss-entry-notice { display: block; padding: 8px 14px; font-size: 13px; line-height: 1.4; max-width: 224px; white-space: normal; }
#bgmss-person-entry-layer > ul > li > a[aria-disabled="true"] { cursor: help; }
html[data-theme="dark"] #bgmss-person-entry-layer > ul { background: #333; color: #eee !important; border-color: #555; }
html[data-theme="dark"] #bgmss-person-entry-layer > ul > li, html[data-theme="dark"] #bgmss-person-entry-layer > ul > li > a { color: #eee !important; }
html[data-theme="dark"] #bgmss-person-entry-layer > ul > li > a:is(:hover, :focus-visible) { color: #8dccff !important; background: #454545; }
html[data-theme="dark"] #bgmss-person-entry-layer > ul > li > a:focus-visible { outline-color: #8dccff; }
@media (max-width: 640px) { #bgmss-person-entry-layer > ul { width: min(240px, calc(100vw - 16px)); } }
`;
    item[INSTANCE] = {
      version: VERSION,
      dispose() {
        setOpen(false);
        for (const cleanup of cleanups.splice(0)) cleanup();
        item.remove();
        layer.remove();
        style.remove();
      },
    };
    document.head.append(style);
    tabs.append(item);
    document.body.append(layer);
    refreshLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

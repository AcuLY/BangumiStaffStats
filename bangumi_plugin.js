// ==UserScript==
// @name         Bangumi Staff Stats · 人物收藏参与作品
// @namespace    https://github.com/AcuLY/BangumiStaffStats
// @version      1.0.0
// @description  在人物页查看当前登录用户收藏中的参与作品；默认动画，支持其他单一作品类型。
// @match        https://bgm.tv/person/*
// @match        https://bangumi.tv/person/*
// @match        https://chii.in/person/*
// @run-at       document-end
// @grant        none
// @noframes
// ==/UserScript==

(() => {
  'use strict';

  // Extend Bangumi's existing person header, not its visual identity.
  // One native-style primary link opens anime; an adjacent disclosure exposes
  // four other single-type links. No credentials, statistics or saved filters.
  const hosts = new Set(['bgm.tv', 'bangumi.tv', 'chii.in']);
  const person = /^\/person\/([1-9][0-9]*)\/?$/.exec(location.pathname)?.[1];
  if (location.protocol !== 'https:' || !hosts.has(location.hostname) ||
      !person || !Number.isSafeInteger(Number(person)) || window.top !== window.self) return;

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
    const header = document.querySelector('#headerSubject');
    if (!header || document.getElementById('bgmss-person-entry')) return;

    const root = document.createElement('div');
    root.id = 'bgmss-person-entry';
    root.setAttribute('aria-label', 'Bangumi Staff Stats');
    const row = document.createElement('div');
    row.className = 'bgmss-entry-actions';
    const links = [];
    const status = document.createElement('span');
    status.dataset.bgmssStatus = '';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'chiiBtn';
    toggle.textContent = '其他作品类型 ▾';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', 'bgmss-person-entry-types');
    const panel = document.createElement('div');
    panel.id = 'bgmss-person-entry-types';
    panel.hidden = true;
    panel.setAttribute('aria-label', '其他作品类型');

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
      status.textContent = !uid ? '登录 Bangumi 后可查看收藏参与作品' : '';
      return Boolean(uid);
    }

    function closeMenu(restoreFocus = false) {
      panel.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
      if (restoreFocus) toggle.focus();
    }

    function makeLink(type, label) {
      const link = document.createElement('a');
      link.className = 'chiiBtn';
      link.dataset.subjectType = type;
      link.textContent = label;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.tabIndex = 0;
      function activate(event) {
        if (!refreshLinks()) event.preventDefault();
        if (type !== 'anime') closeMenu(true);
      }
      link.addEventListener('click', activate);
      link.addEventListener('auxclick', activate);
      link.addEventListener('contextmenu', () => refreshLinks());
      link.addEventListener('keydown', event => {
        // An anchor without href stays keyboard-reachable to explain login.
        if (event.key === 'Enter' && !link.hasAttribute('href')) {
          event.preventDefault();
          link.click();
        }
      });
      links.push(link);
      return link;
    }

    row.append(makeLink('anime', '查看我的收藏参与作品'), toggle);
    for (const [type, label] of [['book', '书籍'], ['music', '音乐'], ['game', '游戏'], ['real', '三次元']]) {
      panel.append(makeLink(type, label));
    }
    toggle.addEventListener('click', () => {
      refreshLinks();
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
    });
    toggle.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        refreshLinks();
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        panel.querySelector('a')?.focus();
      }
    });
    root.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu(true);
      }
    });
    root.addEventListener('focusout', event => {
      if (!root.contains(event.relatedTarget)) closeMenu();
    });
    document.addEventListener('click', event => {
      if (!root.contains(event.target)) closeMenu();
    });
    row.append(panel);
    root.append(status, row);

    const style = document.createElement('style');
    style.textContent = `
#bgmss-person-entry { box-sizing: border-box; width: 100%; max-width: 1200px; margin: 8px auto; padding: 0 10px; font: inherit; color-scheme: light dark; }
#bgmss-person-entry .bgmss-entry-actions { position: relative; display: flex; width: fit-content; max-width: 100%; flex-wrap: wrap; align-items: center; gap: 4px; }
#bgmss-person-entry .chiiBtn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; min-height: 44px; max-width: 100%; margin: 0; padding: 0 10px; font: inherit; line-height: 1.5; white-space: normal; cursor: pointer; }
#bgmss-person-entry button.chiiBtn { appearance: none; border: 1px solid #ddd; border-radius: 20px; background: linear-gradient(#fff, #fafafa); color: #666; box-shadow: 0 1px 2px #eee, inset 0 1px 1px #fff; }
html[data-theme="dark"] #bgmss-person-entry button.chiiBtn { border-color: #6e6e6e; background: linear-gradient(#767677, #747474); color: #d8d8d8; box-shadow: 0 1px 2px #393939, inset 0 1px 1px #7c7c7c; }
#bgmss-person-entry button.chiiBtn:hover { filter: brightness(0.96); }
#bgmss-person-entry .chiiBtn:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
#bgmss-person-entry a[aria-disabled="true"] { cursor: help; }
#bgmss-person-entry-types { position: absolute; z-index: 20; right: 0; top: 100%; display: grid; min-width: 120px; max-width: 100%; padding: 4px; background: Canvas; color: CanvasText; border: 1px solid GrayText; border-radius: 6px; }
#bgmss-person-entry-types[hidden] { display: none; }
#bgmss-person-entry-types .chiiBtn { justify-content: flex-start; }
#bgmss-person-entry [data-bgmss-status]:not(:empty) { display: block; margin-bottom: 4px; }
html[data-theme="light"] #bgmss-person-entry { color-scheme: light; }
html[data-theme="dark"] #bgmss-person-entry { color-scheme: dark; }
`;
    document.head.append(style);
    header.insertBefore(root, header.querySelector('.subjectNav'));
    refreshLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

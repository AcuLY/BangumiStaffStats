// ==UserScript==
// @name         Bangumi Staff Stats · 人物收藏参与作品
// @namespace    https://github.com/AcuLY/BangumiStaffStats
// @version      1.1.0
// @description  在人物页导航行查看当前登录用户收藏中的参与作品；一个入口展开动画、书籍、音乐、游戏和三次元。
// @match        https://bgm.tv/person/*
// @match        https://bangumi.tv/person/*
// @match        https://chii.in/person/*
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
  const person = /^\/person\/([1-9][0-9]*)\/?$/.exec(location.pathname)?.[1];
  if (location.protocol !== 'https:' || !hosts.has(location.hostname) ||
      !person || !Number.isSafeInteger(Number(person)) || window.top !== window.self) return;

  const ENTRY_ID = 'bgmss-person-entry';
  const MENU_ID = 'bgmss-person-entry-types';
  const ENTRY_LABEL = '在 Bangumi Staff Stats 中查看';
  const LOGIN_NOTICE = '登录 Bangumi 后可查看收藏参与作品';
  // 动画 stays first; the four remaining types keep the previous menu's order.
  const subjectTypes = [['anime', '动画'], ['book', '书籍'], ['music', '音乐'], ['game', '游戏'], ['real', '三次元']];

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
    if (!tabs || document.getElementById(ENTRY_ID)) return;

    const item = document.createElement('li');
    item.id = ENTRY_ID;
    // Native Bangumi classes give the tab and its panel the existing look:
    // .navTabs > li > a for the trigger and .dropdown ul for the menu.
    item.className = 'dropdown bgmss-person-entry';

    const trigger = document.createElement('a');
    trigger.setAttribute('role', 'button');
    trigger.tabIndex = 0;
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', MENU_ID);
    trigger.textContent = ENTRY_LABEL;

    const panel = document.createElement('ul');
    panel.id = MENU_ID;
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

    function setOpen(next, restoreFocus = false) {
      opened = next;
      item.classList.toggle('bgmss-open', opened);
      trigger.setAttribute('aria-expanded', String(opened));
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

    for (const [type, label] of subjectTypes) {
      // Bangumi's .dropdown panel styles its options as ul > li > a; without the
      // list item the anchors lay out inline instead of one row per work type.
      const option = document.createElement('li');
      option.append(makeLink(type, label));
      panel.append(option);
    }
    item.append(trigger, panel);

    trigger.addEventListener('click', event => {
      event.preventDefault();
      refreshLinks();
      setOpen(!opened);
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
        event.preventDefault();
        refreshLinks();
        setOpen(!opened);
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        refreshLinks();
        setOpen(true);
        panel.querySelector('a')?.focus();
      }
    });
    item.addEventListener('keydown', event => {
      if (event.key === 'Escape' && opened) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false, true);
      }
    });
    item.addEventListener('focusout', event => {
      if (!item.contains(event.relatedTarget)) setOpen(false);
    });
    document.addEventListener('click', event => {
      if (!item.contains(event.target)) setOpen(false);
    });

    const style = document.createElement('style');
    style.textContent = `
/* The .bgmss-open rule must stay after the :hover rule: both have the same
   specificity, so source order is what keeps a clicked-open menu open. */
#headerSubject .navTabs > li.bgmss-person-entry:hover > ul { visibility: hidden; opacity: 0; z-index: -1; }
#headerSubject .navTabs > li.bgmss-person-entry.bgmss-open > ul { position: absolute; visibility: visible; opacity: 1; display: block; z-index: 99; }
@media (max-width: 640px) { #headerSubject .navTabs > li.bgmss-person-entry.bgmss-open > ul { position: fixed; } }
#headerSubject .navTabs > li.bgmss-person-entry > ul > li.bgmss-entry-notice { padding: 8px 14px; color: #888; font-size: 13px; line-height: 1.4; max-width: 200px; white-space: normal; }
html[data-theme="dark"] #headerSubject .navTabs > li.bgmss-person-entry > ul > li.bgmss-entry-notice { color: #bbbbbb; }
#headerSubject .navTabs > li.bgmss-person-entry > ul > li > a[aria-disabled="true"] { cursor: help; }
`;
    document.head.append(style);
    tabs.append(item);
    refreshLinks();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();

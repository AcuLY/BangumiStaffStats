import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';

import { requireCanonicalPath } from '../lib/paths.mjs';
import { sha256File } from '../lib/seal.mjs';

const FIXED_CLOCK_EPOCH_MS = Date.UTC(2025, 0, 15, 4, 5, 6);
const MATRIX_CELL_ID =
  /^browser\.(?:light|dark)\.(?:360|390|779|780|1024|1440)\.(?:default|reduced)$/u;
const AUXILIARY_CELL_IDS = new Set([
  'browser.ranking-probe',
  'browser.safe-image',
  'browser.shared-journey',
]);
const SAFE_IMAGE_PATH =
  /^\/api\/v1\/images\/bangumi\/(?:characters|persons|subjects)\/[1-9][0-9]*\?type=(?:common|grid|large|medium|small)$/u;
const API_POST_PATHS = new Set([
  '/api/v1/candidates',
  '/api/v1/co-star',
  '/api/v1/partners',
  '/api/v1/person-detail',
  '/api/v1/rankings',
]);
const THEME_STORAGE_ACTIONS = new Set([
  'clear',
  'getItem',
  'key',
  'named-delete',
  'named-descriptor',
  'named-define',
  'named-get',
  'named-has',
  'named-set',
  'ownKeys',
  'removeItem',
  'setItem',
]);
const THEME_STORAGE_ENUMERATION_ACTIONS = new Set([
  'clear',
  'key',
  'ownKeys',
]);

export class BrowserRuntimeError extends Error {}

function fail(message) {
  throw new BrowserRuntimeError(message);
}

let hostTemporaryEnvironmentInUse = false;

function temporaryResidue(root) {
  if (!fs.existsSync(root)) return new Set();
  return new Set(
    fs.readdirSync(root).filter((name) =>
      /^(?:playwright|pw)[._-]/iu.test(name)),
  );
}

export async function withRunOwnedHostTemporaryEnvironment({
  runRoot,
  callback,
}) {
  if (typeof callback !== 'function') fail('host temporary callback is missing');
  if (hostTemporaryEnvironmentInUse) {
    fail('concurrent Playwright host temporary mutation is forbidden');
  }
  const root = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const hostTemporaryRoot = path.join(root, 'browser', 'host-tmp');
  if (fs.existsSync(hostTemporaryRoot)) {
    fail('Playwright host temporary root already exists');
  }
  fs.mkdirSync(hostTemporaryRoot, { recursive: true, mode: 0o700 });
  const originalTemporaryRoot = requireCanonicalPath(
    fs.realpathSync.native(os.tmpdir()),
    {
    label: 'original host temporary root',
    type: 'directory',
    },
  );
  const originalResidue = temporaryResidue(originalTemporaryRoot);
  const previous = new Map(
    ['TMPDIR', 'TMP', 'TEMP'].map((name) => [
      name,
      Object.hasOwn(process.env, name) ? process.env[name] : undefined,
    ]),
  );
  hostTemporaryEnvironmentInUse = true;
  for (const name of previous.keys()) process.env[name] = hostTemporaryRoot;
  try {
    const value = await callback(hostTemporaryRoot);
    return Object.freeze({
      hostTemporaryRoot,
      originalResidue,
      originalTemporaryRoot,
      value,
    });
  } catch (error) {
    try {
      verifyPlaywrightHostTemporaryResidue({
        hostTemporaryRoot,
        originalResidue,
        originalTemporaryRoot,
      });
    } catch (residueError) {
      fail(
        `Playwright launch failed and left host residue: ${normalizeFailureText(error)}; ${normalizeFailureText(residueError)}`,
      );
    }
    throw error;
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    hostTemporaryEnvironmentInUse = false;
  }
}

export function verifyPlaywrightHostTemporaryResidue(record) {
  if (
    !record ||
    !(record.originalResidue instanceof Set) ||
    typeof record.hostTemporaryRoot !== 'string' ||
    typeof record.originalTemporaryRoot !== 'string'
  ) {
    fail('Playwright host temporary record is invalid');
  }
  const currentOriginal = temporaryResidue(record.originalTemporaryRoot);
  const unexpectedGlobal = [...currentOriginal].filter(
    (name) => !record.originalResidue.has(name),
  );
  const owned = fs.existsSync(record.hostTemporaryRoot)
    ? fs.readdirSync(record.hostTemporaryRoot)
    : [];
  if (unexpectedGlobal.length > 0 || owned.length > 0) {
    fail(
      `Playwright host temporary residue remains: global=${unexpectedGlobal.length} owned=${owned.length}`,
    );
  }
  return Object.freeze({
    globalEntries: 0,
    ownedEntries: 0,
  });
}

function normalizeFailureText(value) {
  return String(value ?? 'unknown')
    .replaceAll(/[\r\n\t]+/gu, ' ')
    .replaceAll(/\s{2,}/gu, ' ')
    .slice(0, 256);
}

function pathAndQuery(reference) {
  const url = new URL(reference);
  return `${url.pathname}${url.search}`;
}

export function loadRunOwnedPlaywright({
  playwrightPackageRoot,
  runRoot,
}) {
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const packageRoot = requireCanonicalPath(playwrightPackageRoot, {
    below: canonicalRunRoot,
    label: 'run-owned Playwright package root',
    type: 'directory',
  });
  const manifestPath = requireCanonicalPath(
    path.join(packageRoot, 'package.json'),
    {
      below: packageRoot,
      label: 'run-owned Playwright package manifest',
      type: 'file',
    },
  );
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    fail(`run-owned Playwright package manifest is invalid: ${error.message}`);
  }
  if (
    manifest.name !== '@playwright/test' ||
    manifest.version !== '1.61.0'
  ) {
    fail('run-owned Playwright package identity is not accepted');
  }
  let loaded;
  try {
    const loader = createRequire(manifestPath);
    const resolved = requireCanonicalPath(loader.resolve(packageRoot), {
      below: packageRoot,
      label: 'run-owned Playwright package entry',
      type: 'file',
    });
    loaded = loader(resolved);
  } catch (error) {
    fail(`run-owned Playwright package could not be loaded: ${error.message}`);
  }
  if (loaded.chromium === null || typeof loaded.chromium !== 'object') {
    fail('run-owned Playwright package does not export Chromium');
  }
  return loaded;
}

export function requireRunOwnedChromiumExecutable({
  executablePath,
  runRoot,
}) {
  const canonicalRunRoot = requireCanonicalPath(runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const executable = requireCanonicalPath(executablePath, {
    below: canonicalRunRoot,
    label: 'run-owned Chromium executable',
    type: 'file',
  });
  const information = fs.statSync(executable);
  if ((information.mode & 0o111) === 0) {
    fail('run-owned Chromium executable is not executable');
  }
  if (information.nlink !== 1) {
    fail('run-owned Chromium executable must have exactly one filesystem link');
  }
  return executable;
}

export async function launchAcceptedChromium({
  executablePath,
  expectedVersion,
  playwrightPackageRoot,
  runRoot,
}) {
  const executable = requireRunOwnedChromiumExecutable({
    executablePath,
    runRoot,
  });
  const { chromium } = loadRunOwnedPlaywright({
    playwrightPackageRoot,
    runRoot,
  });
  const launch = await withRunOwnedHostTemporaryEnvironment({
    runRoot,
    callback: (hostTemporaryRoot) => chromium.launch({
      args: [
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-client-side-phishing-detection',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-features=MediaRouter,OptimizationHints,Translate',
        '--disable-hang-monitor',
        '--disable-sync',
        '--font-render-hinting=none',
        '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
        '--metrics-recording-only',
        '--no-default-browser-check',
        '--no-first-run',
      ],
      env: {
        HOME: path.join(runRoot, 'home'),
        LANG: 'C.UTF-8',
        LC_ALL: 'C.UTF-8',
        TMP: hostTemporaryRoot,
        TEMP: hostTemporaryRoot,
        TMPDIR: hostTemporaryRoot,
      },
      executablePath: executable,
      headless: true,
    }),
  });
  const browser = launch.value;
  const version = browser.version();
  if (version !== expectedVersion) {
    await browser.close();
    verifyPlaywrightHostTemporaryResidue(launch);
    fail(
      `accepted Chromium version mismatch: expected ${expectedVersion}, received ${version}`,
    );
  }
  return Object.freeze({
    browser,
    verifyHostResidue: () => verifyPlaywrightHostTemporaryResidue(launch),
    identity: Object.freeze({
      executableDigest: await sha256File(executable),
      name: 'chromium',
      version,
    }),
  });
}

async function installFixedEnvironment(context, kind, theme) {
  await context.addInitScript(
    ({ epochMs, pageKind, selectedTheme }) => {
      const NativeDate = Date;
      class AcceptanceDate extends NativeDate {
        constructor(...args) {
          super(...(args.length === 0 ? [epochMs] : args));
        }

        static now() {
          return epochMs;
        }
      }
      Object.defineProperty(window, 'Date', {
        configurable: false,
        value: AcceptanceDate,
        writable: false,
      });
      try {
        const currentKey = 'bgmss-theme-v1';
        const legacyKey = 'bgmss-workbench-theme';
        const storagePrototype = Storage.prototype;
        const nativeClear = storagePrototype.clear;
        const nativeGetItem = storagePrototype.getItem;
        const nativeKey = storagePrototype.key;
        const nativeRemoveItem = storagePrototype.removeItem;
        const nativeSetItem = storagePrototype.setItem;
        const rawLocalStorage = window.localStorage;
        if (pageKind === 'candidate') {
          nativeRemoveItem.call(rawLocalStorage, legacyKey);
          if (nativeGetItem.call(rawLocalStorage, currentKey) === null) {
            nativeSetItem.call(rawLocalStorage, currentKey, selectedTheme);
          }
        } else {
          nativeRemoveItem.call(rawLocalStorage, currentKey);
          if (nativeGetItem.call(rawLocalStorage, legacyKey) === null) {
            nativeSetItem.call(rawLocalStorage, legacyKey, selectedTheme);
          }
        }
        if (pageKind === 'candidate') {
          const recordLegacyAccess = (action, key = null) => {
            if (
              !['clear', 'key', 'ownKeys'].includes(action) &&
              key !== legacyKey
            ) {
              return;
            }
            void window
              .__acceptanceRecordThemeStorageAccess?.({ action, key })
              .catch(() => {});
          };
          let monitoredLocalStorage = null;
          const isMonitoredLocalStorage = (value) =>
            value === rawLocalStorage || value === monitoredLocalStorage;
          const nativeReceiver = (value) =>
            value === monitoredLocalStorage ? rawLocalStorage : value;
          const wrappers = {
            clear() {
              if (isMonitoredLocalStorage(this)) recordLegacyAccess('clear');
              return nativeClear.call(nativeReceiver(this));
            },
            getItem(key) {
              if (isMonitoredLocalStorage(this)) {
                recordLegacyAccess('getItem', String(key));
              }
              return nativeGetItem.call(nativeReceiver(this), key);
            },
            key(index) {
              if (isMonitoredLocalStorage(this)) {
                recordLegacyAccess('key');
              }
              return nativeKey.call(nativeReceiver(this), index);
            },
            removeItem(key) {
              if (isMonitoredLocalStorage(this)) {
                recordLegacyAccess('removeItem', String(key));
              }
              return nativeRemoveItem.call(nativeReceiver(this), key);
            },
            setItem(key, value) {
              if (isMonitoredLocalStorage(this)) {
                recordLegacyAccess('setItem', String(key));
              }
              return nativeSetItem.call(nativeReceiver(this), key, value);
            },
          };
          Object.defineProperties(storagePrototype, {
            clear: {
              configurable: true,
              value: wrappers.clear,
              writable: true,
            },
            getItem: {
              configurable: true,
              value: wrappers.getItem,
              writable: true,
            },
            key: {
              configurable: true,
              value: wrappers.key,
              writable: true,
            },
            removeItem: {
              configurable: true,
              value: wrappers.removeItem,
              writable: true,
            },
            setItem: {
              configurable: true,
              value: wrappers.setItem,
              writable: true,
            },
          });
          monitoredLocalStorage = new Proxy(rawLocalStorage, {
            defineProperty(target, key, descriptor) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-define', key);
              }
              return Reflect.defineProperty(target, key, descriptor);
            },
            deleteProperty(target, key) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-delete', key);
              }
              return Reflect.deleteProperty(target, key);
            },
            get(target, key) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-get', key);
              }
              return Reflect.get(target, key, target);
            },
            getOwnPropertyDescriptor(target, key) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-descriptor', key);
              }
              return Reflect.getOwnPropertyDescriptor(target, key);
            },
            has(target, key) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-has', key);
              }
              return Reflect.has(target, key);
            },
            ownKeys(target) {
              recordLegacyAccess('ownKeys');
              return Reflect.ownKeys(target);
            },
            set(target, key, value) {
              if (typeof key === 'string') {
                recordLegacyAccess('named-set', key);
              }
              return Reflect.set(target, key, value, target);
            },
          });
          Object.defineProperty(window, 'localStorage', {
            configurable: false,
            enumerable: true,
            value: monitoredLocalStorage,
            writable: false,
          });
          Object.defineProperty(window, '__acceptanceThemeStorageMonitor', {
            configurable: false,
            value: Object.freeze({
              intact: () =>
                window.localStorage === monitoredLocalStorage &&
                storagePrototype.clear === wrappers.clear &&
                storagePrototype.getItem === wrappers.getItem &&
                storagePrototype.key === wrappers.key &&
                storagePrototype.removeItem === wrappers.removeItem &&
                storagePrototype.setItem === wrappers.setItem,
              kind: pageKind,
              read: (key) => nativeGetItem.call(rawLocalStorage, key),
            }),
            writable: false,
          });
        } else {
          Object.defineProperty(window, '__acceptanceThemeStorageMonitor', {
            configurable: false,
            value: Object.freeze({
              intact: () => true,
              kind: pageKind,
              read: (key) => nativeGetItem.call(rawLocalStorage, key),
            }),
            writable: false,
          });
        }
      } catch {
        // The application independently handles unavailable storage.
      }
      const state = {
        layoutShifts: [],
        unhandledRejections: [],
      };
      Object.defineProperty(window, '__acceptanceObservations', {
        configurable: false,
        value: state,
        writable: false,
      });
      window.addEventListener('unhandledrejection', (event) => {
        const value = String(
          event.reason instanceof Error ? event.reason.message : event.reason,
        )
          .replace(/[\r\n\t]+/g, ' ')
          .slice(0, 256);
        state.unhandledRejections.push(value);
        void window
          .__acceptanceRecordDocumentObservation?.({
            kind: 'unhandled-rejection',
            value,
          })
          .catch(() => {});
      });
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput && entry.value > 0) {
                state.layoutShifts.push(entry.value);
                void window
                  .__acceptanceRecordDocumentObservation?.({
                    kind: 'layout-shift',
                    value: entry.value,
                  })
                  .catch(() => {});
              }
            }
          });
          observer.observe({ type: 'layout-shift', buffered: true });
        } catch {
          // Unsupported observation is reported by the caller's evidence check.
        }
      }
    },
    {
      epochMs: FIXED_CLOCK_EPOCH_MS,
      pageKind: kind,
      selectedTheme: theme,
    },
  );
}

export async function createFixedContext({
  allowedOrigin,
  browser,
  cellId,
  kind,
  motion,
  safeImageAbort = false,
  theme,
  width,
}) {
  if (
    typeof cellId !== 'string' ||
    (!MATRIX_CELL_ID.test(cellId) && !AUXILIARY_CELL_IDS.has(cellId))
  ) {
    fail('browser context cell id is outside the closed matrix');
  }
  if (safeImageAbort !== (cellId === 'browser.safe-image')) {
    fail('image abort is permitted only in the exact SafeImage cell');
  }
  if (!['candidate', 'oracle'].includes(kind)) fail('unknown browser context kind');
  if (!['default', 'reduced'].includes(motion)) fail('unknown motion preference');
  if (!['dark', 'light'].includes(theme)) fail('unknown browser theme');
  if (![360, 390, 779, 780, 1024, 1440].includes(width)) {
    fail('browser width is outside the closed matrix');
  }
  const origin = new URL(allowedOrigin);
  if (
    origin.protocol !== 'http:' ||
    origin.hostname !== '127.0.0.1' ||
    origin.pathname !== '/'
  ) {
    fail('browser context origin must be exact IPv4 loopback HTTP');
  }
  const context = await browser.newContext({
    acceptDownloads: false,
    colorScheme: theme,
    deviceScaleFactor: 1,
    extraHTTPHeaders: {
      'accept-language': 'zh-CN,zh;q=0.9',
    },
    locale: 'zh-CN',
    permissions: ['clipboard-read', 'clipboard-write'],
    reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
    serviceWorkers: 'block',
    timezoneId: 'Asia/Shanghai',
    viewport: { height: 900, width },
  });
  const policy = {
    allowedOrigin: origin.origin,
    deniedPublic: [],
    documentObservations: [],
    interceptedApplicationRequests: [],
    safeImageAborts: [],
    themeStorageAccesses: [],
    unexpectedNetwork: [],
  };
  await context.exposeBinding(
    '__acceptanceRecordDocumentObservation',
    ({ frame }, observation) => {
      if (
        observation === null ||
        typeof observation !== 'object' ||
        !['layout-shift', 'unhandled-rejection'].includes(observation.kind)
      ) {
        policy.documentObservations.push({
          kind: 'invalid-observation',
          value: 'invalid',
        });
        return;
      }
      const value =
        observation.kind === 'layout-shift'
          ? Number(observation.value)
          : normalizeFailureText(observation.value);
      policy.documentObservations.push({
        frame: (() => {
          try {
            return pathAndQuery(frame.url());
          } catch {
            return '<detached>';
          }
        })(),
        kind: observation.kind,
        value,
      });
    },
  );
  await context.exposeBinding(
    '__acceptanceRecordThemeStorageAccess',
    ({ frame }, access) => {
      const action = access?.action;
      const key = access?.key ?? null;
      if (
        kind !== 'candidate' ||
        !THEME_STORAGE_ACTIONS.has(action) ||
        (THEME_STORAGE_ENUMERATION_ACTIONS.has(action)
          ? key !== null
          : key !== 'bgmss-workbench-theme')
      ) {
        policy.themeStorageAccesses.push({
          action: 'invalid',
          frame: '<invalid>',
          key: null,
        });
        return;
      }
      policy.themeStorageAccesses.push({
        action,
        frame: (() => {
          try {
            return pathAndQuery(frame.url());
          } catch {
            return '<detached>';
          }
        })(),
        key,
      });
    },
  );
  await installFixedEnvironment(context, kind, theme);
  await context.route('**/*', async (route) => {
    const request = route.request();
    let url;
    try {
      url = new URL(request.url());
    } catch {
      policy.unexpectedNetwork.push('invalid-url');
      await route.abort('blockedbyclient');
      return;
    }
    if (['about:', 'blob:', 'data:'].includes(url.protocol)) {
      await route.continue();
      return;
    }
    const path = `${url.pathname}${url.search}`;
    if (
      kind === 'candidate' &&
      safeImageAbort &&
      url.origin === origin.origin &&
      SAFE_IMAGE_PATH.test(path)
    ) {
      policy.safeImageAborts.push(path);
      await route.abort('blockedbyclient');
      return;
    }
    if (url.origin === origin.origin && ['http:', 'https:'].includes(url.protocol)) {
      await route.continue();
      return;
    }
    if (kind === 'oracle') {
      policy.deniedPublic.push(`${url.protocol}//${url.hostname}${url.pathname}`);
    } else {
      policy.unexpectedNetwork.push(
        `${url.protocol}//${url.hostname}${url.pathname}`,
      );
    }
    await route.abort('blockedbyclient');
  });
  return Object.freeze({
    context,
    fixed: Object.freeze({
      clockEpochMs: FIXED_CLOCK_EPOCH_MS,
      deviceScaleFactor: 1,
      fontRendering: 'none',
      height: 900,
      cellId,
      locale: 'zh-CN',
      motion,
      theme,
      timezoneId: 'Asia/Shanghai',
      width,
    }),
    kind,
    policy,
    safeImageAbort,
  });
}

export function assertPageMonitorOutcome({
  allowSafeImageFailures,
  consoleMessages,
  contextRecord,
  globalApiOnly,
  inPage,
  pageErrors,
  requests,
  resources,
  supersededRequests = [],
  transferBytes = 0,
}) {
  if (
    allowSafeImageFailures !==
    (contextRecord.fixed?.cellId === 'browser.safe-image')
  ) {
    fail('SafeImage failure allowance does not match the exact cell identity');
  }
  if (!inPage) fail('browser observation bootstrap is missing');
  if (!Array.isArray(inPage.layoutShifts)) {
    fail('browser layout-shift evidence is missing');
  }
  if (!Array.isArray(inPage.unhandledRejections)) {
    fail('browser rejection evidence is missing');
  }
  const accumulated = Array.isArray(
    contextRecord.policy.documentObservations,
  )
    ? contextRecord.policy.documentObservations
    : [];
  if (
    accumulated.some(
      (entry) =>
        entry === null ||
        typeof entry !== 'object' ||
        !['layout-shift', 'unhandled-rejection'].includes(entry.kind),
    )
  ) {
    fail('cross-document browser observation evidence is invalid');
  }
  const layoutShifts = [
    ...new Set([
      ...inPage.layoutShifts,
      ...accumulated
        .filter((entry) => entry.kind === 'layout-shift')
        .map((entry) => entry.value),
    ]),
  ];
  const unhandledRejections = [
    ...new Set([
      ...inPage.unhandledRejections,
      ...accumulated
        .filter((entry) => entry.kind === 'unhandled-rejection')
        .map((entry) => entry.value),
    ]),
  ];
  if (consoleMessages.length > 0) {
    fail(`browser console emitted warnings/errors: ${JSON.stringify(consoleMessages)}`);
  }
  if (pageErrors.length > 0 || unhandledRejections.length > 0) {
    fail(
      `browser emitted an exception or rejection: ${JSON.stringify([
        ...pageErrors,
        ...unhandledRejections,
      ])}`,
    );
  }
  if (contextRecord.policy.unexpectedNetwork.length > 0) {
    fail(
      `candidate attempted non-loopback network: ${JSON.stringify(
        contextRecord.policy.unexpectedNetwork,
      )}`,
    );
  }
  if (contextRecord.policy.deniedPublic.length > 0) {
    fail(
      `oracle attempted non-loopback network: ${JSON.stringify(
        contextRecord.policy.deniedPublic,
      )}`,
    );
  }
  if (
    (contextRecord.policy.interceptedApplicationRequests ?? []).length > 0
  ) {
    fail(
      `non-SafeImage application request was intercepted: ${JSON.stringify(
        contextRecord.policy.interceptedApplicationRequests,
      )}`,
    );
  }
  const themeStorageAccesses =
    contextRecord.policy.themeStorageAccesses ?? [];
  if (
    !Array.isArray(themeStorageAccesses) ||
    themeStorageAccesses.some(
      (entry) =>
        entry === null ||
        typeof entry !== 'object' ||
        !THEME_STORAGE_ACTIONS.has(entry.action) ||
        typeof entry.frame !== 'string' ||
        (THEME_STORAGE_ENUMERATION_ACTIONS.has(entry.action)
          ? entry.key !== null
          : entry.key !== 'bgmss-workbench-theme'),
    )
  ) {
    fail('candidate legacy-theme storage access evidence is malformed');
  }
  if (
    contextRecord.kind === 'candidate' &&
    themeStorageAccesses.length > 0
  ) {
    fail(
      `candidate accessed the forbidden legacy theme key: ${JSON.stringify(
        themeStorageAccesses,
      )}`,
    );
  }
  if (resources.length > 0) {
    fail(`browser had failed resources: ${JSON.stringify(resources)}`);
  }
  if (!globalApiOnly) fail('browser submitted a non-global API request');
  if (!Number.isSafeInteger(transferBytes) || transferBytes < 0) {
    fail('browser transfer-byte evidence is invalid');
  }
  if (
    !Array.isArray(supersededRequests) ||
    supersededRequests.some(
      (entry) =>
        entry === null ||
        typeof entry !== 'object' ||
        !API_POST_PATHS.has(entry.path) ||
        !Number.isSafeInteger(entry.sequence) ||
        !Number.isSafeInteger(entry.supersededBy) ||
        entry.supersededBy <= entry.sequence,
    )
  ) {
    fail('superseded API request evidence is invalid');
  }
  if (
    allowSafeImageFailures &&
    contextRecord.policy.safeImageAborts.length === 0
  ) {
    fail('SafeImage cell did not abort an exact image route');
  }
  if (
    !allowSafeImageFailures &&
    contextRecord.policy.safeImageAborts.length > 0
  ) {
    fail('image-route abort occurred outside the SafeImage cell');
  }
  return Object.freeze({
    globalApiOnly,
    layoutShifts: Object.freeze(layoutShifts),
    network: Object.freeze({
      deniedOracle: Object.freeze([
        ...new Set(contextRecord.policy.deniedPublic),
      ]),
      requests: Object.freeze([...requests]),
      safeImageAborts: Object.freeze([
        ...contextRecord.policy.safeImageAborts,
      ]),
      supersededRequests: Object.freeze([...supersededRequests]),
    }),
    requests: Object.freeze([...requests]),
    resources: Object.freeze([...resources]),
    transferBytes,
  });
}

export function createPageMonitor(contextRecord) {
  const consoleMessages = [];
  const pageErrors = [];
  const requests = [];
  const resources = [];
  const abortedApplicationRequests = [];
  const transferObservations = [];
  let globalApiOnly = true;
  const requestKinds = new WeakMap();
  const requestSequence = new WeakMap();
  const applicationRequests = [];
  function attach(page) {
    page.on('console', (message) => {
      if (message.type() === 'error' || message.type() === 'warning') {
        consoleMessages.push({
          type: message.type(),
          text: normalizeFailureText(message.text()),
        });
      }
    });
    page.on('pageerror', (error) => {
      pageErrors.push(normalizeFailureText(error.message));
    });
    page.on('request', (request) => {
      const url = new URL(request.url());
      const relative =
        url.origin === contextRecord.policy.allowedOrigin
          ? pathAndQuery(url)
          : `${url.protocol}//${url.hostname}${url.pathname}`;
      const safeAbort =
        contextRecord.safeImageAbort &&
        url.origin === contextRecord.policy.allowedOrigin &&
        SAFE_IMAGE_PATH.test(relative);
      const deniedOracle =
        contextRecord.kind === 'oracle' &&
        url.origin !== contextRecord.policy.allowedOrigin;
      const applicationApi =
        contextRecord.kind === 'candidate' &&
        url.origin === contextRecord.policy.allowedOrigin &&
        request.method() === 'POST' &&
        API_POST_PATHS.has(url.pathname);
      const sequence = applicationApi ? applicationRequests.length + 1 : 0;
      requestSequence.set(request, sequence);
      if (applicationApi) {
        applicationRequests.push({ path: url.pathname, sequence });
      }
      requestKinds.set(request, {
        applicationApi,
        deniedOracle,
        path: url.pathname,
        relative,
        safeAbort,
      });
      requests.push({
        frame: (() => {
          try {
            return pathAndQuery(request.frame().url());
          } catch {
            return '<service-worker-or-detached>';
          }
        })(),
        method: request.method(),
        path: relative,
        resourceType: request.resourceType(),
      });
      if (
        contextRecord.kind === 'candidate' &&
        request.method() === 'POST' &&
        API_POST_PATHS.has(url.pathname)
      ) {
        try {
          const payload = request.postDataJSON();
          const scopes = [];
          const visit = (value, depth = 0) => {
            if (depth > 8 || value === null || typeof value !== 'object') return;
            if (Array.isArray(value)) {
              value.forEach((entry) => visit(entry, depth + 1));
              return;
            }
            for (const [key, entry] of Object.entries(value)) {
              if (key === 'scope' && typeof entry === 'string') scopes.push(entry);
              else visit(entry, depth + 1);
            }
          };
          visit(payload);
          if (scopes.length === 0 || scopes.some((scope) => scope !== 'global')) {
            globalApiOnly = false;
          }
        } catch {
          globalApiOnly = false;
        }
      }
    });
    page.on('requestfailed', (request) => {
      const kind = requestKinds.get(request) ?? {
        applicationApi: false,
        deniedOracle: false,
        path: request.url(),
        relative: request.url(),
        safeAbort: false,
      };
      const failure = normalizeFailureText(request.failure()?.errorText);
      if (
        kind.applicationApi &&
        /(?:ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled)/iu.test(failure)
      ) {
        abortedApplicationRequests.push({
          failure,
          path: kind.path,
          sequence: requestSequence.get(request) ?? 0,
        });
      } else if (!kind.safeAbort && !kind.deniedOracle) {
        resources.push({
          failure,
          frame: (() => {
            try {
              return pathAndQuery(request.frame().url());
            } catch {
              return '<service-worker-or-detached>';
            }
          })(),
          path: kind.relative,
          resourceType: request.resourceType(),
          type: 'request-failed',
        });
      }
    });
    page.on('response', (response) => {
      transferObservations.push(
        Promise.resolve(response.headerValue('content-length'))
          .then((value) => {
            if (value === null) return 0;
            if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
              fail('browser response content-length is invalid');
            }
            const bytes = Number(value);
            if (!Number.isSafeInteger(bytes)) {
              fail('browser response content-length exceeds the integer bound');
            }
            return bytes;
          }),
      );
      if (response.status() >= 400) {
        resources.push({
          frame: (() => {
            try {
              return pathAndQuery(response.request().frame().url());
            } catch {
              return '<service-worker-or-detached>';
            }
          })(),
          method: response.request().method(),
          path: pathAndQuery(response.url()),
          resourceType: response.request().resourceType(),
          status: response.status(),
          type: 'http-error',
        });
      }
    });
  }
  async function finish(page, { allowSafeImageFailures }) {
    await page.waitForTimeout(100);
    const transferBytes = (await Promise.all(transferObservations)).reduce(
      (total, value) => total + value,
      0,
    );
    const inPage = await page.evaluate(() => {
      const observations = window.__acceptanceObservations;
      return observations
        ? {
            layoutShifts: [...observations.layoutShifts],
            unhandledRejections: [...observations.unhandledRejections],
          }
        : null;
    });
    const supersededRequests = [];
    for (const aborted of abortedApplicationRequests) {
      const successor = applicationRequests.find(
        (request) =>
          request.path === aborted.path &&
          request.sequence === aborted.sequence + 1,
      );
      if (!successor) {
        resources.push({
          failure: aborted.failure,
          frame: '<application>',
          path: aborted.path,
          resourceType: 'fetch',
          type: 'request-failed',
        });
        continue;
      }
      supersededRequests.push({
        path: aborted.path,
        sequence: aborted.sequence,
        supersededBy: successor.sequence,
      });
    }
    return assertPageMonitorOutcome({
      allowSafeImageFailures,
      consoleMessages,
      contextRecord,
      globalApiOnly,
      inPage,
      pageErrors,
      requests,
      resources,
      supersededRequests,
      transferBytes,
    });
  }
  return Object.freeze({ attach, finish });
}

const legacyThemeNegativeControlsByBrowser = new WeakMap();

export async function verifyLegacyThemeStorageNegativeControls(browser) {
  if (browser === null || typeof browser !== 'object') {
    fail('legacy-theme negative control requires one browser');
  }
  if (!legacyThemeNegativeControlsByBrowser.has(browser)) {
    legacyThemeNegativeControlsByBrowser.set(
      browser,
      (async () => {
        const cases = Object.freeze([
          Object.freeze({ action: 'named-get', operation: 'named-get' }),
          Object.freeze({ action: 'named-set', operation: 'named-set' }),
          Object.freeze({
            action: 'named-delete',
            operation: 'named-delete',
          }),
          Object.freeze({ action: 'named-get', operation: 'reflect-get' }),
          Object.freeze({ action: 'named-set', operation: 'reflect-set' }),
          Object.freeze({
            action: 'named-delete',
            operation: 'reflect-delete',
          }),
          Object.freeze({
            action: 'named-descriptor',
            operation: 'object-has-own',
          }),
          Object.freeze({
            action: 'named-descriptor',
            operation: 'has-own-property',
          }),
          Object.freeze({
            action: 'named-descriptor',
            operation: 'object-get-own-property-descriptor',
          }),
          Object.freeze({
            action: 'named-descriptor',
            operation: 'reflect-get-own-property-descriptor',
          }),
          Object.freeze({ action: 'named-has', operation: 'in' }),
          Object.freeze({ action: 'named-has', operation: 'reflect-has' }),
          Object.freeze({
            action: 'named-define',
            operation: 'object-define-property',
          }),
          Object.freeze({
            action: 'named-define',
            operation: 'reflect-define-property',
          }),
          Object.freeze({ action: 'ownKeys', operation: 'reflect-own-keys' }),
          Object.freeze({ action: 'ownKeys', operation: 'object-keys' }),
          Object.freeze({
            action: 'ownKeys',
            operation: 'object-get-own-property-names',
          }),
          Object.freeze({
            action: 'ownKeys',
            operation: 'object-get-own-property-descriptors',
          }),
          Object.freeze({ action: 'ownKeys', operation: 'for-in' }),
          Object.freeze({ action: 'key', operation: 'storage-key' }),
        ]);
        const evidence = [];
        for (const testCase of cases) {
          const origin = 'http://127.0.0.1';
          const contextRecord = await createFixedContext({
            allowedOrigin: origin,
            browser,
            cellId: 'browser.shared-journey',
            kind: 'candidate',
            motion: 'default',
            theme: 'light',
            width: 1024,
          });
          const monitor = createPageMonitor(contextRecord);
          const page = await contextRecord.context.newPage();
          monitor.attach(page);
          const targetPath =
            `/__acceptance/legacy-theme/${testCase.operation}`;
          try {
            await page.route('**/*', (route) =>
              route.fulfill({
                body: '<!doctype html><html><body><main>control</main></body></html>',
                contentType: 'text/html',
                status: 200,
              }),
            );
            await page.goto(`${origin}${targetPath}`, {
              waitUntil: 'domcontentloaded',
            });
            await page.evaluate(async (operation) => {
              const dynamicLegacyKey = [
                'bgmss',
                'workbench',
                'theme',
              ].join('-');
              switch (operation) {
                case 'named-get':
                  void localStorage[dynamicLegacyKey];
                  break;
                case 'named-set':
                  localStorage[dynamicLegacyKey] = 'dark';
                  break;
                case 'named-delete':
                  delete localStorage[dynamicLegacyKey];
                  break;
                case 'reflect-get':
                  Reflect.get(localStorage, dynamicLegacyKey);
                  break;
                case 'reflect-set':
                  Reflect.set(localStorage, dynamicLegacyKey, 'dark');
                  break;
                case 'reflect-delete':
                  Reflect.deleteProperty(localStorage, dynamicLegacyKey);
                  break;
                case 'object-has-own':
                  Object.hasOwn(localStorage, dynamicLegacyKey);
                  break;
                case 'has-own-property':
                  localStorage.hasOwnProperty(dynamicLegacyKey);
                  break;
                case 'object-get-own-property-descriptor':
                  Object.getOwnPropertyDescriptor(
                    localStorage,
                    dynamicLegacyKey,
                  );
                  break;
                case 'reflect-get-own-property-descriptor':
                  Reflect.getOwnPropertyDescriptor(
                    localStorage,
                    dynamicLegacyKey,
                  );
                  break;
                case 'in':
                  void (dynamicLegacyKey in localStorage);
                  break;
                case 'reflect-has':
                  Reflect.has(localStorage, dynamicLegacyKey);
                  break;
                case 'object-define-property':
                  Object.defineProperty(localStorage, dynamicLegacyKey, {
                    configurable: true,
                    enumerable: true,
                    value: 'dark',
                    writable: true,
                  });
                  break;
                case 'reflect-define-property':
                  Reflect.defineProperty(localStorage, dynamicLegacyKey, {
                    configurable: true,
                    enumerable: true,
                    value: 'dark',
                    writable: true,
                  });
                  break;
                case 'reflect-own-keys':
                  Reflect.ownKeys(localStorage);
                  break;
                case 'object-keys':
                  Object.keys(localStorage);
                  break;
                case 'object-get-own-property-names':
                  Object.getOwnPropertyNames(localStorage);
                  break;
                case 'object-get-own-property-descriptors':
                  Object.getOwnPropertyDescriptors(localStorage);
                  break;
                case 'for-in':
                  for (const storageKey in localStorage) {
                    void storageKey;
                    break;
                  }
                  break;
                case 'storage-key':
                  localStorage.key(0);
                  break;
                default:
                  throw new Error('unknown legacy-theme negative control');
              }
              await new Promise((resolve) => setTimeout(resolve, 0));
            }, testCase.operation);
            const accesses = contextRecord.policy.themeStorageAccesses;
            if (
              accesses.length !== 1 ||
              accesses[0].action !== testCase.action ||
              accesses[0].frame !== targetPath ||
              (THEME_STORAGE_ENUMERATION_ACTIONS.has(testCase.action)
                ? accesses[0].key !== null
                : accesses[0].key !== 'bgmss-workbench-theme')
            ) {
              fail(
                `legacy-theme ${testCase.operation} control was not recorded exactly`,
              );
            }
            let rejected = false;
            try {
              await monitor.finish(page, {
                allowSafeImageFailures: false,
              });
            } catch (error) {
              if (!(error instanceof BrowserRuntimeError)) throw error;
              rejected = true;
            }
            if (!rejected) {
              fail(`legacy-theme ${testCase.operation} control escaped`);
            }
            evidence.push(
              Object.freeze({
                action: testCase.action,
                operation: testCase.operation,
                rejected,
              }),
            );
          } finally {
            await page.close().catch(() => {});
            await contextRecord.context.close().catch(() => {});
          }
        }
        return Object.freeze({
          cases: Object.freeze(evidence),
          dynamicKeyConstruction: true,
          rejected: evidence.length === cases.length,
        });
      })(),
    );
  }
  try {
    return await legacyThemeNegativeControlsByBrowser.get(browser);
  } catch (error) {
    legacyThemeNegativeControlsByBrowser.delete(browser);
    throw error;
  }
}

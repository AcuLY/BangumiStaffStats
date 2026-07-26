import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertCandidateAuditEvidence,
  assertExceptionSurfaceCoverage,
  assertNormalizedActionTrace,
  assertNormalizedActionTracePair,
  assertScreenshotDifference,
  compareSnapshotFacts,
  compileOracleExceptionEntries,
  OracleComparisonError,
  sealThemeCheckpointEvidence,
  sealThemePersistenceCheckpointEvidence,
} from './compare.mjs';
import {
  assertPageMonitorOutcome,
  BrowserRuntimeError,
  createFixedContext,
  loadRunOwnedPlaywright,
  requireRunOwnedChromiumExecutable,
  verifyPlaywrightHostTemporaryResidue,
  withRunOwnedHostTemporaryEnvironment,
} from './runtime.mjs';
import {
  assertKeyboardTrace,
  assertLatestResponseEvidence,
  assertShareConsumptionNavigation,
  BrowserJourneyError,
  isExpectedShareNavigationContextDestroyed,
} from './journey.mjs';
import {
  assertClosedStateScenarioCoverage,
  assertLoadingComparisonCoverage,
  assertSafeImageLedger,
  BrowserAcceptanceError,
  countExternalNetworkAttempts,
  externalNetworkAttemptFacts,
  reconstructSafeImageAttributeTransitions,
} from './session.mjs';
import {
  AcceptanceServerError,
  startAcceptanceServer,
} from './server.mjs';
import {
  FrontendArtifactError,
  prepareCandidateFrontend,
} from './artifact.mjs';
import { extractTarBuffer, SafeTarError } from './tar.mjs';

function temporaryRoot(t) {
  const base = fs.realpathSync.native(os.tmpdir());
  const root = fs.mkdtempSync(path.join(base, 'bgmss-browser-test-'));
  t.after(() => fs.rmSync(root, { force: true, recursive: true }));
  return root;
}

function writeOctal(header, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0');
  header.write(encoded, offset, length - 1, 'ascii');
  header[offset + length - 1] = 0;
}

function tarEntry({
  body = Buffer.alloc(0),
  linkName = '',
  mode = 0o644,
  name,
  type = '0',
}) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'ascii');
  writeOctal(header, 100, 8, mode);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, body.length);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header.write(type, 156, 1, 'ascii');
  header.write(linkName, 157, 100, 'ascii');
  header.write('ustar\0', 257, 6, 'binary');
  header.write('00', 263, 2, 'ascii');
  let checksum = 0;
  for (const byte of header) checksum += byte;
  const encodedChecksum = checksum.toString(8).padStart(6, '0');
  header.write(encodedChecksum, 148, 6, 'ascii');
  header[154] = 0;
  header[155] = 0x20;
  const padding = Buffer.alloc(
    Math.ceil(body.length / 512) * 512 - body.length,
  );
  return Buffer.concat([header, body, padding]);
}

function tar(entries) {
  return Buffer.concat([...entries, Buffer.alloc(1024)]);
}

test('safe tar rejects traversal, links, and unbound PAX metadata', (t) => {
  const runRoot = temporaryRoot(t);
  for (const [name, bytes] of [
    [
      'traversal',
      tar([tarEntry({ body: Buffer.from('x'), name: '../escape' })]),
    ],
    [
      'link',
      tar([tarEntry({ linkName: 'target', name: 'link', type: '2' })]),
    ],
    [
      'pax',
      tar([
        tarEntry({
          body: Buffer.from('13 comment=x\n'),
          name: 'pax_global_header',
          type: 'g',
        }),
      ]),
    ],
  ]) {
    assert.throws(
      () =>
        extractTarBuffer({
          bytes,
          outputRelative: `case-${name}`,
          runRoot,
        }),
      SafeTarError,
    );
  }
  assert.equal(fs.existsSync(path.join(runRoot, 'escape')), false);
});

test('candidate bundle rejects every literal legacy theme-key access path', async (t) => {
  const runRoot = temporaryRoot(t);
  const archivePath = path.join(runRoot, 'candidate.tar');
  fs.writeFileSync(
    archivePath,
    tar([
      tarEntry({
        body: Buffer.from('<main id="app"></main>'),
        name: 'index.html',
      }),
      tarEntry({
        body: Buffer.from(
          "localStorage['bgmss-workbench-theme'];Object.keys(localStorage)",
        ),
        name: 'assets/app.js',
      }),
    ]),
  );
  await assert.rejects(
    prepareCandidateFrontend({
      frontendTarPath: archivePath,
      runRoot,
    }),
    FrontendArtifactError,
  );
});

test('Playwright host temporary environment is run-owned, restored, and residue-checked', async (t) => {
  const runRoot = temporaryRoot(t);
  fs.mkdirSync(path.join(runRoot, 'browser'));
  const before = Object.fromEntries(
    ['TMPDIR', 'TMP', 'TEMP'].map((name) => [name, process.env[name]]),
  );
  const record = await withRunOwnedHostTemporaryEnvironment({
    runRoot,
    callback: async (hostTemporaryRoot) => {
      assert.equal(os.tmpdir(), hostTemporaryRoot);
      return 'launched';
    },
  });
  assert.equal(record.value, 'launched');
  for (const name of ['TMPDIR', 'TMP', 'TEMP']) {
    assert.equal(process.env[name], before[name]);
  }
  assert.deepEqual(
    verifyPlaywrightHostTemporaryResidue(record),
    { globalEntries: 0, ownedEntries: 0 },
  );
  fs.writeFileSync(path.join(record.hostTemporaryRoot, 'playwright-leak'), 'x');
  assert.throws(
    () => verifyPlaywrightHostTemporaryResidue(record),
    /host temporary residue/u,
  );
});

function rawRequest(origin, requestPath) {
  return new Promise((resolve, reject) => {
    const url = new URL(origin);
    const request = http.request(
      {
        host: url.hostname,
        method: 'GET',
        path: requestPath,
        port: url.port,
      },
      (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () =>
          resolve({
            body: Buffer.concat(chunks).toString('utf8'),
            status: response.statusCode,
          }),
        );
      },
    );
    request.on('error', reject);
    request.end();
  });
}

test('static server has no history or API fallback and rejects target injection', async (t) => {
  const runRoot = temporaryRoot(t);
  const root = path.join(runRoot, 'static');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><p>index</p>');
  await assert.rejects(
    startAcceptanceServer({
      kind: 'candidate',
      root,
      runRoot,
      upstreamUrl: 'https://example.invalid',
    }),
    AcceptanceServerError,
  );
  const server = await startAcceptanceServer({
    kind: 'candidate',
    root,
    runRoot,
  });
  try {
    assert.equal((await rawRequest(server.origin, '/ranking')).status, 200);
    assert.equal((await rawRequest(server.origin, '/ranking/deep')).status, 404);
    assert.equal((await rawRequest(server.origin, '/missing.js')).status, 404);
    assert.equal((await rawRequest(server.origin, '/api/v1/rankings')).status, 503);
    assert.equal((await rawRequest(server.origin, '/%2e%2e%2findex.html')).status, 400);
    const closed = await server.close();
    assert.equal(closed.faults.length, 0);
    assert.equal(closed.rejections.length, 1);
  } finally {
    await server.close();
  }
});

test('invalid API adapter output is an internal server fault, not a client rejection', async (t) => {
  const runRoot = temporaryRoot(t);
  const root = path.join(runRoot, 'static');
  fs.mkdirSync(root);
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
  const server = await startAcceptanceServer({
    apiRequest: async () => ({ body: {}, status: 200 }),
    kind: 'candidate',
    root,
    runRoot,
  });
  assert.equal((await rawRequest(server.origin, '/api/v1/rankings')).status, 400);
  await assert.rejects(server.close(), /recorded faults/u);
});

function style(overrides = {}) {
  return {
    color: 'rgb(0, 0, 0)',
    display: 'block',
    fontSize: '14px',
    ...overrides,
  };
}

function node({
  classes = ['row'],
  height = 20,
  path: nodePath = 'button:1',
  y = 0,
} = {}) {
  return {
    action: {
      disabled: false,
      href: false,
      interactive: true,
      tabIndex: 0,
    },
    box: { height, width: 100, x: 0, y },
    classes,
    path: nodePath,
    role: 'button',
    state: {},
    styles: style(),
    tag: 'button',
  };
}

function surface({
  box = { height: 200, width: 300, x: 0, y: 0 },
  classification = 'dynamic-data',
  id = 'dynamic',
  nodes = [node()],
  surfaces = null,
} = {}) {
  return {
    classification,
    id,
    properties: ['text-content', 'content-pixels'],
    selector: '.dynamic',
    surfaces:
      surfaces ??
      [
        {
          box,
          nodes,
          role: 'region',
          tag: 'section',
        },
      ],
  };
}

function semantic({
  classification = null,
  id = null,
  name = 'Action',
  role = 'button',
} = {}) {
  return {
    exceptionClassification: classification,
    exceptionId: id,
    name,
    role,
    state: {},
    tag: 'button',
  };
}

function snapshot(overrides = {}) {
  return {
    classFacts: {},
    document: {
      activeRole: null,
      bodyScrollWidth: 1024,
      clientWidth: 1024,
      fontReady: 'loaded',
      height: 900,
      scrollWidth: 1024,
      theme: 'light',
      width: 1024,
    },
    exceptionSurfaces: [],
    landmarks: [
      {
        box: { height: 100, width: 1024, x: 0, y: 0 },
        role: 'banner',
      },
    ],
    semantic: [semantic()],
    ...overrides,
  };
}

test('class-only refactors pass while semantic, geometry, and style drift fail', () => {
  const candidate = snapshot({
    classFacts: {
      renamed: {
        count: 1,
        facts: [
          {
            box: { height: 20, width: 100, x: 0, y: 0 },
            styles: style(),
          },
        ],
      },
    },
  });
  const oracle = snapshot({
    classFacts: {
      former: {
        count: 1,
        facts: [
          {
            box: { height: 20, width: 100, x: 0, y: 0 },
            styles: style(),
          },
        ],
      },
    },
  });
  assert.equal(compareSnapshotFacts(candidate, oracle).matched, true);
  assert.equal(
    compareSnapshotFacts(
      { ...candidate, semantic: [...candidate.semantic, semantic()] },
      oracle,
    ).matched,
    false,
  );
  assert.equal(
    compareSnapshotFacts(
      {
        ...candidate,
        landmarks: [
          {
            box: { height: 120, width: 1024, x: 0, y: 0 },
            role: 'banner',
          },
        ],
      },
      oracle,
    ).matched,
    false,
  );
  const sharedCandidate = snapshot({
    classFacts: {
      shared: {
        count: 1,
        facts: [
          {
            box: { height: 20, width: 100, x: 0, y: 0 },
            styles: style({ color: 'rgb(255, 0, 0)' }),
          },
        ],
      },
    },
  });
  const sharedOracle = snapshot({
    classFacts: {
      shared: {
        count: 1,
        facts: [
          {
            box: { height: 20, width: 100, x: 0, y: 0 },
            styles: style(),
          },
        ],
      },
    },
  });
  assert.equal(compareSnapshotFacts(sharedCandidate, sharedOracle).matched, false);
});

test('dynamic quantity and class names may differ but row format drift fails', () => {
  const candidateSurface = surface({
    nodes: [
      node({ classes: ['new-row'], nodePath: 'button:1', y: 0 }),
      node({ classes: ['new-row'], nodePath: 'button:2', y: 20 }),
    ],
  });
  const oracleSurface = surface({
    nodes: [node({ classes: ['old-row'], nodePath: 'button:1', y: 0 })],
  });
  const candidate = snapshot({
    exceptionSurfaces: [candidateSurface],
    semantic: [
      semantic({
        classification: 'dynamic-data',
        id: 'dynamic',
        name: '§dynamic§',
      }),
      semantic({
        classification: 'dynamic-data',
        id: 'dynamic',
        name: '§dynamic§',
      }),
    ],
  });
  const oracle = snapshot({
    exceptionSurfaces: [oracleSurface],
    semantic: [
      semantic({
        classification: 'dynamic-data',
        id: 'dynamic',
        name: '§dynamic§',
      }),
    ],
  });
  assert.equal(compareSnapshotFacts(candidate, oracle).matched, true);
  const drifted = snapshot({
    ...candidate,
    exceptionSurfaces: [
      surface({
        nodes: [
          node({ nodePath: 'button:1', y: 0 }),
          node({ height: 32, nodePath: 'button:2', y: 20 }),
        ],
      }),
    ],
  });
  assert.equal(compareSnapshotFacts(drifted, oracle).matched, false);
});

test('exact candidate-only addition passes but an expanded rectangle fails', () => {
  const addition = surface({
    box: { height: 24, width: 300, x: 10, y: 100 },
    classification: 'approved-addition',
    id: 'addition',
  });
  const candidate = snapshot({
    exceptionSurfaces: [addition],
    semantic: [
      semantic({
        classification: 'approved-addition',
        id: 'addition',
        name: 'Approved feedback',
        role: 'status',
      }),
    ],
  });
  const oracle = snapshot({
    exceptionSurfaces: [
      surface({
        classification: 'approved-addition',
        id: 'addition',
        surfaces: [],
      }),
    ],
    semantic: [],
  });
  assert.doesNotThrow(() => assertExceptionSurfaceCoverage(candidate, oracle));
  assert.equal(compareSnapshotFacts(candidate, oracle).matched, true);
  assert.throws(
    () =>
      assertExceptionSurfaceCoverage(
        { ...candidate, semantic: [] },
        oracle,
      ),
    OracleComparisonError,
  );
  const expanded = snapshot({
    ...candidate,
    exceptionSurfaces: [
      surface({
        box: { height: 900, width: 1024, x: 0, y: 0 },
        classification: 'approved-addition',
        id: 'addition',
      }),
    ],
  });
  assert.throws(
    () => assertExceptionSurfaceCoverage(expanded, oracle),
    OracleComparisonError,
  );
  const omitted = snapshot({
    exceptionSurfaces: [
      surface({
        classification: 'approved-addition',
        id: 'addition',
        surfaces: [],
      }),
    ],
    semantic: [],
  });
  assert.throws(
    () => assertExceptionSurfaceCoverage(omitted, oracle),
    OracleComparisonError,
  );
});

function normalizedActionTrace(
  route = '/ranking',
  preference = 'default',
  viewport = 'wide',
  pageKind = 'candidate',
) {
  const transition = {
    page: { after: '2', before: '1', kind: 'page' },
    sort: { after: '作品数', before: '综合分', kind: 'sort' },
    view:
      route === '/ranking'
        ? { after: 'compact', before: 'detailed', kind: 'view' }
        : { after: 'asc', before: 'desc', kind: 'direction' },
  };
  const serialization = `{"query":{"scope":"global"},"workspace":{"kind":"${
    route === '/ranking' ? 'ranking' : 'co-star'
  }"}}`;
  const appliedSerialization = '{"scope":"global"}';
  const token = `v1.${Buffer.from(serialization, 'utf8').toString('base64url')}`;
  const themeCheckpoint = (id, theme) => {
    const parameters = new URLSearchParams();
    if (pageKind === 'oracle' && route === '/ranking') {
      parameters.set('mode', 'ranking');
    }
    if (pageKind === 'oracle' && theme === 'dark') {
      parameters.set('theme', 'dark');
    }
    const search = parameters.toString() ? `?${parameters}` : '';
    const hash = '';
    return sealThemeCheckpointEvidence({
      id,
      query: {
        appliedSerialization:
          pageKind === 'candidate' ? appliedSerialization : null,
        revision: pageKind === 'candidate' ? 1 : null,
        summary: '全局 · 动画 · 声优',
      },
      resource: {
        loadingCount: 0,
        state: 'ready',
      },
      route: {
        hash,
        key: `${route}${search}${hash}`,
        pathname: route,
        search,
      },
      share: {
        count: pageKind === 'candidate' ? 1 : 0,
        disabled: pageKind === 'candidate' ? false : null,
        target:
          pageKind === 'candidate'
            ? {
                hash: `#q=${token}`,
                key: `${route}#q=${token}`,
                pathname: route,
                search: '',
                serialization,
                token,
              }
            : null,
      },
      storage: {
        current: pageKind === 'candidate' ? theme : null,
        legacy: pageKind === 'oracle' ? theme : null,
        monitorIntact: true,
      },
      theme,
    });
  };
  const checkpoints = [
    themeCheckpoint('before', 'light'),
    themeCheckpoint('toggle-alternate', 'dark'),
    themeCheckpoint('toggle-restored', 'light'),
    themeCheckpoint('after', 'light'),
  ];
  const persistenceCheckpoint = (id, theme) => {
    const parameters = new URLSearchParams();
    if (pageKind === 'oracle' && route === '/ranking') {
      parameters.set('mode', 'ranking');
    }
    if (pageKind === 'oracle' && theme === 'dark') {
      parameters.set('theme', 'dark');
    }
    const search = parameters.toString() ? `?${parameters}` : '';
    return sealThemePersistenceCheckpointEvidence({
      id,
      queryApplied: pageKind === 'candidate' ? false : null,
      resource: {
        loadingCount: 0,
        state: 'stable',
      },
      route: {
        hash: '',
        key: `${route}${search}`,
        pathname: route,
        search,
      },
      storage: {
        current: pageKind === 'candidate' ? theme : null,
        legacy: pageKind === 'oracle' ? theme : null,
        monitorIntact: true,
      },
      theme,
    });
  };
  const persistenceCheckpoints = [
    persistenceCheckpoint('persistence-alternate', 'dark'),
    persistenceCheckpoint('reload-alternate', 'dark'),
    persistenceCheckpoint('persistence-restored', 'light'),
    persistenceCheckpoint('reload-restored', 'light'),
  ];
  return {
    motion: {
      observations: [
        'query-panel',
        'tooltip',
        'drawer',
        'direction',
      ].map((id) => {
        const applicable =
          (id !== 'drawer' || viewport === 'compact') &&
          (id !== 'direction' || route === '/co-star');
        return {
          id,
          result: applicable
            ? preference === 'reduced'
              ? 'suppressed'
              : 'active'
            : 'not-applicable',
        };
      }),
      preference,
      viewport,
    },
    route,
    schemaVersion: 1,
    steps: [
      'query-open',
      'tooltip-escape',
      'query-escape-return',
      'drawer-escape-return',
      'view',
      'sort',
      'page',
      'share',
      'theme-round-trip',
      'mode-round-trip',
    ].map((id) => ({
      id,
      result: 'pass',
      ...(['page', 'sort', 'view'].includes(id)
        ? { transition: transition[id] }
        : id === 'theme-round-trip'
          ? {
              transition: {
                alternate: 'dark',
                apiRequests: [],
                before: 'light',
                checkpoints,
                delayedApiNegativeControl: {
                  delayMs: 300,
                  observed: {
                    method: 'POST',
                    path: '/api/v1/rankings',
                    phase: 'delayed-negative-control',
                    status: 200,
                  },
                  rejected: true,
                },
                kind: 'theme',
                pageKind,
                persistenceApiRequests:
                  pageKind === 'candidate'
                    ? [
                        'persistence-alternate',
                        'reload-alternate',
                        'persistence-restored',
                        'reload-restored',
                      ].map((phase) => ({
                        method: 'GET',
                        path: '/api/v1/catalog',
                        phase,
                        status: 200,
                      }))
                    : [],
                persistenceCheckpoints,
                persistedAlternate: 'dark',
                persistedRestored: 'light',
                restored: 'light',
                stableWindowMs: 750,
              },
            }
          : {}),
    })),
  };
}

test('candidate and oracle action traces are one strict closed sequence', () => {
  const candidate = normalizedActionTrace();
  const oracle = normalizedActionTrace(
    '/ranking',
    'default',
    'wide',
    'oracle',
  );
  assert.equal(assertNormalizedActionTrace(candidate), true);
  assert.equal(assertNormalizedActionTracePair(candidate, oracle), true);
  oracle.steps[4].transition.after = 'detailed';
  assert.throws(
    () => assertNormalizedActionTracePair(candidate, oracle),
    OracleComparisonError,
  );
  const expanded = structuredClone(candidate);
  expanded.steps[0].selector = '.candidate-only';
  assert.throws(
    () => assertNormalizedActionTrace(expanded),
    OracleComparisonError,
  );
  const ignoredReducedMotion = normalizedActionTrace(
    '/co-star',
    'reduced',
    'compact',
  );
  ignoredReducedMotion.motion.observations[0].result = 'active';
  assert.throws(
    () => assertNormalizedActionTrace(ignoredReducedMotion),
    OracleComparisonError,
  );
  for (const id of ['view', 'sort', 'page']) {
    const noOp = normalizedActionTrace();
    const step = noOp.steps.find((entry) => entry.id === id);
    step.transition.after = step.transition.before;
    assert.throws(
      () => assertNormalizedActionTrace(noOp),
      OracleComparisonError,
    );
  }
  const themeApiLeak = normalizedActionTrace();
  themeApiLeak.steps.find(
    (entry) => entry.id === 'theme-round-trip',
  ).transition.apiRequests.push({
    method: 'POST',
    path: '/api/v1/rankings',
    phase: 'reload-alternate',
  });
  assert.throws(
    () => assertNormalizedActionTrace(themeApiLeak),
    OracleComparisonError,
  );
  const delayedThemeApiLeak = normalizedActionTrace();
  delayedThemeApiLeak.steps.find(
    (entry) => entry.id === 'theme-round-trip',
  ).transition.apiRequests.push({
    method: 'POST',
    path: '/api/v1/rankings',
    phase: 'toggle-alternate-stable',
  });
  assert.throws(
    () => assertNormalizedActionTrace(delayedThemeApiLeak),
    OracleComparisonError,
  );
  for (const mutate of [
    (transition) => {
      transition.persistenceApiRequests[1].path = '/api/v1/rankings';
    },
    (transition) => {
      transition.persistenceApiRequests[1].method = 'POST';
    },
    (transition) => {
      transition.persistenceApiRequests[1].status = 204;
    },
    (transition) => {
      transition.persistenceApiRequests.push({
        method: 'GET',
        path: '/api/v1/catalog',
        phase: 'reload-alternate',
        status: 200,
      });
    },
  ]) {
    const changed = normalizedActionTrace();
    mutate(
      changed.steps.find((entry) => entry.id === 'theme-round-trip')
        .transition,
    );
    assert.throws(
      () => assertNormalizedActionTrace(changed),
      OracleComparisonError,
    );
  }
  const escapedDelayedControl = normalizedActionTrace();
  escapedDelayedControl.steps.find(
    (entry) => entry.id === 'theme-round-trip',
  ).transition.delayedApiNegativeControl.rejected = false;
  assert.throws(
    () => assertNormalizedActionTrace(escapedDelayedControl),
    OracleComparisonError,
  );
  const mutateThemeCheckpoint = (mutate) => {
    const trace = normalizedActionTrace();
    const transition = trace.steps.find(
      (entry) => entry.id === 'theme-round-trip',
    ).transition;
    const raw = structuredClone(transition.checkpoints[1]);
    mutate(raw);
    transition.checkpoints[1] = sealThemeCheckpointEvidence(raw);
    return trace;
  };
  for (const mutate of [
    (checkpoint) => {
      checkpoint.route.hash = '#q=v1.dGFtcGVyZWQ';
      checkpoint.route.key =
        `${checkpoint.route.pathname}${checkpoint.route.search}${checkpoint.route.hash}`;
    },
    (checkpoint) => {
      checkpoint.query.appliedSerialization = '{"scope":"personal"}';
    },
    (checkpoint) => {
      checkpoint.share.target.serialization =
        '{"query":{"scope":"personal"},"workspace":{"kind":"ranking"}}';
      checkpoint.share.target.token =
        `v1.${Buffer.from(
          checkpoint.share.target.serialization,
          'utf8',
        ).toString('base64url')}`;
      checkpoint.share.target.hash = `#q=${checkpoint.share.target.token}`;
      checkpoint.share.target.key =
        `${checkpoint.share.target.pathname}${checkpoint.share.target.search}${checkpoint.share.target.hash}`;
    },
    (checkpoint) => {
      checkpoint.query.revision += 1;
    },
    (checkpoint) => {
      checkpoint.resource.loadingCount = 1;
      checkpoint.resource.state = 'unstable';
    },
    (checkpoint) => {
      checkpoint.storage.current = null;
      checkpoint.storage.legacy = checkpoint.theme;
    },
  ]) {
    assert.throws(
      () => assertNormalizedActionTrace(mutateThemeCheckpoint(mutate)),
      OracleComparisonError,
    );
  }
});

test('exception selectors/properties and screenshot thresholds are closed', () => {
  const share = {
    authority: {
      heading: 'Share query contract',
      path: 'PRODUCT.md',
    },
    classification: 'approved-addition',
    id: 'ranking-share-action',
    properties: ['text-content', 'content-pixels'],
    route: '/ranking',
    selector: '.share-action',
    state: 'share-action',
  };
  const registry = {
    entries: [
      share,
      {
        classification: 'dynamic-data',
        id: 'dynamic',
        properties: ['text-content'],
        route: '/ranking',
        selector: '.dynamic',
        state: 'results',
      },
    ],
  };
  assert.equal(
    compileOracleExceptionEntries(registry, '/ranking', [
      'results',
      'share-action',
    ]).length,
    2,
  );
  assert.throws(
    () => compileOracleExceptionEntries(registry, '/ranking', ['results']),
    OracleComparisonError,
  );
  assert.throws(
    () =>
      compileOracleExceptionEntries(
        {
          entries: [
            { ...share, selector: '.app-header' },
            registry.entries[1],
          ],
        },
        '/ranking',
        ['results', 'share-action'],
      ),
    OracleComparisonError,
  );
  for (const entry of [
    { ...registry.entries[1], selector: '.dynamic *' },
    { ...registry.entries[1], properties: ['geometry'] },
  ]) {
    assert.throws(
      () =>
        compileOracleExceptionEntries(
          { entries: [share, entry] },
          '/ranking',
          ['results', 'share-action'],
        ),
      OracleComparisonError,
    );
  }
  assert.equal(
    assertScreenshotDifference(
      {
        differentPixelRatio: 0.001,
        dimensionsMatch: true,
        maxColorDelta: 8,
      },
      { maxColorDelta: 8, maxDifferentPixelRatio: 0.002 },
    ),
    true,
  );
  assert.throws(
    () =>
      assertScreenshotDifference(
        {
          differentPixelRatio: 0.003,
          dimensionsMatch: true,
          maxColorDelta: 8,
        },
        { maxColorDelta: 8, maxDifferentPixelRatio: 0.002 },
      ),
    OracleComparisonError,
  );
});

function validAuditEvidence() {
  return {
    actions: {
      drawer: 'not-applicable',
      focusVisible: { after: {}, before: {}, pass: true },
      personDrawer: 'not-applicable',
      queryEscapeAndReturn: true,
      responsive: null,
      tooltip: {
        blurClosed: true,
        clickOpened: true,
        escapeClosed: true,
        focusStayedAfterEscape: true,
        hoverOpened: true,
        keyboardOpened: true,
        targetFound: true,
      },
    },
    audit: {
      accessibleNameFailures: [],
      documentOverflowPx: 0,
      duplicateIds: [],
      motionMatches: true,
      outerScrollOwner: { tag: 'HTML' },
      scrollOwners: [],
      scrollViolations: [],
    },
    route: '/ranking',
    width: 1024,
  };
}

test('accessibility audit fails on missing focus/tooltip, duplicate IDs, overflow, or scroll evidence', () => {
  const valid = validAuditEvidence();
  assert.equal(assertCandidateAuditEvidence(valid), true);
  for (const mutation of [
    (value) => {
      value.actions.focusVisible.pass = false;
    },
    (value) => {
      value.actions.tooltip.hoverOpened = false;
    },
    (value) => {
      value.audit.duplicateIds.push('duplicate');
    },
    (value) => {
      value.audit.documentOverflowPx = 1;
    },
    (value) => {
      value.audit.scrollViolations.push({ selector: '.inner' });
    },
  ]) {
    const value = structuredClone(valid);
    mutation(value);
    assert.throws(() => assertCandidateAuditEvidence(value), OracleComparisonError);
  }
});

test('compact Drawer evidence requires mask close, background isolation, scroll containment, and focus return', () => {
  const value = validAuditEvidence();
  value.route = '/co-star';
  value.width = 390;
  value.actions.responsive = {
    mobileEntryVisible: true,
    railVisible: false,
  };
  value.actions.drawer = {
    backgroundOwner: { classes: ['app-shell'], tag: 'DIV' },
    backgroundTabBlocked: true,
    escapeClosed: true,
    escapeFocusReturned: true,
    focusTrapped: true,
    maskClosed: true,
    maskFocusReturned: true,
    scrollContained: true,
  };
  assert.equal(assertCandidateAuditEvidence(value), true);
  for (const field of [
    'backgroundTabBlocked',
    'escapeFocusReturned',
    'focusTrapped',
    'maskClosed',
    'maskFocusReturned',
    'scrollContained',
  ]) {
    const invalid = structuredClone(value);
    invalid.actions.drawer[field] = false;
    assert.throws(
      () => assertCandidateAuditEvidence(invalid),
      OracleComparisonError,
    );
  }
});

function monitorFixture(cellId = 'browser.light.1024.default') {
  return {
    allowSafeImageFailures: cellId === 'browser.safe-image',
    consoleMessages: [],
    contextRecord: {
      fixed: { cellId },
      kind: 'candidate',
      policy: {
        deniedPublic: [],
        documentObservations: [],
        interceptedApplicationRequests: [],
        safeImageAborts:
          cellId === 'browser.safe-image'
            ? ['/api/v1/images/bangumi/persons/1?type=small']
            : [],
        themeStorageAccesses: [],
        unexpectedNetwork: [],
      },
    },
    globalApiOnly: true,
    inPage: { layoutShifts: [], unhandledRejections: [] },
    pageErrors: [],
    requests: [],
    resources: [],
  };
}

test('latest-response and keyboard evidence reject same-request or skipped-action claims', () => {
  const latest = {
    latestRequestSeen: true,
    latestResponseSeen: true,
    latestToken: 'latest',
    staleOutcome: 'failed',
    staleRequestSeen: true,
    staleToken: 'stale',
    visibleState: 'empty',
    winner: 'latest',
  };
  assert.equal(assertLatestResponseEvidence(latest), true);
  assert.throws(
    () =>
      assertLatestResponseEvidence({
        ...latest,
        staleToken: latest.latestToken,
      }),
    BrowserJourneyError,
  );
  const keyboard = [
    'query-position',
    'query-submit',
    'ranking-search',
    'ranking-sort',
    'ranking-order',
    'ranking-page',
    'person-open',
    'person-view',
    'share',
    'theme',
    'mode',
    'candidate-select',
  ].map((id) => ({ id, input: 'keyboard' }));
  assert.equal(assertKeyboardTrace(keyboard), true);
  assert.throws(
    () => assertKeyboardTrace(keyboard.filter((entry) => entry.id !== 'share')),
    BrowserJourneyError,
  );
});

test('share consumption requires hash removal and one main document identity', () => {
  const evidence = {
    final: {
      hash: '',
      pathname: '/ranking',
      search: '',
    },
    mainDocuments: [
      {
        identity: 'main-document-1',
        method: 'GET',
        pathname: '/ranking',
        search: '',
        status: 200,
      },
    ],
    stableAnimationFrames: 2,
    stableWindowMs: 100,
    target: {
      hash: '#q=v1.dGVzdA',
      pathname: '/ranking',
      search: '',
    },
  };
  assert.equal(assertShareConsumptionNavigation(evidence), true);
  const retainedHash = structuredClone(evidence);
  retainedHash.final.hash = retainedHash.target.hash;
  assert.throws(
    () => assertShareConsumptionNavigation(retainedHash),
    (error) =>
      error instanceof BrowserJourneyError &&
      error.message ===
        'share-consumption did not clear its fragment on the exact route',
  );
  const extraReload = structuredClone(evidence);
  extraReload.mainDocuments.push({
    identity: 'main-document-2',
    method: 'GET',
    pathname: '/ranking',
    search: '',
    status: 200,
  });
  assert.throws(
    () => assertShareConsumptionNavigation(extraReload),
    (error) =>
      error instanceof BrowserJourneyError &&
      error.message ===
        'share-consumption created an additional main-document identity' &&
      error.evidence.mainDocuments.length === 2,
  );
  assert.equal(
    isExpectedShareNavigationContextDestroyed(
      new Error(
        'page.evaluate: Execution context was destroyed, most likely because of a navigation',
      ),
    ),
    true,
  );
  assert.equal(
    isExpectedShareNavigationContextDestroyed(
      new Error('page.evaluate: Target page, context or browser has been closed'),
    ),
    false,
  );
  assert.equal(
    isExpectedShareNavigationContextDestroyed(
      new Error('Execution context was destroyed'),
    ),
    false,
  );
});

test('each matrix cell requires every real production state and one candidate-only addition', () => {
  const ids = [
    'root-empty',
    'ranking-loading',
    'ranking-error',
    'ranking-empty',
    'ranking-query',
    'ranking-results',
    'ranking-person',
    'ranking-approved-addition',
    'co-star-loading',
    'co-star-error',
    'co-star-empty',
    'co-star-query',
    'co-star-candidates',
    'co-star-partners',
    'co-star-pair',
    'co-star-group',
  ];
  const scenarios = ids.map((id) => ({
    candidate: 1,
    id,
    intercepted: false,
    oracle: id === 'ranking-approved-addition' ? 0 : 1,
    source: 'production-state-machine',
  }));
  assert.equal(assertClosedStateScenarioCoverage(scenarios), true);
  assert.throws(
    () => assertClosedStateScenarioCoverage(scenarios.slice(1)),
    BrowserAcceptanceError,
  );
  const intercepted = structuredClone(scenarios);
  intercepted[1].intercepted = true;
  assert.throws(
    () => assertClosedStateScenarioCoverage(intercepted),
    BrowserAcceptanceError,
  );
});

test('loading state observation is rejected without stable paired oracle evidence', () => {
  assert.throws(
    () => assertLoadingComparisonCoverage([]),
    BrowserAcceptanceError,
  );
  const loadingComparison = (scenarioId, guard) => ({
    candidate: { document: { width: 1024 } },
    loadingState: {
      checkpoints: [
        'before-fonts',
        'after-fonts',
        'after-snapshot',
        'before-screenshot',
        'after-screenshot',
      ].map((checkpoint) => ({
        candidate: [guard.candidate[0]],
        checkpoint,
        motion: {
          candidate: 'active',
          oracle: 'active',
        },
        oracle: [guard.oracle[0]],
      })),
      guard,
      preference: 'default',
    },
    oracle: { document: { width: 1024 } },
    pixels: { dimensionsMatch: true },
    scenarioId,
    screenshots: [
      { kind: 'candidate' },
      { kind: 'oracle' },
      { kind: 'difference' },
    ],
    structural: { matched: true },
  });
  const comparisons = [
    loadingComparison('ranking-loading', {
      candidate: ['.ranking-surface--loading[aria-busy="true"]'],
      oracle: [
        '.workbench-state[aria-busy="true"]',
        '.query-skeleton--ranking[aria-busy="true"]',
      ],
    }),
    loadingComparison('co-star-loading', {
      candidate: [
        '.query-result-state[aria-busy="true"]',
        '.candidate-row-skeletons',
      ],
      oracle: [
        '.workbench-state[aria-busy="true"]',
        '.query-skeleton--co-star[aria-busy="true"]',
      ],
    }),
  ];
  assert.equal(assertLoadingComparisonCoverage(comparisons), true);
  comparisons[0].loadingState.checkpoints.pop();
  assert.throws(
    () => assertLoadingComparisonCoverage(comparisons),
    BrowserAcceptanceError,
  );
});

test('SafeImage evidence is terminal per slot/URL and stable for the full window', () => {
  const ledger = [
    {
      removed: false,
      sizes: ['36x48'],
      slot: 'slot-1',
      state: 'error',
      urls: [
        '/api/v1/images/bangumi/persons/1?type=large',
        '/api/v1/images/bangumi/persons/1?type=medium',
        '/api/v1/images/bangumi/persons/1?type=small',
      ],
    },
  ];
  const abortPaths = ledger[0].urls;
  const stableSample = [
    {
      size: '36x48',
      slot: 'slot-1',
      state: 'error',
      url: null,
    },
  ];
  const stableWindow = {
    stableWindowMs: 1_500,
    windowMutations: [],
    windowSamples: [
      structuredClone(stableSample),
      structuredClone(stableSample),
    ],
    windowStartSampleIndex: 7,
  };
  assert.equal(
    assertSafeImageLedger({
      abortPaths,
      after: structuredClone(ledger),
      before: structuredClone(ledger),
      ...stableWindow,
    }),
    true,
  );
  assert.throws(
    () =>
      assertSafeImageLedger({
        abortPaths: [...abortPaths, abortPaths[0]],
        after: structuredClone(ledger),
        before: structuredClone(ledger),
        ...stableWindow,
      }),
    BrowserAcceptanceError,
  );
  const replaced = structuredClone(ledger);
  replaced[0].removed = true;
  assert.throws(
    () =>
      assertSafeImageLedger({
        abortPaths,
        after: replaced,
        before: structuredClone(ledger),
        ...stableWindow,
      }),
    BrowserAcceptanceError,
  );
  const flickered = structuredClone(stableWindow);
  flickered.windowSamples.splice(1, 0, [
    {
      ...stableSample[0],
      state: 'loading',
    },
  ]);
  assert.throws(
    () =>
      assertSafeImageLedger({
        abortPaths,
        after: structuredClone(ledger),
        before: structuredClone(ledger),
        ...flickered,
      }),
    BrowserAcceptanceError,
  );
  const coalesced = reconstructSafeImageAttributeTransitions([
    {
      attribute: 'data-image-state',
      currentValue: 'error',
      oldValue: 'error',
      slot: 'slot-1',
    },
    {
      attribute: 'data-image-state',
      currentValue: 'error',
      oldValue: 'loading',
      slot: 'slot-1',
    },
  ]);
  assert.deepEqual(
    coalesced.map(({ newValue, oldValue }) => ({ newValue, oldValue })),
    [
      { newValue: 'loading', oldValue: 'error' },
      { newValue: 'error', oldValue: 'loading' },
    ],
  );
  assert.throws(
    () =>
      assertSafeImageLedger({
        abortPaths,
        after: structuredClone(ledger),
        before: structuredClone(ledger),
        ...stableWindow,
        windowMutations: coalesced,
      }),
    BrowserAcceptanceError,
  );
});

test('monitor is fail-closed for console, network, resource, rejection, and missing evidence', () => {
  assert.equal(assertPageMonitorOutcome(monitorFixture()).globalApiOnly, true);
  for (const mutation of [
    (value) => value.consoleMessages.push({ type: 'error' }),
    (value) => value.contextRecord.policy.unexpectedNetwork.push('https://x'),
    (value) => value.contextRecord.policy.deniedPublic.push('https://oracle.invalid'),
    (value) =>
      value.contextRecord.policy.interceptedApplicationRequests.push(
        '/api/v1/rankings',
      ),
    (value) => value.resources.push({ type: 'http-error', status: 502 }),
    (value) => value.inPage.unhandledRejections.push('rejected'),
    (value) => {
      value.inPage = null;
    },
    (value) => {
      value.globalApiOnly = false;
    },
  ]) {
    const value = structuredClone(monitorFixture());
    mutation(value);
    assert.throws(() => assertPageMonitorOutcome(value), BrowserRuntimeError);
  }
  for (const action of [
    'getItem',
    'setItem',
    'removeItem',
    'clear',
    'key',
    'named-delete',
    'named-descriptor',
    'named-define',
    'named-get',
    'named-has',
    'named-set',
    'ownKeys',
  ]) {
    const value = structuredClone(monitorFixture());
    value.contextRecord.policy.themeStorageAccesses.push({
      action,
      frame: '/ranking',
      key: ['clear', 'key', 'ownKeys'].includes(action)
        ? null
        : 'bgmss-workbench-theme',
    });
    assert.throws(() => assertPageMonitorOutcome(value), BrowserRuntimeError);
  }
});

test('monitor accumulates prior-document observations instead of losing them on navigation', () => {
  const layout = monitorFixture();
  layout.contextRecord.policy.documentObservations.push({
    frame: '/ranking',
    kind: 'layout-shift',
    value: 0.125,
  });
  assert.deepEqual(assertPageMonitorOutcome(layout).layoutShifts, [0.125]);
  const rejection = monitorFixture();
  rejection.contextRecord.policy.documentObservations.push({
    frame: '/co-star',
    kind: 'unhandled-rejection',
    value: 'prior document rejected',
  });
  assert.throws(
    () => assertPageMonitorOutcome(rejection),
    BrowserRuntimeError,
  );
});

test('external network residue is derived from candidate and oracle policy facts', () => {
  assert.equal(
    countExternalNetworkAttempts([
      {
        kind: 'candidate',
        policy: {
          unexpectedNetwork: ['https://candidate.invalid/image'],
        },
      },
      {
        kind: 'oracle',
        policy: {
          deniedPublic: [
            'https://oracle.invalid/image',
            'https://oracle.invalid/font',
          ],
        },
      },
    ]),
    3,
  );
  assert.deepEqual(
    externalNetworkAttemptFacts([
      {
        kind: 'candidate',
        policy: {
          unexpectedNetwork: ['https://candidate.invalid/image'],
        },
      },
      {
        kind: 'oracle',
        policy: {
          deniedPublic: [
            'https://oracle.invalid/image',
            'https://oracle.invalid/font',
          ],
        },
      },
    ]),
    {
      candidateUnexpected: 1,
      oracleDenied: 2,
      total: 3,
    },
  );
  assert.equal(
    countExternalNetworkAttempts([
      { kind: 'candidate', policy: { unexpectedNetwork: [] } },
      { kind: 'oracle', policy: { deniedPublic: [] } },
    ]),
    0,
  );
  assert.throws(
    () =>
      countExternalNetworkAttempts([
        { kind: 'candidate', policy: { unexpectedNetwork: [null] } },
      ]),
    BrowserAcceptanceError,
  );
});

test('SafeImage abort allowance is bound to only browser.safe-image', async () => {
  assert.doesNotThrow(() =>
    assertPageMonitorOutcome(monitorFixture('browser.safe-image')),
  );
  const normalWithAbort = monitorFixture();
  normalWithAbort.contextRecord.policy.safeImageAborts.push(
    '/api/v1/images/bangumi/persons/1?type=small',
  );
  assert.throws(
    () => assertPageMonitorOutcome(normalWithAbort),
    BrowserRuntimeError,
  );
  await assert.rejects(
    createFixedContext({
      allowedOrigin: 'http://127.0.0.1:1234',
      browser: {},
      cellId: 'browser.light.1024.default',
      kind: 'candidate',
      motion: 'default',
      safeImageAbort: true,
      theme: 'light',
      width: 1024,
    }),
    BrowserRuntimeError,
  );
});

test('Playwright resolves only from one canonical run-owned package root', (t) => {
  const runRoot = temporaryRoot(t);
  const packageRoot = path.join(
    runRoot,
    'install',
    'node_modules',
    '@playwright',
    'test',
  );
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(
    path.join(packageRoot, 'package.json'),
    JSON.stringify({
      main: 'index.cjs',
      name: '@playwright/test',
      version: '1.61.0',
    }),
  );
  fs.writeFileSync(
    path.join(packageRoot, 'index.cjs'),
    'module.exports = { chromium: { source: "isolated-run-root" } };',
  );
  assert.equal(
    loadRunOwnedPlaywright({ playwrightPackageRoot: packageRoot, runRoot })
      .chromium.source,
    'isolated-run-root',
  );
  const otherRoot = temporaryRoot(t);
  assert.throws(
    () =>
      loadRunOwnedPlaywright({
        playwrightPackageRoot: packageRoot,
        runRoot: otherRoot,
      }),
  );
});

test('Chromium executable must be a new-inode executable below the run root', (t) => {
  const runRoot = temporaryRoot(t);
  const browserRoot = path.join(runRoot, 'browser');
  fs.mkdirSync(browserRoot);
  const executable = path.join(browserRoot, 'chromium');
  fs.writeFileSync(executable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  assert.equal(
    requireRunOwnedChromiumExecutable({ executablePath: executable, runRoot }),
    executable,
  );

  const outsideRoot = temporaryRoot(t);
  const outsideExecutable = path.join(outsideRoot, 'chromium');
  fs.writeFileSync(outsideExecutable, '#!/bin/sh\nexit 0\n', { mode: 0o700 });
  assert.throws(
    () =>
      requireRunOwnedChromiumExecutable({
        executablePath: outsideExecutable,
        runRoot,
      }),
    /strictly below/u,
  );

  const linkedExecutable = path.join(browserRoot, 'chromium-linked');
  fs.linkSync(executable, linkedExecutable);
  assert.throws(
    () =>
      requireRunOwnedChromiumExecutable({
        executablePath: executable,
        runRoot,
      }),
    BrowserRuntimeError,
  );
});

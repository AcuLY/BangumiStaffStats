import { ORACLE_REVISION } from '../lib/constants.mjs';
import { seedNpmCache } from '../lib/cache.mjs';
import { writeEvidence } from '../lib/evidence.mjs';
import { requireCanonicalPath } from '../lib/paths.mjs';
import { prepareCandidateFrontend } from './artifact.mjs';
import {
  auditCandidatePage,
  assertNormalizedActionTracePair,
  captureNormalizedActionTrace,
  captureOracleComparison,
  OracleComparisonError,
} from './compare.mjs';
import {
  consumeShareNavigation,
  runRealDataJourneys,
  verifyShareConsumptionNegativeControls,
} from './journey.mjs';
import { buildOracle, materializeOracleSource } from './oracle.mjs';
import {
  createFixedContext,
  createPageMonitor,
  launchAcceptedChromium,
  verifyLegacyThemeStorageNegativeControls,
} from './runtime.mjs';
import { startAcceptanceServer } from './server.mjs';

const CELL_ID =
  /^browser\.(light|dark)\.(360|390|779|780|1024|1440)\.(default|reduced)$/u;
const CLOSED_STATE_SCENARIOS = Object.freeze([
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
]);
const LOADING_COMPARISON_GUARDS = Object.freeze({
  'co-star-loading': Object.freeze({
    candidate: Object.freeze([
      '.query-result-state[aria-busy="true"]',
      '.candidate-row-skeletons',
    ]),
    oracle: Object.freeze([
      '.workbench-state[aria-busy="true"]',
      '.query-skeleton--co-star[aria-busy="true"]',
    ]),
  }),
  'ranking-loading': Object.freeze({
    candidate: Object.freeze([
      '.ranking-surface--loading[aria-busy="true"]',
    ]),
    oracle: Object.freeze([
      '.workbench-state[aria-busy="true"]',
      '.query-skeleton--ranking[aria-busy="true"]',
    ]),
  }),
});
const LOADING_CHECKPOINTS = Object.freeze([
  'before-fonts',
  'after-fonts',
  'after-snapshot',
  'before-screenshot',
  'after-screenshot',
]);

export class BrowserAcceptanceError extends Error {
  constructor(message, evidence = []) {
    super(message);
    this.evidence = evidence;
  }
}

function fail(message, evidence) {
  throw new BrowserAcceptanceError(message, evidence);
}

export function externalNetworkAttemptFacts(contextRecords) {
  if (!Array.isArray(contextRecords)) {
    fail('external network attempt contexts are missing');
  }
  const facts = {
    candidateUnexpected: 0,
    oracleDenied: 0,
    total: 0,
  };
  for (const contextRecord of contextRecords) {
    const field =
      contextRecord?.kind === 'candidate'
        ? 'unexpectedNetwork'
        : contextRecord?.kind === 'oracle'
          ? 'deniedPublic'
          : null;
    const attempts = field ? contextRecord?.policy?.[field] : null;
    if (
      !Array.isArray(attempts) ||
      attempts.some((attempt) => typeof attempt !== 'string' || !attempt)
    ) {
      fail('external network attempt evidence is malformed');
    }
    if (contextRecord.kind === 'candidate') {
      facts.candidateUnexpected += attempts.length;
    } else {
      facts.oracleDenied += attempts.length;
    }
    facts.total += attempts.length;
  }
  return Object.freeze(facts);
}

export function countExternalNetworkAttempts(contextRecords) {
  return externalNetworkAttemptFacts(contextRecords).total;
}

export function reconstructSafeImageAttributeTransitions(records) {
  if (
    !Array.isArray(records) ||
    records.some(
      (record) =>
        record === null ||
        typeof record !== 'object' ||
        !['class', 'data-image-state', 'src', 'srcset', 'style'].includes(
          record.attribute,
        ) ||
        !/^slot-[1-9][0-9]*$/u.test(record.slot) ||
        !Object.hasOwn(record, 'oldValue') ||
        !Object.hasOwn(record, 'currentValue') ||
        (record.oldValue !== null && typeof record.oldValue !== 'string') ||
        (record.currentValue !== null &&
          typeof record.currentValue !== 'string'),
    )
  ) {
    fail('SafeImage raw MutationRecord batch is malformed');
  }
  return Object.freeze(
    records.map((record, index) => {
      const next = records
        .slice(index + 1)
        .find(
          (candidate) =>
            candidate.slot === record.slot &&
            candidate.attribute === record.attribute,
        );
      return Object.freeze({
        attribute: record.attribute,
        kind: 'attribute',
        newValue: next ? next.oldValue : record.currentValue,
        oldValue: record.oldValue,
        slot: record.slot,
      });
    }),
  );
}

function accumulateExternalNetworkAttempts(performanceFacts, contextRecords) {
  const current = externalNetworkAttemptFacts(contextRecords);
  performanceFacts.externalNetworkAttemptFacts.candidateUnexpected +=
    current.candidateUnexpected;
  performanceFacts.externalNetworkAttemptFacts.oracleDenied +=
    current.oracleDenied;
  performanceFacts.externalNetworkAttemptFacts.total += current.total;
  performanceFacts.externalNetworkAttempts =
    performanceFacts.externalNetworkAttemptFacts.total;
}

export function assertSafeImageLedger({
  abortPaths,
  after,
  before,
  stableWindowMs,
  windowMutations,
  windowSamples,
  windowStartSampleIndex,
}) {
  if (
    !Array.isArray(abortPaths) ||
    !Array.isArray(before) ||
    !Array.isArray(after) ||
    before.length === 0 ||
    stableWindowMs < 1_500 ||
    !Number.isSafeInteger(windowStartSampleIndex) ||
    windowStartSampleIndex < 0 ||
    !Array.isArray(windowMutations) ||
    !Array.isArray(windowSamples) ||
    windowSamples.length < 2
  ) {
    fail('SafeImage slot/URL ledger evidence is incomplete');
  }
  const normalized = (entries) =>
    entries.map((entry) => ({
      removed: entry.removed,
      sizes: [...entry.sizes].sort(),
      slot: entry.slot,
      state: entry.state,
      urls: [...entry.urls].sort(),
    }));
  const left = normalized(before);
  const right = normalized(after);
  if (JSON.stringify(left) !== JSON.stringify(right)) {
    fail('SafeImage slot was replaced, removed, or mutated in the stable window');
  }
  const normalizeSample = (sample) => {
    if (
      !Array.isArray(sample) ||
      sample.some(
        (entry) =>
          entry === null ||
          typeof entry !== 'object' ||
          !/^slot-[1-9][0-9]*$/u.test(entry.slot) ||
          typeof entry.size !== 'string' ||
          !/^[0-9]+(?:\.[0-9]+)?x[0-9]+(?:\.[0-9]+)?$/u.test(entry.size) ||
          entry.state !== 'error' ||
          (entry.url !== null &&
            (typeof entry.url !== 'string' || entry.url.length === 0)),
      )
    ) {
      fail('SafeImage stable-window sample is not terminal error evidence', {
        sample,
        windowStartSampleIndex,
      });
    }
    const normalizedSample = sample
      .map((entry) => ({
        size: entry.size,
        slot: entry.slot,
        state: entry.state,
        url: entry.url,
      }))
      .sort((first, second) => first.slot.localeCompare(second.slot));
    if (
      normalizedSample.length !== before.length ||
      new Set(normalizedSample.map((entry) => entry.slot)).size !==
        normalizedSample.length
    ) {
      fail('SafeImage stable-window sample changed its closed slot set', {
        normalizedSample,
        windowStartSampleIndex,
      });
    }
    return normalizedSample;
  };
  const baselineSample = normalizeSample(windowSamples[0]);
  for (const sample of windowSamples.slice(1)) {
    if (
      JSON.stringify(normalizeSample(sample)) !==
      JSON.stringify(baselineSample)
    ) {
      fail(
        'SafeImage changed slot, URL, state, or geometry inside the stable window',
        {
          baselineSample,
          sample,
          windowStartSampleIndex,
        },
      );
    }
  }
  for (const mutation of windowMutations) {
    if (
      mutation === null ||
      typeof mutation !== 'object' ||
      !['attribute', 'child-list'].includes(mutation.kind) ||
      !/^slot-[1-9][0-9]*$/u.test(mutation.slot)
    ) {
      fail('SafeImage stable-window mutation evidence is malformed', mutation);
    }
    if (mutation.kind === 'child-list') {
      if (
        !Number.isSafeInteger(mutation.added) ||
        mutation.added < 0 ||
        !Number.isSafeInteger(mutation.removed) ||
        mutation.removed < 0
      ) {
        fail('SafeImage child-list mutation evidence is malformed', mutation);
      }
      if (mutation.added > 0 || mutation.removed > 0) {
        fail('SafeImage slot content was replaced inside the stable window', {
          mutation,
          windowStartSampleIndex,
        });
      }
      continue;
    }
    if (
      !['class', 'data-image-state', 'src', 'srcset', 'style'].includes(
        mutation.attribute,
      ) ||
      !Object.hasOwn(mutation, 'oldValue') ||
      !Object.hasOwn(mutation, 'newValue') ||
      (mutation.oldValue !== null &&
        typeof mutation.oldValue !== 'string') ||
      (mutation.newValue !== null &&
        typeof mutation.newValue !== 'string')
    ) {
      fail('SafeImage attribute mutation evidence is malformed', mutation);
    }
    if (
      mutation.attribute === 'data-image-state'
        ? mutation.oldValue !== 'error' || mutation.newValue !== 'error'
        : mutation.oldValue !== mutation.newValue
    ) {
      fail(
        'SafeImage changed state, URL, class, or geometry authority inside the stable window',
        { mutation, windowStartSampleIndex },
      );
    }
  }
  const attempts = new Map();
  for (const reference of abortPaths) {
    attempts.set(reference, (attempts.get(reference) ?? 0) + 1);
  }
  const expectedAttempts = new Map();
  for (const entry of left) {
    if (
      !/^slot-[1-9][0-9]*$/u.test(entry.slot) ||
      entry.removed !== false ||
      entry.state !== 'error' ||
      entry.sizes.length !== 1 ||
      entry.urls.length === 0
    ) {
      fail('SafeImage slot did not reach one stable terminal geometry', entry);
    }
    for (const reference of entry.urls) {
      expectedAttempts.set(
        reference,
        (expectedAttempts.get(reference) ?? 0) + 1,
      );
    }
  }
  if (
    expectedAttempts.size !== attempts.size ||
    [...new Set([...expectedAttempts.keys(), ...attempts.keys()])].some(
      (reference) => expectedAttempts.get(reference) !== attempts.get(reference),
    )
  ) {
    fail('SafeImage URL did not have exactly one attempt per observed slot', {
      attempts: Object.fromEntries(attempts),
      expectedAttempts: Object.fromEntries(expectedAttempts),
    });
  }
  return true;
}

export function assertClosedStateScenarioCoverage(scenarios) {
  if (
    !Array.isArray(scenarios) ||
    scenarios.length !== CLOSED_STATE_SCENARIOS.length
  ) {
    fail('browser cell state-scenario evidence is not the closed set');
  }
  for (const [index, id] of CLOSED_STATE_SCENARIOS.entries()) {
    const scenario = scenarios[index];
    if (
      scenario === null ||
      typeof scenario !== 'object' ||
      scenario.id !== id ||
      scenario.candidate !== 1 ||
      scenario.intercepted !== false ||
      scenario.source !== 'production-state-machine' ||
      scenario.oracle !== (id === 'ranking-approved-addition' ? 0 : 1)
    ) {
      fail(`browser state scenario ${id} is not exact`, scenario);
    }
  }
  return true;
}

export function assertLoadingComparisonCoverage(comparisons) {
  if (!Array.isArray(comparisons)) {
    fail('paired loading comparison evidence is missing');
  }
  for (const [scenarioId, guard] of Object.entries(
    LOADING_COMPARISON_GUARDS,
  )) {
    const matching = comparisons.filter(
      (comparison) => comparison?.scenarioId === scenarioId,
    );
    if (matching.length !== 1) {
      fail(`loading scenario ${scenarioId} has no unique fixed-oracle comparison`);
    }
    const [comparison] = matching;
    const checkpoints = comparison.loadingState?.checkpoints;
    const preference = comparison.loadingState?.preference;
    const expectedMotion =
      preference === 'reduced'
        ? 'suppressed'
        : preference === 'default'
          ? 'active'
          : null;
    const screenshotKinds = new Set(
      Array.isArray(comparison.screenshots)
        ? comparison.screenshots.map((entry) => entry?.kind)
        : [],
    );
    if (
      JSON.stringify(comparison.loadingState?.guard) !==
        JSON.stringify(guard) ||
      !Array.isArray(checkpoints) ||
      checkpoints.length !== LOADING_CHECKPOINTS.length ||
      expectedMotion === null ||
      checkpoints.some(
        (entry, index) =>
          entry?.checkpoint !== LOADING_CHECKPOINTS[index] ||
          !Array.isArray(entry.candidate) ||
          entry.candidate.length === 0 ||
          !Array.isArray(entry.oracle) ||
          entry.oracle.length === 0 ||
          entry.motion?.candidate !== expectedMotion ||
          entry.motion?.oracle !== expectedMotion,
      ) ||
      !comparison.candidate?.document ||
      !comparison.oracle?.document ||
      comparison.structural?.matched !== true ||
      comparison.pixels?.dimensionsMatch !== true ||
      !['candidate', 'oracle', 'difference'].every((kind) =>
        screenshotKinds.has(kind),
      )
    ) {
      fail(
        `loading scenario ${scenarioId} was observed without a stable paired comparison`,
        comparison,
      );
    }
  }
  return true;
}

function exactRegistry(value) {
  if (
    value === null ||
    typeof value !== 'object' ||
    value.oracleRevision !== ORACLE_REVISION ||
    value.schemaVersion !== 1 ||
    value.screenshotThreshold?.maxDifferentPixelRatio !== 0.002 ||
    value.screenshotThreshold?.maxColorDelta !== 8 ||
    !Array.isArray(value.entries)
  ) {
    fail('oracle exception registry is not the accepted closed registry');
  }
  return value;
}

async function jsonEvidence(runRoot, relative, kind, value, summary) {
  return writeEvidence({
    kind,
    relative,
    runRoot,
    summary,
    value,
  });
}

function sanitizedFailure(error) {
  return String(error instanceof Error ? error.message : error)
    .replaceAll(/[\r\n\t]+/gu, ' ')
    .replaceAll(/\s{2,}/gu, ' ')
    .replaceAll(/(?:[A-Za-z]:)?\/[^\s"']+/gu, '<path>')
    .slice(0, 512);
}

async function firstVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  fail(`browser scenario is missing visible ${label}`);
}

async function waitForVisibleSelector(page, selectors) {
  await page.waitForFunction(
    (accepted) =>
      accepted.some((selector) =>
        [...document.querySelectorAll(selector)].some((element) => {
          const style = getComputedStyle(element);
          const box = element.getBoundingClientRect();
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            box.width > 0 &&
            box.height > 0
          );
        }),
      ),
    selectors,
  );
}

async function keyboardActivate(locator) {
  await locator.focus();
  await locator.press('Enter');
}

async function openQueryEditor(page) {
  const summary = await firstVisible(
    page.locator('.query-summary'),
    'query summary',
  );
  if ((await summary.getAttribute('aria-expanded')) !== 'true') {
    await keyboardActivate(summary);
  }
  await page.locator('#query-editor').waitFor({ state: 'visible' });
  return summary;
}

async function configureRatingCount(page, minimum, maximum) {
  const advanced = await firstVisible(
    page.getByRole('button', { name: '更多选项' }),
    'advanced query trigger',
  );
  if ((await advanced.getAttribute('aria-expanded')) !== 'true') {
    await keyboardActivate(advanced);
  }
  const toggle = await firstVisible(
    page.getByRole('switch', { name: '评分人数范围' }),
    'rating-count switch',
  );
  if ((await toggle.getAttribute('aria-checked')) !== 'true') {
    await keyboardActivate(toggle);
  }
  await page.getByLabel('评分人数下限').fill(minimum);
  await page.getByLabel('评分人数上限').fill(maximum);
}

async function submitQuery(page) {
  const submit = await firstVisible(
    page.locator('#query-editor button[type="submit"]'),
    'query submit',
  );
  await keyboardActivate(submit);
}

async function closeQueryEditor(page) {
  if (!(await page.locator('#query-editor').isVisible().catch(() => false))) {
    return;
  }
  await page.keyboard.press('Escape');
  await page.locator('#query-editor').waitFor({ state: 'hidden' });
}

async function openCandidatePicker(page, kind, width) {
  if (width >= 780) return;
  const selector =
    kind === 'candidate' ? '.co-star-mobile-entry' : '.mobile-picker-entry';
  const opener = await firstVisible(
    page.locator(selector),
    `${kind} candidate picker`,
  );
  await keyboardActivate(opener);
  await page
    .locator(
      kind === 'candidate'
        ? '#co-star-mobile-picker'
        : '#mobile-person-picker',
    )
    .waitFor({ state: 'visible' });
}

async function closeCandidatePicker(page, kind, width) {
  if (width >= 780) return;
  const selector =
    kind === 'candidate'
      ? '#co-star-mobile-picker'
      : '#mobile-person-picker';
  if (!(await page.locator(selector).isVisible().catch(() => false))) return;
  await page.keyboard.press('Escape');
  await page.locator(selector).waitFor({ state: 'hidden' });
}

async function setOraclePersonCount(page, count, width) {
  await openCandidatePicker(page, 'oracle', width);
  const rows = page.locator('.selected-person-row');
  while ((await rows.count()) > count) {
    const remove = await firstVisible(
      rows.last().locator('.selected-person-row__remove'),
      'oracle selected-person removal',
    );
    await keyboardActivate(remove);
  }
  if ((await rows.count()) !== count) {
    fail(`oracle selected-person count did not reach ${count}`);
  }
}

async function pagePerformanceFacts(page) {
  return page.evaluate(() => {
    const navigation = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource');
    return {
      domNodes: document.getElementsByTagName('*').length,
      readyMs: Math.max(
        0,
        Math.round(
          navigation?.domContentLoadedEventEnd ??
            navigation?.duration ??
            0,
        ),
      ),
      transferBytes: Math.max(
        0,
        Math.round(
          resources.reduce(
            (total, entry) => total + (entry.transferSize || 0),
            navigation?.transferSize || 0,
          ),
        ),
      ),
    };
  });
}

function comparisonParts(comparisons, part) {
  if (part === 'dom') {
    return comparisons.map((comparison) => ({
      candidate: comparison.candidate.semantic,
      candidateExceptionSurfaces: comparison.candidate.exceptionSurfaces.map(
        (entry) => ({
          classification: entry.classification,
          id: entry.id,
          surfaces: entry.surfaces.map((surface) => ({
            nodes: surface.nodes.map((node) => ({
              action: node.action,
              path: node.path,
              role: node.role,
              state: node.state,
              tag: node.tag,
            })),
            role: surface.role,
            tag: surface.tag,
          })),
        }),
      ),
      differences: comparison.structural.differences.filter((difference) =>
        [
          'dynamic-semantic-format',
          'semantic',
          'semantic-node',
        ].includes(difference.kind),
      ),
      oracle: comparison.oracle.semantic,
      oracleExceptionSurfaces: comparison.oracle.exceptionSurfaces.map(
        (entry) => ({
          classification: entry.classification,
          id: entry.id,
          surfaces: entry.surfaces.map((surface) => ({
            nodes: surface.nodes.map((node) => ({
              action: node.action,
              path: node.path,
              role: node.role,
              state: node.state,
              tag: node.tag,
            })),
            role: surface.role,
            tag: surface.tag,
          })),
        }),
      ),
      route: comparison.route,
      scenarioId: comparison.scenarioId,
      states: comparison.states,
    }));
  }
  if (part === 'geometry') {
    return comparisons.map((comparison) => ({
      candidateDocument: comparison.candidate.document,
      candidateExceptionGeometry:
        comparison.candidate.exceptionSurfaces.map((entry) => ({
          id: entry.id,
          surfaces: entry.surfaces.map((surface) => ({
            box: surface.box,
            nodes: surface.nodes.map((node) => ({
              box: node.box,
              path: node.path,
            })),
          })),
        })),
      candidateLandmarks: comparison.candidate.landmarks,
      differences: comparison.structural.differences.filter(
        (difference) =>
          difference.kind === 'geometry' ||
          difference.kind === 'landmarks' ||
          difference.kind === 'landmark-role' ||
          difference.kind === 'class-count',
      ),
      oracleDocument: comparison.oracle.document,
      oracleExceptionGeometry: comparison.oracle.exceptionSurfaces.map(
        (entry) => ({
          id: entry.id,
          surfaces: entry.surfaces.map((surface) => ({
            box: surface.box,
            nodes: surface.nodes.map((node) => ({
              box: node.box,
              path: node.path,
            })),
          })),
        }),
      ),
      oracleLandmarks: comparison.oracle.landmarks,
      route: comparison.route,
      scenarioId: comparison.scenarioId,
    }));
  }
  return comparisons.map((comparison) => ({
    candidateExceptionStyles: comparison.candidate.exceptionSurfaces.map(
      (entry) => ({
        id: entry.id,
        surfaces: entry.surfaces.map((surface) =>
          surface.nodes.map((node) => ({
            path: node.path,
            styles: node.styles,
          })),
        ),
      }),
    ),
    commonClassCount: comparison.structural.commonClassCount,
    differences: comparison.structural.differences.filter(
      (difference) =>
        difference.kind === 'style' ||
        difference.kind === 'exception-style' ||
        difference.kind === 'dynamic-surface-format',
    ),
    oracleExceptionStyles: comparison.oracle.exceptionSurfaces.map((entry) => ({
      id: entry.id,
      surfaces: entry.surfaces.map((surface) =>
        surface.nodes.map((node) => ({
          path: node.path,
          styles: node.styles,
        })),
      ),
    })),
    route: comparison.route,
    scenarioId: comparison.scenarioId,
  }));
}

class BrowserAcceptanceSession {
  #apiRequest;
  #browserRecord;
  #candidate;
  #candidateServer;
  #closed = false;
  #options;
  #oracle;
  #oracleServer;
  #performance = {
    actionMs: 0,
    domNodes: 0,
    externalNetworkAttemptFacts: {
      candidateUnexpected: 0,
      oracleDenied: 0,
      total: 0,
    },
    externalNetworkAttempts: 0,
    journeyMs: 0,
    readyMs: 0,
    requestCount: 0,
    transferBytes: 0,
  };
  #shares;

  constructor(options) {
    this.#options = options;
    this.#apiRequest = options.apiRequest;
  }

  #assertOpen() {
    if (this.#closed) fail('browser acceptance session is closed');
  }

  async #ensureBrowser() {
    if (!this.#browserRecord) {
      this.#browserRecord = await launchAcceptedChromium({
        executablePath: this.#options.chromiumExecutable,
        expectedVersion: this.#options.chromiumVersion,
        playwrightPackageRoot: this.#options.playwrightPackageRoot,
        runRoot: this.#options.runRoot,
      });
    }
    return this.#browserRecord;
  }

  async serveCandidate() {
    this.#assertOpen();
    if (this.#candidateServer) fail('candidate frontend is already served');
    this.#candidate = await prepareCandidateFrontend({
      frontendTarPath: this.#options.frontendTarPath,
      runRoot: this.#options.runRoot,
    });
    this.#candidateServer = await startAcceptanceServer({
      apiRequest: this.#apiRequest,
      kind: 'candidate',
      root: this.#candidate.root,
      runRoot: this.#options.runRoot,
    });
    return Object.freeze([
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/candidate-artifact.json',
        'artifactSeal',
        {
          artifactDigest: this.#candidate.artifactDigest,
          entries: this.#candidate.artifactEntries,
          rootDigest: this.#candidate.rootDigest,
        },
        'accepted packaged frontend extracted and sealed',
      ),
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/candidate-server.json',
        'serverOrigin',
        this.#candidateServer.facts,
        'exact IPv4 loopback candidate server with closed API adapter',
      ),
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/candidate-bundle-policy.json',
        'bundlePolicy',
        this.#candidate.bundlePolicy,
        'no source, fixture, prototype, test, or direct public origin in bundle',
      ),
    ]);
  }

  async materializeOracle() {
    this.#assertOpen();
    if (!this.#candidateServer) fail('candidate frontend must be served first');
    if (this.#oracleServer) fail('oracle is already materialized');
    const oracleSource = await materializeOracleSource({
      gitExecutable: this.#options.gitExecutable,
      repositoryRoot: this.#options.repositoryRoot,
      runRoot: this.#options.runRoot,
      timeoutMs: this.#options.oracleTimeoutMs,
    });
    seedNpmCache({
      source: this.#options.npmCacheSource,
      destination: this.#options.npmCacheRoot,
      lockPaths: [`${oracleSource.sourceRoot}/package-lock.json`],
    });
    this.#oracle = await buildOracle({
      nodeExecutable: this.#options.nodeExecutable,
      npmCacheRoot: this.#options.npmCacheRoot,
      npmCliPath: this.#options.npmCliPath,
      oracleSource,
      runRoot: this.#options.runRoot,
      timeoutMs: this.#options.oracleTimeoutMs,
    });
    this.#oracleServer = await startAcceptanceServer({
      kind: 'oracle',
      root: this.#oracle.distRoot,
      runRoot: this.#options.runRoot,
    });
    return Object.freeze([
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/oracle-identity.json',
        'oracleIdentity',
        {
          archiveDigest: this.#oracle.archiveDigest,
          frontendTree: this.#oracle.frontendTree,
          revision: this.#oracle.revision,
          sourceCommands: oracleSource.commandEvidence,
          tree: this.#oracle.tree,
        },
        'fixed oracle commit and frontend tree materialized from Git objects',
      ),
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/oracle-build.json',
        'oracleBuild',
        {
          buildDigest: this.#oracle.buildDigest,
          cacheDigest: this.#oracle.cacheDigest,
          commands: this.#oracle.commandEvidence,
          network: 'sandbox-denied',
        },
        'fixed oracle built from lock with exact offline Node and npm',
      ),
      await jsonEvidence(
        this.#options.runRoot,
        'browser/evidence/oracle-server.json',
        'oracleOrigin',
        this.#oracleServer.facts,
        'fixed oracle served on exact IPv4 loopback',
      ),
    ]);
  }

  async runSharedJourneys() {
    this.#assertOpen();
    if (!this.#oracleServer) fail('oracle must be materialized before journeys');
    if (this.#shares) fail('shared journeys already ran');
    const browserRecord = await this.#ensureBrowser();
    const contextRecord = await createFixedContext({
      allowedOrigin: this.#candidateServer.origin,
      browser: browserRecord.browser,
      cellId: 'browser.shared-journey',
      kind: 'candidate',
      motion: 'default',
      theme: 'light',
      width: 1024,
    });
    const monitor = createPageMonitor(contextRecord);
    try {
      const [shareConsumptionControls, legacyThemeStorageControls] =
        await Promise.all([
          verifyShareConsumptionNegativeControls(browserRecord.browser),
          verifyLegacyThemeStorageNegativeControls(browserRecord.browser),
        ]);
      const result = await runRealDataJourneys({
        candidateOrigin: this.#candidateServer.origin,
        context: contextRecord.context,
        monitor,
        timeoutMs: this.#options.browserCellTimeoutMs,
      });
      this.#shares = result.shares;
      this.#performance.journeyMs = result.performance.journeyMs;
      this.#performance.readyMs = Math.max(
        this.#performance.readyMs,
        result.performance.readyMs,
      );
      this.#performance.domNodes = Math.max(
        this.#performance.domNodes,
        result.performance.domNodes,
      );
      this.#performance.transferBytes += result.performance.transferBytes;
      this.#performance.requestCount += result.performance.requestCount;
      accumulateExternalNetworkAttempts(this.#performance, [contextRecord]);
      return Object.freeze([
        await jsonEvidence(
          this.#options.runRoot,
          'browser/evidence/shared-journey.json',
          'journeyTrace',
          {
            ...result.evidence,
            negativeControls: {
              legacyThemeStorage: legacyThemeStorageControls,
              shareConsumption: shareConsumptionControls,
            },
          },
          'global real-data ranking, detail, partners, pair, group, view, share journey',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          'browser/evidence/shared-network.json',
          'networkLog',
          result.network,
          'closed same-origin browser request log',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          'browser/evidence/shared-resources.json',
          'resourceLog',
          result.resources,
          'browser resource failures and status audit',
        ),
      ]);
    } finally {
      await contextRecord.context.close();
    }
  }

  async runMatrixCell(cellId) {
    const cellStarted = performance.now();
    this.#assertOpen();
    if (!this.#shares) fail('shared real-data journey must run before matrix cells');
    const match = CELL_ID.exec(cellId);
    if (!match) fail(`unknown closed browser cell ${cellId}`);
    const [, theme, widthText, motion] = match;
    const width = Number(widthText);
    const browserRecord = await this.#ensureBrowser();
    const candidateContext = await createFixedContext({
      allowedOrigin: this.#candidateServer.origin,
      browser: browserRecord.browser,
      cellId,
      kind: 'candidate',
      motion,
      theme,
      width,
    });
    const oracleContext = await createFixedContext({
      allowedOrigin: this.#oracleServer.origin,
      browser: browserRecord.browser,
      cellId,
      kind: 'oracle',
      motion,
      theme,
      width,
    });
    const candidateMonitor = createPageMonitor(candidateContext);
    const oracleMonitor = createPageMonitor(oracleContext);
    const candidatePage = await candidateContext.context.newPage();
    const oraclePage = await oracleContext.context.newPage();
    candidateMonitor.attach(candidatePage);
    oracleMonitor.attach(oraclePage);
    const comparisons = [];
    const failures = [];
    const interaction = [];
    const shareConsumptions = [];
    const observedScenarios = new Map();
    let candidateObservation = null;
    let oracleObservation = null;
    let candidatePerformance = null;
    try {
      const observe = (id, oracle = 1) => {
        if (!CLOSED_STATE_SCENARIOS.includes(id) || observedScenarios.has(id)) {
          fail(`browser scenario observation is not unique: ${id}`);
        }
        observedScenarios.set(
          id,
          Object.freeze({
            candidate: 1,
            id,
            intercepted: false,
            oracle,
            source: 'production-state-machine',
          }),
        );
      };
      const consumeCandidateShare = async ({
        id,
        path,
        ready,
        url,
      }) => {
        const navigation = await consumeShareNavigation({
          expectedPath: path,
          page: candidatePage,
          ready,
          shareUrl: url,
        });
        shareConsumptions.push(
          Object.freeze({
            ...navigation,
            id,
            sequence: shareConsumptions.length + 1,
          }),
        );
        return navigation;
      };
      const compare = async (
        scenarioId,
        route,
        states,
        prepare,
        loadingGuard,
      ) => {
        await prepare();
        try {
          comparisons.push(
            await captureOracleComparison({
              candidatePage,
              cellId,
              exceptionRegistry: this.#options.oracleExceptions,
              loadingGuard,
              motion,
              oraclePage,
              route,
              runRoot: this.#options.runRoot,
              scenarioId,
              states,
            }),
          );
          return true;
        } catch (error) {
          if (error instanceof OracleComparisonError && error.evidence) {
            comparisons.push(error.evidence);
          }
          failures.push(sanitizedFailure(error));
          return false;
        }
      };
      const rankingOracleUrl =
        `${this.#oracleServer.origin}/ranking?mode=ranking&theme=${theme}`;
      const coStarOracleUrl =
        `${this.#oracleServer.origin}/co-star?theme=${theme}`;
      const gotoRanking = async ({
        keepPersonOpen = false,
        observeLoading = false,
      } = {}) => {
        const loadingComparison = observeLoading
          ? compare(
              'ranking-loading',
              '/ranking',
              ['share-action'],
              () =>
                Promise.all([
                  waitForVisibleSelector(
                    candidatePage,
                    LOADING_COMPARISON_GUARDS['ranking-loading'].candidate,
                  ),
                  waitForVisibleSelector(
                    oraclePage,
                    LOADING_COMPARISON_GUARDS['ranking-loading'].oracle,
                  ),
                ]),
              LOADING_COMPARISON_GUARDS['ranking-loading'],
            )
          : null;
        const navigation = Promise.all([
          consumeCandidateShare({
            id: 'ranking-person',
            path: '/ranking',
            ready: () =>
              candidatePage
                .locator(
                  width < 780
                    ? '#person-detail-panel.person-detail-drawer'
                    : '.person-detail-surface',
                )
                .waitFor(),
            url: this.#shares.rankingPerson,
          }),
          (async () => {
            await oraclePage.goto('about:blank', {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.goto(rankingOracleUrl, {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.locator('.person-row--ranking').first().waitFor();
            if (width < 780) {
              const oraclePerson = await firstVisible(
                oraclePage.locator('.person-row--ranking'),
                'oracle ranking person',
              );
              await keyboardActivate(oraclePerson);
            }
            await oraclePage.locator('.person-inspector').waitFor();
          })(),
        ]);
        if (loadingComparison) {
          const [, compared] = await Promise.all([
            navigation,
            loadingComparison,
          ]);
          if (compared) observe('ranking-loading');
        } else {
          await navigation;
        }
        if (width < 780 && !keepPersonOpen) {
          await Promise.all([
            (async () => {
              await candidatePage.keyboard.press('Escape');
              await candidatePage
                .locator('#person-detail-panel.person-detail-drawer')
                .waitFor({ state: 'hidden' });
            })(),
            (async () => {
              await oraclePage.keyboard.press('Escape');
              await oraclePage
                .locator('.ranking-inspector-drawer')
                .waitFor({ state: 'hidden' });
            })(),
          ]);
        }
      };
      const gotoRankingResults = async () => {
        await Promise.all([
          consumeCandidateShare({
            id: 'ranking-results',
            path: '/ranking',
            ready: () => candidatePage.locator('.ranked-person-list').waitFor(),
            url: this.#shares.rankingResults,
          }),
          (async () => {
            await oraclePage.goto('about:blank', {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.goto(rankingOracleUrl, {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.locator('.person-row--ranking').first().waitFor();
          })(),
        ]);
      };
      const gotoCoStar = async ({ observeLoading = false } = {}) => {
        const loadingComparison = observeLoading
          ? compare(
              'co-star-loading',
              '/co-star',
              ['share-action'],
              () =>
                Promise.all([
                  waitForVisibleSelector(
                    candidatePage,
                    LOADING_COMPARISON_GUARDS['co-star-loading'].candidate,
                  ),
                  waitForVisibleSelector(
                    oraclePage,
                    LOADING_COMPARISON_GUARDS['co-star-loading'].oracle,
                  ),
                ]),
              LOADING_COMPARISON_GUARDS['co-star-loading'],
            )
          : null;
        const navigation = Promise.all([
          consumeCandidateShare({
            id: 'co-star-group',
            path: '/co-star',
            ready: () => candidatePage.locator('.co-star-surface').waitFor(),
            url: this.#shares.coStarGroup,
          }),
          (async () => {
            await oraclePage.goto('about:blank', {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.goto(coStarOracleUrl, {
              waitUntil: 'domcontentloaded',
            });
            await oraclePage.locator('.analysis-dashboard').waitFor();
          })(),
        ]);
        if (loadingComparison) {
          const [, compared] = await Promise.all([
            navigation,
            loadingComparison,
          ]);
          if (compared) observe('co-star-loading');
        } else {
          await navigation;
        }
      };

      await compare('root-empty', '/', ['share-action'], async () => {
        await Promise.all([
          candidatePage.goto(`${this.#candidateServer.origin}/`, {
            waitUntil: 'domcontentloaded',
          }),
          oraclePage.goto(
            `${this.#oracleServer.origin}/?theme=${theme}`,
            { waitUntil: 'domcontentloaded' },
          ),
        ]);
        await Promise.all([
          candidatePage
            .locator('[data-app-root][data-app-ready="true"]')
            .waitFor(),
          oraclePage.getByRole('heading', { name: '尚未开始查询' }).waitFor(),
        ]);
        observe('root-empty');
      });

      await gotoRanking({ observeLoading: true });

      await compare(
        'ranking-error',
        '/ranking',
        ['share-action'],
        async () => {
        await Promise.all([
          openQueryEditor(candidatePage),
          openQueryEditor(oraclePage),
        ]);
        await Promise.all([
          configureRatingCount(candidatePage, '100', '1'),
          configureRatingCount(oraclePage, '100', '1'),
        ]);
        await Promise.all([
          submitQuery(candidatePage),
          submitQuery(oraclePage),
        ]);
        await Promise.all([
          candidatePage.locator('.query-field-error').waitFor(),
          oraclePage.locator('.query-field-error').waitFor(),
        ]);
        observe('ranking-error');
        },
      );
      await gotoRanking();

      await compare(
        'ranking-empty',
        '/ranking',
        ['share-action'],
        async () => {
        const token = 'acceptance-no-ranking-match';
        const candidateResponse = candidatePage.waitForResponse(
          (response) =>
            new URL(response.url()).pathname === '/api/v1/rankings' &&
            response.request().method() === 'POST',
        );
        const candidateSearch = candidatePage.getByLabel('搜索排行人物');
        const oracleSearch = oraclePage.getByLabel('搜索排行人物');
        await Promise.all([
          (async () => {
            await candidateSearch.fill(token);
            await candidateSearch.press('Enter');
          })(),
          oracleSearch.fill(token),
        ]);
        await candidateResponse;
        await Promise.all([
          candidatePage.locator('.ranking-empty-state').waitFor(),
          oraclePage.locator('.person-list__empty').waitFor(),
        ]);
        observe('ranking-empty');
        },
      );
      await gotoRanking();

      await Promise.all([
        openQueryEditor(candidatePage),
        openQueryEditor(oraclePage),
      ]);
      await Promise.all([
        configureRatingCount(candidatePage, '1', ''),
        configureRatingCount(oraclePage, '1', ''),
      ]);
      const rankingRequest = candidatePage.waitForRequest(
        (request) =>
          new URL(request.url()).pathname === '/api/v1/rankings' &&
          request.method() === 'POST',
      );
      await Promise.all([
        submitQuery(candidatePage),
        submitQuery(oraclePage),
      ]);
      const candidateCancel = candidatePage.getByRole('button', {
        name: '取消查询',
      });
      const oracleCancel = oraclePage.getByRole('button', {
        name: '取消查询',
      });
      await Promise.all([
        keyboardActivate(candidateCancel),
        keyboardActivate(oracleCancel),
      ]);
      await rankingRequest;
      await Promise.all([
        candidatePage.locator('.app-query-feedback').waitFor(),
        oraclePage
          .locator('.query-editor__status')
          .filter({ hasText: /已取消/u })
          .waitFor(),
      ]);
      observe('ranking-query');
      observe('ranking-approved-addition', 0);
      await Promise.all([
        closeQueryEditor(candidatePage),
        closeQueryEditor(oraclePage),
      ]);
      await compare(
        'ranking-query-feedback',
        '/ranking',
        ['query', 'share-action'],
        async () => {},
      );
      await gotoRanking({ keepPersonOpen: true });

      await compare(
        'ranking-person',
        '/ranking',
        ['person-detail', 'share-action'],
        async () => {
          observe('ranking-person');
        },
      );
      if (width < 780) {
        await Promise.all([
          (async () => {
            await candidatePage.keyboard.press('Escape');
            await candidatePage
              .locator('#person-detail-panel.person-detail-drawer')
              .waitFor({ state: 'hidden' });
          })(),
          (async () => {
            await oraclePage.keyboard.press('Escape');
            await oraclePage
              .locator('.ranking-inspector-drawer')
              .waitFor({ state: 'hidden' });
          })(),
        ]);
      }
      await gotoRankingResults();
      await compare(
        'ranking-results',
        '/ranking',
        ['results', 'share-action'],
        async () => {
          observe('ranking-results');
        },
      );

      try {
        const auditEvidence = await auditCandidatePage({
          motion,
          page: candidatePage,
          route: '/ranking',
          width,
        });
        const [candidateTrace, oracleTrace] = await Promise.all([
          captureNormalizedActionTrace({
            attachPage: candidateMonitor.attach,
            kind: 'candidate',
            motion,
            page: candidatePage,
            route: '/ranking',
            width,
          }),
          captureNormalizedActionTrace({
            attachPage: oracleMonitor.attach,
            kind: 'oracle',
            motion,
            page: oraclePage,
            route: '/ranking',
            width,
          }),
        ]);
        assertNormalizedActionTracePair(candidateTrace, oracleTrace);
        interaction.push({
          actionTrace: candidateTrace,
          evidence: auditEvidence,
          route: '/ranking',
        });
      } catch (error) {
        failures.push(sanitizedFailure(error));
        interaction.push({
          evidence:
            error instanceof OracleComparisonError && error.evidence
              ? error.evidence
              : { failure: sanitizedFailure(error) },
          route: '/ranking',
        });
      }

      await gotoCoStar({ observeLoading: true });

      await compare(
        'co-star-error',
        '/co-star',
        ['share-action'],
        async () => {
        await Promise.all([
          openQueryEditor(candidatePage),
          openQueryEditor(oraclePage),
        ]);
        await Promise.all([
          configureRatingCount(candidatePage, '100', '1'),
          configureRatingCount(oraclePage, '100', '1'),
        ]);
        await Promise.all([
          submitQuery(candidatePage),
          submitQuery(oraclePage),
        ]);
        await Promise.all([
          candidatePage.locator('.query-field-error').waitFor(),
          oraclePage.locator('.query-field-error').waitFor(),
        ]);
        observe('co-star-error');
        },
      );
      await gotoCoStar();

      await compare(
        'co-star-query',
        '/co-star',
        ['share-action'],
        async () => {
        await Promise.all([
          openQueryEditor(candidatePage),
          openQueryEditor(oraclePage),
        ]);
        observe('co-star-query');
        },
      );
      await Promise.all([
        closeQueryEditor(candidatePage),
        closeQueryEditor(oraclePage),
      ]);
      await gotoCoStar();

      await compare(
        'co-star-empty',
        '/co-star',
        ['candidates', 'share-action'],
        async () => {
          await Promise.all([
            openCandidatePicker(candidatePage, 'candidate', width),
            openCandidatePicker(oraclePage, 'oracle', width),
          ]);
          const candidateSearch = candidatePage
            .locator('input[name="candidateSearch"]')
            .first();
          const oracleSearch = oraclePage
            .locator('input[name="candidateSearch"]')
            .first();
          const candidateResponse = candidatePage.waitForResponse(
            (response) =>
              new URL(response.url()).pathname === '/api/v1/candidates' &&
              response.request().method() === 'POST',
          );
          await Promise.all([
            candidateSearch.fill('acceptance-no-candidate-match'),
            oracleSearch.fill('acceptance-no-candidate-match'),
          ]);
          await candidateResponse;
          await Promise.all([
            candidatePage.locator('.candidate-empty').waitFor(),
            oraclePage.locator('.person-list__empty').waitFor(),
          ]);
          observe('co-star-empty');
        },
      );
      await Promise.all([
        closeCandidatePicker(candidatePage, 'candidate', width),
        closeCandidatePicker(oraclePage, 'oracle', width),
      ]);

      await compare(
        'co-star-candidates',
        '/co-star',
        ['candidates', 'share-action'],
        async () => {
          await Promise.all([
            consumeCandidateShare({
              id: 'co-star-candidates',
              path: '/co-star',
              ready: async () => {
                await openCandidatePicker(candidatePage, 'candidate', width);
                await candidatePage.locator('.candidate-list').waitFor();
              },
              url: this.#shares.coStarCandidates,
            }),
            (async () => {
              await oraclePage.goto('about:blank', {
                waitUntil: 'domcontentloaded',
              });
              await oraclePage.goto(coStarOracleUrl, {
                waitUntil: 'domcontentloaded',
              });
              await setOraclePersonCount(oraclePage, 0, width);
              await oraclePage.locator('.person-list--candidate').waitFor();
            })(),
          ]);
          observe('co-star-candidates');
        },
      );
      await Promise.all([
        closeCandidatePicker(candidatePage, 'candidate', width),
        closeCandidatePicker(oraclePage, 'oracle', width),
      ]);

      await compare(
        'co-star-partners',
        '/co-star',
        ['partners', 'share-action'],
        async () => {
          await Promise.all([
            consumeCandidateShare({
              id: 'co-star-partners',
              path: '/co-star',
              ready: () => candidatePage.locator('.partners-surface').waitFor(),
              url: this.#shares.partners,
            }),
            (async () => {
              await oraclePage.goto('about:blank', {
                waitUntil: 'domcontentloaded',
              });
              await oraclePage.goto(coStarOracleUrl, {
                waitUntil: 'domcontentloaded',
              });
              await setOraclePersonCount(oraclePage, 1, width);
              await closeCandidatePicker(oraclePage, 'oracle', width);
              await oraclePage.locator('.single-cooperation').waitFor();
            })(),
          ]);
          observe('co-star-partners');
        },
      );

      await compare(
        'co-star-pair',
        '/co-star',
        ['pair-or-group', 'share-action'],
        async () => {
          await Promise.all([
            consumeCandidateShare({
              id: 'co-star-pair',
              path: '/co-star',
              ready: () => candidatePage.locator('.co-star-surface').waitFor(),
              url: this.#shares.coStarPair,
            }),
            (async () => {
              await oraclePage.goto('about:blank', {
                waitUntil: 'domcontentloaded',
              });
              await oraclePage.goto(coStarOracleUrl, {
                waitUntil: 'domcontentloaded',
              });
              await setOraclePersonCount(oraclePage, 2, width);
              await closeCandidatePicker(oraclePage, 'oracle', width);
              await oraclePage.locator('.analysis-dashboard').waitFor();
            })(),
          ]);
          observe('co-star-pair');
        },
      );

      await compare(
        'co-star-group',
        '/co-star',
        ['pair-or-group', 'share-action'],
        async () => {
          await gotoCoStar();
          observe('co-star-group');
        },
      );

      try {
        const auditEvidence = await auditCandidatePage({
          motion,
          page: candidatePage,
          route: '/co-star',
          width,
        });
        const [candidateTrace, oracleTrace] = await Promise.all([
          captureNormalizedActionTrace({
            attachPage: candidateMonitor.attach,
            kind: 'candidate',
            motion,
            page: candidatePage,
            route: '/co-star',
            width,
          }),
          captureNormalizedActionTrace({
            attachPage: oracleMonitor.attach,
            kind: 'oracle',
            motion,
            page: oraclePage,
            route: '/co-star',
            width,
          }),
        ]);
        assertNormalizedActionTracePair(candidateTrace, oracleTrace);
        interaction.push({
          actionTrace: candidateTrace,
          evidence: auditEvidence,
          route: '/co-star',
        });
      } catch (error) {
        failures.push(sanitizedFailure(error));
        interaction.push({
          evidence:
            error instanceof OracleComparisonError && error.evidence
              ? error.evidence
              : { failure: sanitizedFailure(error) },
          route: '/co-star',
        });
      }
      const stateScenarios = CLOSED_STATE_SCENARIOS.map((id) =>
        observedScenarios.get(id),
      );
      assertClosedStateScenarioCoverage(stateScenarios);
      assertLoadingComparisonCoverage(comparisons);
      try {
        candidateObservation = await candidateMonitor.finish(candidatePage, {
          allowSafeImageFailures: false,
        });
        candidatePerformance = await pagePerformanceFacts(candidatePage);
      } catch (error) {
        failures.push(sanitizedFailure(error));
        candidateObservation = { failure: sanitizedFailure(error) };
      }
      try {
        oracleObservation = await oracleMonitor.finish(oraclePage, {
          allowSafeImageFailures: false,
        });
      } catch (error) {
        failures.push(sanitizedFailure(error));
        oracleObservation = { failure: sanitizedFailure(error) };
      }
      accumulateExternalNetworkAttempts(this.#performance, [
        candidateContext,
        oracleContext,
      ]);
      const evidence = Object.freeze([
        await jsonEvidence(
          this.#options.runRoot,
          `browser/cells/${cellId}/dom.json`,
          'dom',
          comparisonParts(comparisons, 'dom'),
          'normalized role, name, state DOM comparison',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          `browser/cells/${cellId}/geometry.json`,
          'geometry',
          comparisonParts(comparisons, 'geometry'),
          'landmark and shared-class geometry comparison',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          `browser/cells/${cellId}/style.json`,
          'style',
          comparisonParts(comparisons, 'style'),
          'typography, color, border, radius, shadow, and overflow comparison',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          `browser/cells/${cellId}/actions.json`,
          'actions',
          {
            candidate: candidateObservation,
            fixed: candidateContext.fixed,
            interaction,
            oracle: oracleObservation,
            shareConsumptions,
            stateScenarios,
          },
          'keyboard, focus, escape, drawer, tooltip, motion, and network audit',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          `browser/cells/${cellId}/screenshots.json`,
          'screenshots',
          comparisons.flatMap((comparison) => comparison.screenshots ?? []),
          'paired candidate, oracle, and pixel-difference screenshots',
        ),
      ]);
      if (candidatePerformance) {
        this.#performance.readyMs = Math.max(
          this.#performance.readyMs,
          candidatePerformance.readyMs,
        );
        this.#performance.domNodes = Math.max(
          this.#performance.domNodes,
          candidatePerformance.domNodes,
        );
        this.#performance.transferBytes +=
          candidateObservation?.transferBytes ??
          candidatePerformance.transferBytes;
      }
      this.#performance.requestCount +=
        candidateObservation?.requests?.length ?? 0;
      this.#performance.actionMs = Math.max(
        this.#performance.actionMs,
        Math.round(performance.now() - cellStarted),
      );
      if (failures.length > 0) {
        fail(
          `browser matrix cell ${cellId} failed: ${failures.join('; ')}`,
          evidence,
        );
      }
      return evidence;
    } finally {
      await Promise.allSettled([
        candidatePage.close(),
        oraclePage.close(),
      ]);
      await Promise.allSettled([
        candidateContext.context.close(),
        oracleContext.context.close(),
      ]);
    }
  }

  async runSafeImageCell() {
    this.#assertOpen();
    if (!this.#shares) fail('shared real-data journey must run before SafeImage');
    const browserRecord = await this.#ensureBrowser();
    const contextRecord = await createFixedContext({
      allowedOrigin: this.#candidateServer.origin,
      browser: browserRecord.browser,
      cellId: 'browser.safe-image',
      kind: 'candidate',
      motion: 'reduced',
      safeImageAbort: true,
      theme: 'light',
      width: 1024,
    });
    const monitor = createPageMonitor(contextRecord);
    const page = await contextRecord.context.newPage();
    monitor.attach(page);
    await page.addInitScript(() => {
      const samples = [];
      const slots = new WeakMap();
      const histories = new Map();
      const knownElements = new Map();
      let nextSlot = 1;
      let activeWindow = null;
      let animationFrame = 0;
      const slotFor = (element) => {
        const root = element?.matches?.('.safe-image')
          ? element
          : element?.closest?.('.safe-image');
        if (!root) return null;
        if (!slots.has(root)) {
          const slot = `slot-${nextSlot}`;
          slots.set(root, slot);
          knownElements.set(slot, root);
          histories.set(slot, {
            removed: false,
            sizes: new Set(),
            states: new Set(),
            urls: new Set(),
          });
          nextSlot += 1;
        }
        return slots.get(root);
      };
      const snapshot = () => {
        const current = new Set();
        const entries = [];
        for (const element of document.querySelectorAll('.safe-image')) {
          const slot = slotFor(element);
          current.add(slot);
          const history = histories.get(slot);
          const box = element.getBoundingClientRect();
          const size = `${Math.round(box.width * 10) / 10}x${
            Math.round(box.height * 10) / 10
          }`;
          const state = element.getAttribute('data-image-state');
          const url = element.querySelector('img')?.getAttribute('src') ?? null;
          history.sizes.add(size);
          history.states.add(state);
          if (url) history.urls.add(url);
          entries.push({ size, slot, state, url });
        }
        for (const [slot, element] of knownElements) {
          if (!current.has(slot) && !element.isConnected) {
            histories.get(slot).removed = true;
          }
        }
        return entries.sort((left, right) =>
          left.slot.localeCompare(right.slot),
        );
      };
      const record = () => {
        const current = snapshot();
        samples.push(current);
        if (activeWindow) activeWindow.samples.push(current);
        return samples.length - 1;
      };
      const attributeTransitions = (records) =>
        records.map((record, index) => {
          const next = records
            .slice(index + 1)
            .find(
              (candidate) =>
                candidate.target === record.target &&
                candidate.attributeName === record.attributeName,
            );
          return {
            attribute: record.attributeName,
            kind: 'attribute',
            newValue: next
              ? next.oldValue
              : record.target.getAttribute(record.attributeName),
            oldValue: record.oldValue,
            slot: slotFor(record.target),
          };
        });
      const affectedChildSlots = (record) => {
        const result = new Set();
        const direct = slotFor(record.target);
        if (direct) result.add(direct);
        for (const node of [...record.addedNodes, ...record.removedNodes]) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          const own = slotFor(node);
          if (own) result.add(own);
          for (const descendant of node.querySelectorAll?.('.safe-image') ?? []) {
            const slot = slotFor(descendant);
            if (slot) result.add(slot);
          }
        }
        return [...result];
      };
      const tickWindow = () => {
        if (!activeWindow) return;
        record();
        animationFrame = requestAnimationFrame(tickWindow);
      };
      addEventListener('DOMContentLoaded', () => {
        const observer = new MutationObserver((records) => {
          if (activeWindow) {
            const attributes = records.filter(
              (record) =>
                record.type === 'attributes' &&
                slotFor(record.target) !== null,
            );
            activeWindow.mutations.push(...attributeTransitions(attributes));
            for (const mutation of records.filter(
              (record) => record.type === 'childList',
            )) {
              for (const slot of affectedChildSlots(mutation)) {
                activeWindow.mutations.push({
                  added: mutation.addedNodes.length,
                  kind: 'child-list',
                  removed: mutation.removedNodes.length,
                  slot,
                });
              }
            }
          }
          record();
        });
        observer.observe(document.documentElement, {
          attributeFilter: [
            'class',
            'data-image-state',
            'src',
            'srcset',
            'style',
          ],
          attributeOldValue: true,
          attributes: true,
          childList: true,
          subtree: true,
        });
        record();
      });
      Object.defineProperty(window, '__safeImageSamples', {
        value: samples,
        writable: false,
      });
      Object.defineProperty(window, '__safeImageRecord', {
        value: record,
        writable: false,
      });
      Object.defineProperty(window, '__safeImageStartWindow', {
        value: () => {
          if (activeWindow) throw new Error('SafeImage window already active');
          const windowStartSampleIndex = record();
          activeWindow = {
            mutations: [],
            samples: [snapshot()],
            windowStartSampleIndex,
          };
          animationFrame = requestAnimationFrame(tickWindow);
          return windowStartSampleIndex;
        },
        writable: false,
      });
      Object.defineProperty(window, '__safeImageStopWindow', {
        value: () => {
          if (!activeWindow) throw new Error('SafeImage window is not active');
          cancelAnimationFrame(animationFrame);
          activeWindow.samples.push(snapshot());
          const result = activeWindow;
          activeWindow = null;
          return result;
        },
        writable: false,
      });
      Object.defineProperty(window, '__safeImageLedger', {
        value: () =>
          [...histories.entries()]
            .map(([slot, history]) => ({
              removed: history.removed,
              sizes: [...history.sizes],
              slot,
              state:
                samples
                  .at(-1)
                  ?.find((entry) => entry.slot === slot)?.state ?? null,
              states: [...history.states],
              urls: [...history.urls],
            }))
            .sort((left, right) => left.slot.localeCompare(right.slot)),
        writable: false,
      });
    });
    try {
      const shareConsumption = await consumeShareNavigation({
        expectedPath: '/ranking',
        page,
        ready: async () => {
          await page.locator('.ranked-person-list').waitFor();
          await page.waitForFunction(() => {
            const images = [...document.querySelectorAll('.safe-image')];
            return (
              images.length > 0 &&
              images.every(
                (element) =>
                  element.getAttribute('data-image-state') !== 'loading',
              )
            );
          });
        },
        shareUrl: this.#shares.rankingResults,
      });
      const firstAbortCount = contextRecord.policy.safeImageAborts.length;
      const windowStartSampleIndex = await page.evaluate(
        () => window.__safeImageStartWindow(),
      );
      const before = await page.evaluate(() => window.__safeImageLedger());
      const stableWindowMs = 1_500;
      await page.waitForTimeout(stableWindowMs);
      const { after, windowMutations, windowSamples } =
        await page.evaluate(() => {
          const windowEvidence = window.__safeImageStopWindow();
          return {
            after: window.__safeImageLedger(),
            windowMutations: windowEvidence.mutations,
            windowSamples: windowEvidence.samples,
          };
        });
      const sameTaskNegativeControl = await page.evaluate(async () => {
        const target = document.querySelector(
          '.safe-image[data-image-state="error"]',
        );
        if (!target) {
          throw new Error('SafeImage same-task negative control has no error slot');
        }
        const windowStartSampleIndex = window.__safeImageStartWindow();
        const before = window.__safeImageLedger();
        target.setAttribute('data-image-state', 'loading');
        target.setAttribute('data-image-state', 'error');
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        );
        const windowEvidence = window.__safeImageStopWindow();
        return {
          after: window.__safeImageLedger(),
          before,
          stableWindowMs: 1_500,
          windowMutations: windowEvidence.mutations,
          windowSamples: windowEvidence.samples,
          windowStartSampleIndex,
        };
      });
      const sameTaskStateTransitions =
        sameTaskNegativeControl.windowMutations.filter(
          (mutation) =>
            mutation.kind === 'attribute' &&
            mutation.attribute === 'data-image-state',
        );
      if (
        sameTaskStateTransitions.length !== 2 ||
        sameTaskStateTransitions[0].slot !==
          sameTaskStateTransitions[1].slot ||
        sameTaskStateTransitions[0].oldValue !== 'error' ||
        sameTaskStateTransitions[0].newValue !== 'loading' ||
        sameTaskStateTransitions[1].oldValue !== 'loading' ||
        sameTaskStateTransitions[1].newValue !== 'error'
      ) {
        fail(
          'SafeImage same-task negative control did not observe exact transitions',
        );
      }
      let sameTaskMutationRejected = false;
      try {
        assertSafeImageLedger({
          abortPaths: contextRecord.policy.safeImageAborts,
          ...sameTaskNegativeControl,
        });
      } catch (error) {
        if (!(error instanceof BrowserAcceptanceError)) throw error;
        sameTaskMutationRejected = true;
      }
      if (!sameTaskMutationRejected) {
        fail('SafeImage same-task error/loading/error negative control escaped');
      }
      const observation = await monitor.finish(page, {
        allowSafeImageFailures: true,
      });
      accumulateExternalNetworkAttempts(this.#performance, [contextRecord]);
      const retryEscape =
        contextRecord.policy.safeImageAborts.length !== firstAbortCount;
      let ledgerStable = true;
      try {
        assertSafeImageLedger({
          abortPaths: observation.network.safeImageAborts,
          after,
          before,
          stableWindowMs,
          windowMutations,
          windowSamples,
          windowStartSampleIndex,
        });
      } catch {
        ledgerStable = false;
      }
      const facts = {
        after,
        before,
        stableWindowMs,
        windowMutations,
        windowSamples,
        windowStartSampleIndex,
      };
      const stable =
        ledgerStable &&
        observation.layoutShifts.length === 0 &&
        !retryEscape;
      const evidence = Object.freeze([
        await jsonEvidence(
          this.#options.runRoot,
          'browser/cells/browser.safe-image/aborted-routes.json',
          'abortedImageRoutes',
          {
            count: observation.network.safeImageAborts.length,
            paths: observation.network.safeImageAborts,
          },
          'only exact same-origin Bangumi image proxy routes were aborted',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          'browser/cells/browser.safe-image/stable-error.json',
          'stableErrorState',
          {
            ...facts,
            ledgerStable,
            retryEscape,
            sameTaskNegativeControl: {
              rejected: sameTaskMutationRejected,
              stateTransitions: sameTaskStateTransitions,
            },
            shareConsumption,
            stable,
          },
          'SafeImage reached a stable terminal error state without retries',
        ),
        await jsonEvidence(
          this.#options.runRoot,
          'browser/cells/browser.safe-image/layout-shift.json',
          'layoutShift',
          {
            layoutShiftEntries: observation.layoutShifts,
            observedSizes: before.map((entry) => ({
              sizes: entry.sizes,
              slot: entry.slot,
            })),
          },
          'SafeImage fixed geometry and layout-shift observations',
        ),
      ]);
      if (!stable) fail('SafeImage failure state was not stable', evidence);
      return evidence;
    } finally {
      await page.close();
      await contextRecord.context.close();
    }
  }

  performanceSnapshot() {
    this.#assertOpen();
    if (!this.#shares || this.#performance.journeyMs < 1) {
      fail('browser performance snapshot requires completed real-data journeys');
    }
    return Object.freeze({
      ...this.#performance,
      externalNetworkAttemptFacts: Object.freeze({
        ...this.#performance.externalNetworkAttemptFacts,
      }),
    });
  }

  oracleIdentity() {
    this.#assertOpen();
    if (!this.#oracle) fail('oracle identity requires completed materialization');
    return Object.freeze({
      buildDigest: this.#oracle.buildDigest,
      revision: this.#oracle.revision,
      tree: this.#oracle.tree,
    });
  }

  async close() {
    if (this.#closed) return Object.freeze({ closed: true });
    this.#closed = true;
    const failures = [];
    if (this.#browserRecord) {
      try {
        await this.#browserRecord.browser.close();
        this.#browserRecord.verifyHostResidue();
      } catch (error) {
        failures.push(sanitizedFailure(error));
      }
    }
    for (const server of [this.#oracleServer, this.#candidateServer]) {
      if (!server) continue;
      try {
        await server.close();
      } catch (error) {
        failures.push(sanitizedFailure(error));
      }
    }
    if (failures.length > 0) {
      fail(`browser acceptance cleanup failed: ${failures.join('; ')}`);
    }
    return Object.freeze({ closed: true });
  }
}

export function createBrowserAcceptanceSession(options) {
  if (options === null || typeof options !== 'object') {
    fail('browser acceptance options must be an object');
  }
  const runRoot = requireCanonicalPath(options.runRoot, {
    label: 'browser run root',
    type: 'directory',
  });
  const repositoryRoot = requireCanonicalPath(options.repositoryRoot, {
    label: 'browser repository root',
    type: 'directory',
  });
  const playwrightPackageRoot = requireCanonicalPath(
    options.playwrightPackageRoot,
    {
      below: runRoot,
      label: 'run-owned Playwright package root',
      type: 'directory',
    },
  );
  if (typeof options.apiRequest !== 'function') {
    fail('candidate API transport must be one closed async callback');
  }
  if (
    !Number.isInteger(options.browserCellTimeoutMs) ||
    options.browserCellTimeoutMs < 1_000 ||
    options.browserCellTimeoutMs > 300_000
  ) {
    fail('browser cell timeout is outside the closed bound');
  }
  if (
    !Number.isInteger(options.oracleTimeoutMs) ||
    options.oracleTimeoutMs < 1_000 ||
    options.oracleTimeoutMs > 1_800_000
  ) {
    fail('oracle timeout is outside the closed bound');
  }
  const closed = Object.freeze({
    ...options,
    oracleExceptions: exactRegistry(options.oracleExceptions),
    playwrightPackageRoot,
    repositoryRoot,
    runRoot,
  });
  return new BrowserAcceptanceSession(closed);
}

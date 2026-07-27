const API_PATHS = Object.freeze({
  candidates: '/api/v1/candidates',
  coStar: '/api/v1/co-star',
  partners: '/api/v1/partners',
  personDetail: '/api/v1/person-detail',
  rankings: '/api/v1/rankings',
});
const SHARE_CONSUMPTION_STABLE_MS = 100;

export class BrowserJourneyError extends Error {
  constructor(message, evidence = null) {
    super(message);
    this.evidence = evidence;
  }
}

function fail(message, evidence) {
  throw new BrowserJourneyError(message, evidence);
}

async function firstVisible(locator, label) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const candidate = locator.nth(index);
    if (await candidate.isVisible()) return candidate;
  }
  fail(`no visible ${label}`);
}

async function waitForApiResponse(page, path, action, timeoutMs) {
  const responsePromise = page.waitForResponse(
    (response) => {
      const url = new URL(response.url());
      return (
        url.pathname === path &&
        response.request().method() === 'POST'
      );
    },
    { timeout: timeoutMs },
  );
  try {
    await action();
  } catch (error) {
    await responsePromise.catch(() => {});
    throw error;
  }
  const response = await responsePromise;
  if (response.status() < 200 || response.status() >= 300) {
    fail(`${path} returned HTTP ${response.status()}`);
  }
  return response;
}

function recordKeyboard(trace, id) {
  trace.push(Object.freeze({ id, input: 'keyboard' }));
}

export function assertKeyboardTrace(trace) {
  const required = [
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
  ];
  if (
    !Array.isArray(trace) ||
    trace.some(
      (entry) =>
        entry === null ||
        typeof entry !== 'object' ||
        entry.input !== 'keyboard' ||
        typeof entry.id !== 'string',
    )
  ) {
    fail('keyboard action trace is invalid');
  }
  const seen = new Set(trace.map((entry) => entry.id));
  for (const id of required) {
    if (!seen.has(id)) fail(`keyboard action trace omitted ${id}`);
  }
  return true;
}

export function assertLatestResponseEvidence(evidence) {
  if (
    evidence === null ||
    typeof evidence !== 'object' ||
    evidence.staleToken === evidence.latestToken ||
    typeof evidence.staleToken !== 'string' ||
    typeof evidence.latestToken !== 'string' ||
    evidence.staleRequestSeen !== true ||
    evidence.latestRequestSeen !== true ||
    evidence.latestResponseSeen !== true ||
    !['failed', 'response'].includes(evidence.staleOutcome) ||
    evidence.winner !== 'latest' ||
    evidence.visibleState !== 'empty'
  ) {
    fail('latest-response evidence does not prove one differentiated winner');
  }
  return true;
}

function requestContains(request, token) {
  if (
    new URL(request.url()).pathname !== API_PATHS.rankings ||
    request.method() !== 'POST'
  ) {
    return false;
  }
  try {
    const visit = (value, depth = 0) => {
      if (depth > 8) return false;
      if (typeof value === 'string') return value === token;
      if (Array.isArray(value)) {
        return value.some((entry) => visit(entry, depth + 1));
      }
      if (value && typeof value === 'object') {
        return Object.values(value).some((entry) => visit(entry, depth + 1));
      }
      return false;
    };
    return visit(request.postDataJSON());
  } catch {
    return false;
  }
}

async function keyboardFirstSelectOption(
  page,
  trigger,
  trace,
  actionId = 'query-position',
) {
  await trigger.focus();
  await trigger.press('Enter');
  const options = page.locator(
    '.n-base-select-option:not(.n-base-select-option--disabled):not(.n-base-select-option--group)',
  );
  await options.first().waitFor({ state: 'visible' });
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await options.first().waitFor({ state: 'hidden' });
  recordKeyboard(trace, actionId);
  return true;
}

async function captureShareUrl(page, expectedPath, trace) {
  const button = page.getByRole('button', { name: '复制当前查询链接' });
  if (!(await button.isEnabled())) fail('share action is unexpectedly disabled');
  await button.focus();
  await button.press('Enter');
  recordKeyboard(trace, 'share');
  let value = '';
  try {
    value = await page.evaluate(() => navigator.clipboard.readText());
  } catch {
    const fallback = page.getByLabel('当前查询链接');
    if (await fallback.isVisible()) value = await fallback.inputValue();
  }
  const url = new URL(value);
  if (
    url.origin !== new URL(page.url()).origin ||
    url.pathname !== expectedPath ||
    !/^#q=v1\.[A-Za-z0-9_-]+$/u.test(url.hash)
  ) {
    fail('share action did not produce one canonical same-origin share URL');
  }
  return url.toString();
}

async function exerciseTheme(page, trace) {
  const toggle = page.locator('.theme-action button');
  const initial = await page.locator('html').getAttribute('data-theme');
  await toggle.focus();
  await toggle.press('Enter');
  await page.waitForFunction(
    (prior) => document.documentElement.dataset.theme !== prior,
    initial,
  );
  await toggle.press('Enter');
  await page.waitForFunction(
    (prior) => document.documentElement.dataset.theme === prior,
    initial,
  );
  recordKeyboard(trace, 'theme');
}

async function exerciseRankingViews(
  page,
  timeoutMs,
  coverage,
  keyboardTrace,
) {
  const search = page.getByLabel('搜索排行人物');
  if (await search.isVisible()) {
    const staleToken = (
      await firstVisible(
        page.locator('.ranked-person-row__identity strong'),
        'ranking identity',
      )
    ).textContent();
    if (!staleToken || !staleToken.trim()) {
      fail('ranking identity cannot seed a differentiated stale request');
    }
    const exactStaleToken = staleToken.trim();
    await waitForApiResponse(
      page,
      API_PATHS.rankings,
      async () => {
        await search.fill('acceptance-no-match-first');
        await search.press('Enter');
      },
      timeoutMs,
    );
    recordKeyboard(keyboardTrace, 'ranking-search');
    coverage.loading = true;
    await page.locator('.ranking-empty-state').waitFor({ state: 'visible' });
    coverage.empty = true;
    const latestToken = 'acceptance-no-match-latest';
    const staleRequest = page.waitForRequest(
      (request) => requestContains(request, exactStaleToken),
      { timeout: timeoutMs },
    );
    const latestRequest = page.waitForRequest(
      (request) => requestContains(request, latestToken),
      { timeout: timeoutMs },
    );
    const staleOutcome = Promise.race([
      page
        .waitForResponse(
          (response) => requestContains(response.request(), exactStaleToken),
          { timeout: timeoutMs },
        )
        .then(() => 'response'),
      page
        .waitForEvent('requestfailed', {
          predicate: (request) => requestContains(request, exactStaleToken),
          timeout: timeoutMs,
        })
        .then(() => 'failed'),
    ]);
    const latest = page.waitForResponse(
      (response) => requestContains(response.request(), latestToken),
      { timeout: timeoutMs },
    );
    await search.fill(exactStaleToken);
    await search.press('Enter');
    await search.fill(latestToken);
    await search.press('Enter');
    await Promise.all([staleRequest, latestRequest, latest]);
    await page.waitForFunction(() => {
      const input = document.querySelector('input[name="ranking-search"]');
      return (
        input instanceof HTMLInputElement &&
        input.value === 'acceptance-no-match-latest' &&
        !document.querySelector('.ranking-view-pending') &&
        document.querySelector('.ranking-empty-state')
      );
    });
    const latestEvidence = Object.freeze({
      latestRequestSeen: true,
      latestResponseSeen: true,
      latestToken,
      staleOutcome: await staleOutcome,
      staleRequestSeen: true,
      staleToken: exactStaleToken,
      visibleState: 'empty',
      winner: 'latest',
    });
    assertLatestResponseEvidence(latestEvidence);
    coverage.latestResponse = latestEvidence;
    await waitForApiResponse(
      page,
      API_PATHS.rankings,
      async () => {
        await search.fill('');
        await search.press('Enter');
      },
      timeoutMs,
    );
  }
  const sort = page.locator('.ranking-sort-control').first();
  if (await sort.isVisible()) {
    await waitForApiResponse(
      page,
      API_PATHS.rankings,
      () =>
        keyboardFirstSelectOption(
          page,
          sort,
          keyboardTrace,
          'ranking-sort',
        ),
      timeoutMs,
    );
    coverage.sort = true;
  }
  const direction = page
    .getByRole('button', { name: /人物排行排序方向/u })
    .first();
  if (await direction.isVisible()) {
    await waitForApiResponse(
      page,
      API_PATHS.rankings,
      async () => {
        await direction.focus();
        await direction.press('Enter');
      },
      timeoutMs,
    );
    recordKeyboard(keyboardTrace, 'ranking-order');
    coverage.order = true;
  }
  const secondPage = page
    .locator('.ranking-pagination__pages button')
    .filter({ hasText: /^2$/u })
    .first();
  if (await secondPage.isVisible().catch(() => false)) {
    await waitForApiResponse(
      page,
      API_PATHS.rankings,
      async () => {
        await secondPage.focus();
        await secondPage.press('Enter');
      },
      timeoutMs,
    );
    recordKeyboard(keyboardTrace, 'ranking-page');
    coverage.page = true;
  } else {
    coverage.page = 'single-page';
    recordKeyboard(keyboardTrace, 'ranking-page');
  }
}

async function exercisePersonDetail(page, timeoutMs, coverage, keyboardTrace) {
  const row = await firstVisible(
    page.locator('.ranked-person-row'),
    'ranking person row',
  );
  await waitForApiResponse(
    page,
    API_PATHS.personDetail,
    async () => {
      await row.focus();
      await row.press('Enter');
    },
    timeoutMs,
  );
  recordKeyboard(keyboardTrace, 'person-open');
  await page
    .locator('.person-detail-surface')
    .filter({ hasNot: page.locator('.person-detail-placeholder') })
    .first()
    .waitFor({ state: 'visible' });
  coverage.personDetail = true;
  const compactView = await firstVisible(
    page.locator(
      '.person-item-browser__density [role="radio"]:not([aria-checked="true"])',
    ),
    'person detail compact view',
  );
  await compactView.focus();
  await compactView.press('Enter');
  await page.waitForFunction(
    () =>
      document
        .querySelector('.person-item-browser__density [role="radio"][aria-checked="true"]')
        ?.textContent?.trim() === '缩略',
  );
  await page
    .locator('.person-item-browser__body.is-compact')
    .waitFor({ state: 'visible' });
  recordKeyboard(keyboardTrace, 'person-view');
  coverage.view = true;
}

async function activateMode(page, name, pathname, trace) {
  const current = page.getByRole('tab', {
    name: pathname === '/co-star' ? '人物排行' : '共演分析',
  });
  await current.focus();
  await current.press(pathname === '/co-star' ? 'ArrowRight' : 'ArrowLeft');
  await page.waitForURL((url) => url.pathname === pathname);
  recordKeyboard(trace, 'mode');
}

async function selectCandidate(page, timeoutMs, path, trace) {
  const row = await firstVisible(
    page.locator('.candidate-row[aria-pressed="false"]'),
    'unselected candidate',
  );
  await waitForApiResponse(
    page,
    path,
    async () => {
      await row.focus();
      await row.press('Enter');
    },
    timeoutMs,
  );
  recordKeyboard(trace, 'candidate-select');
}

async function exerciseCoStarViews(page, timeoutMs, coverage) {
  const candidateSearch = page
    .locator('input[name="candidateSearch"]')
    .first();
  if (await candidateSearch.isVisible().catch(() => false)) {
    const response = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === API_PATHS.candidates &&
        candidate.request().method() === 'POST',
      { timeout: timeoutMs },
    );
    await candidateSearch.fill('acceptance-no-match');
    await page.waitForTimeout(280);
    await response;
    await page.locator('.candidate-empty').waitFor({ state: 'visible' });
    coverage.candidateEmpty = true;
    const restore = page.waitForResponse(
      (candidate) =>
        new URL(candidate.url()).pathname === API_PATHS.candidates &&
        candidate.request().method() === 'POST',
      { timeout: timeoutMs },
    );
    await candidateSearch.fill('');
    await page.waitForTimeout(280);
    await restore;
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

export function assertShareConsumptionNavigation(evidence) {
  const target = evidence?.target;
  const final = evidence?.final;
  const mainDocuments = evidence?.mainDocuments;
  if (
    evidence === null ||
    typeof evidence !== 'object' ||
    JSON.stringify(Object.keys(evidence).sort()) !==
      JSON.stringify(
        [
          'final',
          'mainDocuments',
          'stableAnimationFrames',
          'stableWindowMs',
          'target',
        ].sort(),
      ) ||
    evidence.stableAnimationFrames !== 2 ||
    evidence.stableWindowMs !== SHARE_CONSUMPTION_STABLE_MS ||
    target === null ||
    typeof target !== 'object' ||
    JSON.stringify(Object.keys(target).sort()) !==
      JSON.stringify(['hash', 'pathname', 'search']) ||
    final === null ||
    typeof final !== 'object' ||
    JSON.stringify(Object.keys(final).sort()) !==
      JSON.stringify(['hash', 'pathname', 'search']) ||
    !Array.isArray(mainDocuments)
  ) {
    fail('share-consumption navigation evidence is incomplete', evidence);
  }
  if (
    !/^#q=v1\.[A-Za-z0-9_-]+$/u.test(target.hash) ||
    final.hash !== '' ||
    final.pathname !== target.pathname ||
    final.search !== target.search
  ) {
    fail(
      'share-consumption did not clear its fragment on the exact route',
      evidence,
    );
  }
  if (mainDocuments.length !== 1) {
    fail(
      'share-consumption created an additional main-document identity',
      evidence,
    );
  }
  const document = mainDocuments[0];
  if (
    document === null ||
    typeof document !== 'object' ||
    JSON.stringify(Object.keys(document).sort()) !==
      JSON.stringify(
        ['identity', 'method', 'pathname', 'search', 'status'].sort(),
      ) ||
    document.identity !== 'main-document-1' ||
    document.method !== 'GET' ||
    document.pathname !== target.pathname ||
    document.search !== target.search ||
    !Number.isSafeInteger(document.status) ||
    document.status < 200 ||
    document.status >= 300
  ) {
    fail(
      'share-consumption main-document ledger is not one exact navigation',
      evidence,
    );
  }
  return true;
}

export function isExpectedShareNavigationContextDestroyed(error) {
  return (
    error instanceof Error &&
    /^page\.evaluate: Execution context was destroyed, most likely because of a navigation\.?(?:\n|$)/u.test(
      error.message,
    )
  );
}

async function waitForShareStableAnimationFrames(page, mainDocuments) {
  let navigationRetries = 0;
  while (navigationRetries <= 4) {
    const documentCountBefore = mainDocuments.length;
    try {
      await page.evaluate(
        () =>
          new Promise((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(resolve)),
          ),
      );
      return navigationRetries;
    } catch (error) {
      await new Promise((resolve) => setImmediate(resolve));
      if (
        !isExpectedShareNavigationContextDestroyed(error) ||
        mainDocuments.length <= documentCountBefore
      ) {
        throw error;
      }
      navigationRetries += 1;
      await page.waitForLoadState('domcontentloaded');
    }
  }
  fail('share-consumption kept replacing its main document');
}

export async function consumeShareNavigation({
  expectedPath,
  page,
  ready,
  shareUrl,
}) {
  if (
    typeof expectedPath !== 'string' ||
    !expectedPath.startsWith('/') ||
    typeof ready !== 'function' ||
    typeof shareUrl !== 'string'
  ) {
    fail('share-consumption navigation input is invalid');
  }
  let target;
  try {
    target = new URL(shareUrl);
  } catch {
    fail('share-consumption target is not a URL');
  }
  if (
    !['http:', 'https:'].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.pathname !== expectedPath ||
    !/^#q=v1\.[A-Za-z0-9_-]+$/u.test(target.hash)
  ) {
    fail('share-consumption target is outside the exact route contract');
  }
  await page.goto('about:blank', { waitUntil: 'domcontentloaded' });
  const mainFrame = page.mainFrame();
  const documentByRequest = new WeakMap();
  const mainDocuments = [];
  const onRequest = (request) => {
    if (
      request.resourceType() !== 'document' ||
      request.frame() !== mainFrame
    ) {
      return;
    }
    const requestUrl = new URL(request.url());
    const document = {
      identity: `main-document-${mainDocuments.length + 1}`,
      method: request.method(),
      pathname: requestUrl.pathname,
      search: requestUrl.search,
      status: null,
    };
    documentByRequest.set(request, document);
    mainDocuments.push(document);
  };
  const onResponse = (response) => {
    const document = documentByRequest.get(response.request());
    if (document) document.status = response.status();
  };
  page.on('request', onRequest);
  page.on('response', onResponse);
  try {
    await page.goto(target.toString(), { waitUntil: 'domcontentloaded' });
    await ready();
    await page.waitForLoadState('load');
    await page.waitForTimeout(SHARE_CONSUMPTION_STABLE_MS);
    await waitForShareStableAnimationFrames(page, mainDocuments);
    const finalUrl = new URL(page.url());
    const final = {
      hash: finalUrl.hash,
      pathname: finalUrl.pathname,
      search: finalUrl.search,
    };
    const evidence = Object.freeze({
      final: Object.freeze(final),
      mainDocuments: Object.freeze(
        mainDocuments.map((document) => Object.freeze({ ...document })),
      ),
      stableAnimationFrames: 2,
      stableWindowMs: SHARE_CONSUMPTION_STABLE_MS,
      target: Object.freeze({
        hash: target.hash,
        pathname: target.pathname,
        search: target.search,
      }),
    });
    assertShareConsumptionNavigation(evidence);
    return evidence;
  } finally {
    page.off('request', onRequest);
    page.off('response', onResponse);
  }
}

const shareConsumptionNegativeControlsByBrowser = new WeakMap();

export async function verifyShareConsumptionNegativeControls(browser) {
  if (browser === null || typeof browser !== 'object') {
    fail('share-consumption negative control requires one browser');
  }
  if (!shareConsumptionNegativeControlsByBrowser.has(browser)) {
    shareConsumptionNegativeControlsByBrowser.set(
      browser,
      (async () => {
        const context = await browser.newContext({
          serviceWorkers: 'block',
        });
        try {
          const runCase = async ({ id, reload }) => {
            const page = await context.newPage();
            const target =
              `http://127.0.0.1/__acceptance/share-${id}` +
              '#q=v1.dGVzdA';
            try {
              await page.route('**/*', (route) =>
                route.fulfill({
                  body: reload
                    ? `<!doctype html><html><body><main id="ready">ready</main><script>
                        history.replaceState(null, '', location.pathname + location.search);
                        if (!sessionStorage.getItem('acceptance-share-reloaded')) {
                          sessionStorage.setItem('acceptance-share-reloaded', '1');
                          setTimeout(() => location.reload(), 25);
                        }
                      </script></body></html>`
                    : '<!doctype html><html><body><main id="ready">ready</main></body></html>',
                  contentType: 'text/html',
                  status: 200,
                }),
              );
              try {
                await consumeShareNavigation({
                  expectedPath: `/__acceptance/share-${id}`,
                  page,
                  ready: () => page.locator('#ready').waitFor(),
                  shareUrl: target,
                });
              } catch (error) {
                if (!(error instanceof BrowserJourneyError)) throw error;
                return Object.freeze({
                  evidence: error.evidence,
                  message: error.message,
                });
              }
              fail(`share-consumption ${id} negative control escaped`);
            } finally {
              await page.close().catch(() => {});
            }
          };
          const retainedHash = await runCase({
            id: 'retained-hash',
            reload: false,
          });
          const extraReload = await runCase({
            id: 'extra-reload',
            reload: true,
          });
          if (
            retainedHash?.message !==
              'share-consumption did not clear its fragment on the exact route' ||
            retainedHash?.evidence?.final?.hash !== '#q=v1.dGVzdA' ||
            retainedHash?.evidence?.mainDocuments?.length !== 1 ||
            extraReload?.message !==
              'share-consumption created an additional main-document identity' ||
            extraReload?.evidence?.final?.hash !== '' ||
            extraReload?.evidence?.mainDocuments?.length !== 2
          ) {
            fail(
              'share-consumption negative controls were not differentiated exactly',
            );
          }
          return Object.freeze({
            extraReload: Object.freeze({
              documentCount: extraReload.evidence.mainDocuments.length,
              reason: extraReload.message,
              rejected: true,
            }),
            retainedHash: Object.freeze({
              hash: retainedHash.evidence.final.hash,
              reason: retainedHash.message,
              rejected: true,
            }),
            stableAnimationFrames: 2,
            stableWindowMs: SHARE_CONSUMPTION_STABLE_MS,
          });
        } finally {
          await context.close().catch(() => {});
        }
      })(),
    );
  }
  try {
    return await shareConsumptionNegativeControlsByBrowser.get(browser);
  } catch (error) {
    shareConsumptionNegativeControlsByBrowser.delete(browser);
    throw error;
  }
}

export async function runRealDataJourneys({
  candidateOrigin,
  context,
  monitor,
  timeoutMs,
}) {
  const journeyStarted = performance.now();
  const page = await context.newPage();
  monitor.attach(page);
  const coverage = {
    candidateEmpty: false,
    coStarGroup: false,
    coStarPair: false,
    empty: false,
    latestResponse: false,
    loading: false,
    order: false,
    page: false,
    partners: false,
    personDetail: false,
    sort: false,
    view: false,
  };
  const keyboardTrace = [];
  const shares = {};
  await page.goto(`${candidateOrigin}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForURL((url) => url.pathname === '/ranking');
  await page
    .locator('[data-app-root][data-app-ready="true"]')
    .waitFor({ state: 'visible' });
  await page.getByRole('heading', { name: '尚未开始查询' }).waitFor();
  coverage.empty = true;
  const globalQuery = page.getByLabel('从全站数据中查询');
  await globalQuery.focus();
  await globalQuery.press('Enter');
  await page
    .locator('.position-selector__loading')
    .waitFor({ state: 'detached' });
  await keyboardFirstSelectOption(
    page,
    page.locator('.query-position-select'),
    keyboardTrace,
  );
  await waitForApiResponse(
    page,
    API_PATHS.rankings,
    async () => {
      const submit = page.locator('#query-editor button[type="submit"]');
      await submit.focus();
      await submit.press('Enter');
      recordKeyboard(keyboardTrace, 'query-submit');
    },
    timeoutMs,
  );
  await page.locator('.ranked-person-list').waitFor({ state: 'visible' });
  shares.rankingResults = await captureShareUrl(
    page,
    '/ranking',
    keyboardTrace,
  );
  await exerciseRankingViews(page, timeoutMs, coverage, keyboardTrace);
  await exercisePersonDetail(page, timeoutMs, coverage, keyboardTrace);
  shares.rankingPerson = await captureShareUrl(
    page,
    '/ranking',
    keyboardTrace,
  );
  await exerciseTheme(page, keyboardTrace);

  const candidatesResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === API_PATHS.candidates &&
      response.request().method() === 'POST',
    { timeout: timeoutMs },
  );
  await activateMode(page, '共演分析', '/co-star', keyboardTrace);
  await candidatesResponse;
  await page.locator('.candidate-list').waitFor({ state: 'visible' });
  shares.coStarCandidates = await captureShareUrl(
    page,
    '/co-star',
    keyboardTrace,
  );
  await exerciseCoStarViews(page, timeoutMs, coverage);
  await selectCandidate(
    page,
    timeoutMs,
    API_PATHS.partners,
    keyboardTrace,
  );
  await page.locator('.partners-surface').waitFor({ state: 'visible' });
  coverage.partners = true;
  shares.partners = await captureShareUrl(
    page,
    '/co-star',
    keyboardTrace,
  );
  await selectCandidate(page, timeoutMs, API_PATHS.coStar, keyboardTrace);
  await page.locator('.co-star-surface').waitFor({ state: 'visible' });
  coverage.coStarPair = true;
  shares.coStarPair = await captureShareUrl(
    page,
    '/co-star',
    keyboardTrace,
  );
  await selectCandidate(page, timeoutMs, API_PATHS.coStar, keyboardTrace);
  await page.locator('.co-star-surface').waitFor({ state: 'visible' });
  coverage.coStarGroup = true;
  shares.coStarGroup = await captureShareUrl(
    page,
    '/co-star',
    keyboardTrace,
  );
  await activateMode(page, '人物排行', '/ranking', keyboardTrace);
  await page.goBack();
  await page.waitForURL((url) => url.pathname === '/co-star');
  await page.goForward();
  await page.waitForURL((url) => url.pathname === '/ranking');
  coverage.cleanNavigation = true;

  const final = await monitor.finish(page, { allowSafeImageFailures: false });
  const pagePerformance = await pagePerformanceFacts(page);
  const journeyMs = Math.round(performance.now() - journeyStarted);
  await page.close();
  for (const [name, value] of Object.entries(coverage)) {
    if (value === false) fail(`real-data journey did not cover ${name}`);
  }
  assertKeyboardTrace(keyboardTrace);
  return Object.freeze({
    evidence: Object.freeze({
      coverage: Object.freeze({ ...coverage }),
      domReady: true,
      globalApiOnly: final.globalApiOnly,
      keyboardTrace: Object.freeze([...keyboardTrace]),
      requestCount: final.requests.length,
    }),
    resources: final.resources,
    network: final.network,
    performance: Object.freeze({
      ...pagePerformance,
      journeyMs,
      requestCount: final.requests.length,
      transferBytes: final.transferBytes,
    }),
    shares: Object.freeze({ ...shares }),
  });
}

export async function runRankingResultsVertical({
  candidateOrigin,
  context,
  monitor,
  timeoutMs,
}) {
  const page = await context.newPage();
  monitor.attach(page);
  try {
    await page.goto(`${candidateOrigin}/`, { waitUntil: 'domcontentloaded' });
    await page.waitForURL((url) => url.pathname === '/ranking');
    await page
      .locator('[data-app-root][data-app-ready="true"]')
      .waitFor({ state: 'visible' });
    await page.getByRole('heading', { name: '尚未开始查询' }).waitFor();
    await page.getByLabel('从全站数据中查询').click();
    await page
      .locator('.position-selector__loading')
      .waitFor({ state: 'detached' });
    const trace = [];
    await keyboardFirstSelectOption(
      page,
      page.locator('.query-position-select'),
      trace,
    );
    const rankings = await waitForApiResponse(
      page,
      API_PATHS.rankings,
      () => page.locator('#query-editor button[type="submit"]').click(),
      timeoutMs,
    );
    await page.locator('.ranked-person-list').waitFor({ state: 'visible' });
    await page.waitForTimeout(250);
    const observation = await monitor.finish(page, {
      allowSafeImageFailures: false,
    });
    return Object.freeze({
      rankingStatus: rankings.status(),
      requestCount: observation.requests.length,
      resources: observation.resources,
      url: page.url(),
    });
  } finally {
    await page.close();
  }
}

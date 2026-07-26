import {
  isStrictlyBelow,
  requireCanonicalPath,
} from '../lib/paths.mjs';
import { prepareCandidateFrontend } from './artifact.mjs';
import { runRankingResultsVertical } from './journey.mjs';
import {
  createFixedContext,
  createPageMonitor,
  launchAcceptedChromium,
} from './runtime.mjs';
import { startAcceptanceServer } from './server.mjs';

export class BrowserProbeError extends Error {}

function fail(message) {
  throw new BrowserProbeError(message);
}

function closedOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    fail('ranking probe options must be an object');
  }
  const expected = new Set([
    'browserTimeoutMs',
    'chromiumExecutable',
    'chromiumVersion',
    'frontendTarPath',
    'playwrightPackageRoot',
    'runRoot',
    'runtime',
  ]);
  const unknown = Object.keys(options).filter((key) => !expected.has(key));
  if (unknown.length > 0) {
    fail(`ranking probe options contain unknown fields: ${unknown.sort().join(', ')}`);
  }
  if (
    options.runtime === null ||
    typeof options.runtime !== 'object' ||
    typeof options.runtime.requestRaw !== 'function'
  ) {
    fail('ranking probe requires one started AcceptedRuntime');
  }
  if (
    !Number.isInteger(options.browserTimeoutMs) ||
    options.browserTimeoutMs < 1_000 ||
    options.browserTimeoutMs > 300_000
  ) {
    fail('ranking probe timeout is outside the closed bound');
  }
  const runRoot = requireCanonicalPath(options.runRoot, {
    label: 'ranking probe run root',
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
  if (!isStrictlyBelow(playwrightPackageRoot, runRoot)) {
    fail('Playwright package must be owned by the ranking probe run root');
  }
  return Object.freeze({
    ...options,
    playwrightPackageRoot,
    runRoot,
  });
}

function runtimeAdapter(runtime) {
  return async ({ body, headers, method, path, signal }) => {
    const response = await runtime.requestRaw(path, {
      bodyBytes: method === 'POST' ? body : undefined,
      contentType: headers['content-type'],
      method,
      signal,
    });
    return Object.freeze({
      body: response.bytes,
      headers: response.headers,
      status: response.status,
    });
  };
}

export async function runBrowserRankingProbe(rawOptions) {
  const options = closedOptions(rawOptions);
  const candidate = await prepareCandidateFrontend({
    frontendTarPath: options.frontendTarPath,
    outputRelative: 'browser/probe/candidate-static',
    runRoot: options.runRoot,
  });
  const server = await startAcceptanceServer({
    apiRequest: runtimeAdapter(options.runtime),
    kind: 'candidate',
    root: candidate.root,
    runRoot: options.runRoot,
  });
  let browserRecord;
  let contextRecord;
  let primaryFailure;
  try {
    browserRecord = await launchAcceptedChromium({
      executablePath: options.chromiumExecutable,
      expectedVersion: options.chromiumVersion,
      playwrightPackageRoot: options.playwrightPackageRoot,
      runRoot: options.runRoot,
    });
    contextRecord = await createFixedContext({
      allowedOrigin: server.origin,
      browser: browserRecord.browser,
      cellId: 'browser.ranking-probe',
      kind: 'candidate',
      motion: 'default',
      theme: 'light',
      width: 1024,
    });
    const monitor = createPageMonitor(contextRecord);
    const result = await runRankingResultsVertical({
      candidateOrigin: server.origin,
      context: contextRecord.context,
      monitor,
      timeoutMs: options.browserTimeoutMs,
    });
    return Object.freeze({
      artifactDigest: candidate.artifactDigest,
      browser: browserRecord.identity,
      result,
      server: server.facts,
    });
  } catch (error) {
    primaryFailure = error;
    throw error;
  } finally {
    const cleanupFailures = [];
    for (const close of [
      contextRecord ? () => contextRecord.context.close() : null,
      browserRecord ? () => browserRecord.browser.close() : null,
      () => server.close(),
    ]) {
      if (!close) continue;
      try {
        await close();
      } catch (error) {
        cleanupFailures.push(error);
      }
    }
    if (!primaryFailure && cleanupFailures.length > 0) {
      fail(
        `ranking probe cleanup failed: ${cleanupFailures
          .map((error) => error?.message ?? String(error))
          .join('; ')}`,
      );
    }
  }
}

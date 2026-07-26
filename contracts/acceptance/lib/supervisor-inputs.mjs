import { attestFullArchive } from './archive.mjs';
import { attestArtifacts } from './artifacts.mjs';
import { attestCacheCompatibilityPhase } from './cache-compatibility.mjs';
import { attestInputCaches } from './cache-input.mjs';
import { canonicalJsonDigest } from './canonical-json.mjs';
import { attestSourceIdentities } from './git-attestation.mjs';
import { attestOfficialProvenance } from './provenance.mjs';
import { sha256File } from './seal.mjs';
import { attestInputRuntimeClosures } from './tools.mjs';

export class SupervisorInputSealError extends Error {}

function fail(message) {
  throw new SupervisorInputSealError(message);
}

function componentIdentities(artifacts) {
  return Object.fromEntries(
    ['backend', 'frontend', 'updater'].map((name) => [
      name,
      {
        artifactSetDigest:
          artifacts.components[name].artifactSetDigest,
        statementDigest:
          artifacts.components[name].statementDigest,
      },
    ]),
  );
}

export function sealSupervisorRuntimeClosures(runtimeClosures) {
  const document = Object.freeze({
    runtimeClosures,
    schemaVersion: 1,
  });
  return Object.freeze({
    digest: canonicalJsonDigest(document),
    document,
  });
}

export async function attestSupervisorRuntimeClosures(input) {
  const { runtimeClosures } =
    await attestInputRuntimeClosures(input);
  return sealSupervisorRuntimeClosures(runtimeClosures);
}

export async function attestSupervisorProtectedInputs(input) {
  const cache = await attestInputCaches(input);
  const sources = attestSourceIdentities(input);
  const cacheCompatibility = await attestCacheCompatibilityPhase({
    input,
    cacheAttestation: cache,
    phase: 'preAdmission',
  });
  const artifacts = await attestArtifacts(
    input.artifacts,
    sources.product,
  );
  const archive = await attestFullArchive({
    versionRoot: input.archive.versionRoot,
    expectedDataVersion: input.archive.dataVersion,
  });
  const provenance = await attestOfficialProvenance({
    root: input.archive.provenanceRoot,
    manifestPath: input.archive.provenanceManifest,
    expectedDigest: input.archive.provenanceDigest,
    archiveAttestation: archive,
  });
  const runtime = await attestSupervisorRuntimeClosures(input);
  const executables = {};
  for (const [name, declaration] of Object.entries(input.tools).sort(
    ([left], [right]) => left.localeCompare(right, 'en'),
  )) {
    const actual = await sha256File(declaration.path);
    if (actual !== declaration.sha256) {
      fail(`supervisor tool ${name} differs from its declared digest`);
    }
    executables[name] = {
      sha256: actual,
      version: declaration.version,
    };
  }
  const browserDigest = await sha256File(input.browser.executablePath);
  if (browserDigest !== input.browser.executableDigest) {
    fail('supervisor browser executable differs from its declared digest');
  }
  const document = Object.freeze({
    acceptanceInputDigest: canonicalJsonDigest(input),
    schemaVersion: 1,
    product: Object.freeze({
      revision: sources.product.revision,
      tree: sources.product.tree,
    }),
    harness: Object.freeze({
      revision: sources.harness.revision,
      tree: sources.harness.tree,
    }),
    protectedDiffDigest: canonicalJsonDigest(sources.changed),
    cache: Object.freeze({
      digest: cache.digest,
      rootSeal: cache.rootSeal,
      authoritySetSha256: cacheCompatibility.authoritySetSha256,
    }),
    artifacts: Object.freeze({
      compatibility: artifacts.compatibility.digest,
      components: Object.freeze(componentIdentities(artifacts)),
    }),
    archive: Object.freeze({
      ...archive.identity,
      ...provenance.identity,
      sourceSeal: archive.sourceSeal.digest,
      provenanceSeal: provenance.sourceSeal.digest,
    }),
    tools: Object.freeze({
      executables: Object.freeze(executables),
      runtimeClosures: runtime.document.runtimeClosures,
    }),
    browser: Object.freeze({
      executableDigest: browserDigest,
      name: input.browser.name,
      version: input.browser.version,
    }),
  });
  return Object.freeze({
    artifacts,
    digest: canonicalJsonDigest(document),
    document,
  });
}

export async function resealSupervisorProtectedInputs(input, before) {
  if (
    !before ||
    typeof before.digest !== 'string' ||
    !before.document
  ) {
    fail('supervisor pre-run input seal is absent');
  }
  const after = await attestSupervisorProtectedInputs(input);
  if (after.digest !== before.digest) {
    fail('supervisor protected input aggregate changed during the worker run');
  }
  return after;
}

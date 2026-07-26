import fs from 'node:fs';
import path from 'node:path';

import { requireCanonicalPath } from '../lib/paths.mjs';
import { sealDirectory } from '../lib/seal.mjs';
import { extractTarFile } from './tar.mjs';

const FORBIDDEN_SOURCE_EXTENSIONS = new Set([
  '.map',
  '.ts',
  '.tsx',
  '.vue',
]);
const PUBLIC_ORIGIN =
  /https?:\/\/(?:api\.bgm\.tv|lain\.bgm\.tv|search\.bgmss\.fun)\b/iu;
const NON_PRODUCTION_MARKER =
  /(?:^|[/"'])(?:fixtures?|prototypes?|__tests__)(?:[/"']|$)|workbench-data|@playwright\/test|\bvitest\b/iu;
const LEGACY_THEME_STORAGE_KEY = 'bgmss-workbench-theme';

export class FrontendArtifactError extends Error {}

function fail(message) {
  throw new FrontendArtifactError(message);
}

export async function prepareCandidateFrontend({
  frontendTarPath,
  outputRelative = 'browser/candidate-static',
  runRoot,
}) {
  const extracted = await extractTarFile({
    archivePath: frontendTarPath,
    outputRelative,
    preserveExecutable: false,
    runRoot,
  });
  const root = requireCanonicalPath(extracted.outputRoot, {
    label: 'candidate frontend root',
    type: 'directory',
  });
  const files = extracted.entries.filter((entry) => entry.kind === 'file');
  const paths = new Set(files.map((entry) => entry.path));
  if (!paths.has('index.html')) fail('candidate artifact has no index.html');
  if (![...paths].some((relative) => relative.startsWith('assets/'))) {
    fail('candidate artifact has no packaged assets');
  }
  const policy = {
    directPublicOrigins: [],
    forbiddenSourceFiles: [],
    legacyThemeStorageMarkers: [],
    nonProductionMarkers: [],
    regularFileCount: files.length,
  };
  for (const entry of files) {
    const extension = path.extname(entry.path).toLowerCase();
    if (FORBIDDEN_SOURCE_EXTENSIONS.has(extension)) {
      policy.forbiddenSourceFiles.push(entry.path);
    }
    if (!['.css', '.html', '.js'].includes(extension)) continue;
    const absolute = path.join(root, ...entry.path.split('/'));
    const source = fs.readFileSync(absolute, 'utf8');
    if (PUBLIC_ORIGIN.test(source)) policy.directPublicOrigins.push(entry.path);
    if (source.includes(LEGACY_THEME_STORAGE_KEY)) {
      policy.legacyThemeStorageMarkers.push(entry.path);
    }
    if (NON_PRODUCTION_MARKER.test(source)) {
      policy.nonProductionMarkers.push(entry.path);
    }
  }
  for (const values of [
    policy.directPublicOrigins,
    policy.forbiddenSourceFiles,
    policy.legacyThemeStorageMarkers,
    policy.nonProductionMarkers,
  ]) {
    values.sort();
  }
  if (
    policy.directPublicOrigins.length > 0 ||
    policy.forbiddenSourceFiles.length > 0 ||
    policy.legacyThemeStorageMarkers.length > 0 ||
    policy.nonProductionMarkers.length > 0
  ) {
    fail(`candidate bundle policy failed: ${JSON.stringify(policy)}`);
  }
  const seal = await sealDirectory(root);
  return Object.freeze({
    artifactDigest: extracted.sourceDigest,
    artifactEntries: Object.freeze(
      files.map((entry) =>
        Object.freeze({ path: entry.path, size: entry.size }),
      ),
    ),
    bundlePolicy: Object.freeze({
      directPublicOriginCount: 0,
      forbiddenSourceFileCount: 0,
      legacyThemeStorageMarkerCount: 0,
      nonProductionMarkerCount: 0,
      regularFileCount: policy.regularFileCount,
    }),
    root,
    rootDigest: seal.digest,
  });
}

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(frontendRoot, 'src');
const expectedInventory = [
  '.gitignore',
  'ARCHITECTURE.md',
  'README.md',
  'build/.gitignore',
  'build/README.md',
  'build/artifact.mjs',
  'build/check.mjs',
  'build/smoke.mjs',
  'build/test.mjs',
  'index.html',
  'openapi-ts.config.mjs',
  'package-lock.json',
  'package.json',
  'scripts/check-architecture.mjs',
  'scripts/check-candidates-wire-generated.mjs',
  'scripts/check-catalog-wire-generated.mjs',
  'scripts/check-co-star-wire-generated.mjs',
  'scripts/check-person-detail-wire-generated.mjs',
  'scripts/check-partners-wire-generated.mjs',
  'scripts/check-production-artifact.mjs',
  'scripts/check-query-wire-generated.mjs',
  'scripts/check-rankings-wire-generated.mjs',
  'scripts/check-query-unicode-generated.mjs',
  'scripts/cleanup-generated.mjs',
  'scripts/generate-candidates-wire.mjs',
  'scripts/generate-catalog-wire.mjs',
  'scripts/generate-co-star-wire.mjs',
  'scripts/generate-person-detail-wire.mjs',
  'scripts/generate-partners-wire.mjs',
  'scripts/generate-query-wire.mjs',
  'scripts/generate-rankings-wire.mjs',
  'scripts/generate-query-unicode.mjs',
  'src/api/adapters/candidates.ts',
  'src/api/adapters/catalog.ts',
  'src/api/adapters/coStar.ts',
  'src/api/adapters/partners.ts',
  'src/api/adapters/personDetail.ts',
  'src/api/adapters/queryWire.ts',
  'src/api/adapters/rankings.ts',
  'src/api/candidates.ts',
  'src/api/catalog.ts',
  'src/api/client.ts',
  'src/api/coStar.ts',
  'src/api/errors.ts',
  'src/api/generated/catalog/schemas.gen.ts',
  'src/api/generated/catalog/types.gen.ts',
  'src/api/generated/candidates/schemas.gen.ts',
  'src/api/generated/candidates/types.gen.ts',
  'src/api/generated/co-star/schemas.gen.ts',
  'src/api/generated/co-star/types.gen.ts',
  'src/api/generated/person-detail/schemas.gen.ts',
  'src/api/generated/person-detail/types.gen.ts',
  'src/api/generated/partners/schemas.gen.ts',
  'src/api/generated/partners/types.gen.ts',
  'src/api/generated/query-wire/types.gen.ts',
  'src/api/generated/rankings/schemas.gen.ts',
  'src/api/generated/rankings/types.gen.ts',
  'src/api/personDetail.ts',
  'src/api/partners.ts',
  'src/api/rankings.ts',
  'src/app/App.vue',
  'src/app/AppProviders.vue',
  'src/app/main.ts',
  'src/app/routes.ts',
  'src/app/store/runtime.ts',
  'src/app/theme.ts',
  'src/app/themeOverrides.ts',
  'src/assets/brand/bgmss.png',
  'src/features/catalog/store.ts',
  'src/features/co-star/co-star-analysis.css',
  'src/features/co-star/co-star.css',
  'src/features/co-star/co-star-oracle.css',
  'src/features/co-star/coStar.ts',
  'src/features/co-star/components/CandidatePicker.vue',
  'src/features/co-star/components/CoStarEmptyState.vue',
  'src/features/co-star/components/CoStarIcon.vue',
  'src/features/co-star/components/CoStarParticipants.vue',
  'src/features/co-star/components/CoStarRatings.vue',
  'src/features/co-star/components/CoStarSurface.vue',
  'src/features/co-star/components/CoStarWorkBrowser.vue',
  'src/features/co-star/components/CoStarWorkspace.vue',
  'src/features/co-star/components/MobileCandidateEntry.vue',
  'src/features/co-star/components/PartnersSurface.vue',
  'src/features/co-star/model.ts',
  'src/features/co-star/partners.css',
  'src/features/co-star/partners.ts',
  'src/features/co-star/selection.ts',
  'src/features/person-detail/adaptiveAppearanceLayout.ts',
  'src/features/person-detail/components/AdaptiveAppearanceList.vue',
  'src/features/person-detail/components/PersonDetailSurface.vue',
  'src/features/person-detail/components/PersonInspector.vue',
  'src/features/person-detail/components/PersonItemBrowser.vue',
  'src/features/person-detail/components/PersonProfile.vue',
  'src/features/person-detail/components/RatingEvidence.vue',
  'src/features/person-detail/components/StatEvidencePopover.vue',
  'src/features/person-detail/model.ts',
  'src/features/person-detail/person-detail.css',
  'src/features/person-detail/ratingTimelineGeometry.ts',
  'src/features/query/components/AppHeader.vue',
  'src/features/query/components/PositionSelector.vue',
  'src/features/query/components/QueryDateRange.vue',
  'src/features/query/components/QueryEditor.vue',
  'src/features/query/components/QueryIcon.vue',
  'src/features/query/components/QueryNumericRange.vue',
  'src/features/query/components/QueryWorkspace.vue',
  'src/features/query/components/controlTheme.ts',
  'src/features/query/composables/useCompactLayout.ts',
  'src/features/query/coordinator.ts',
  'src/features/query/model.ts',
  'src/features/query/share.ts',
  'src/features/query/store.ts',
  'src/features/query/unicode15_1.generated.ts',
  'src/features/ranking/components/AdaptivePagination.vue',
  'src/features/ranking/components/RankedPersonList.vue',
  'src/features/ranking/components/RankingResults.vue',
  'src/features/ranking/components/RankingSummary.vue',
  'src/features/ranking/components/RankingToolbar.vue',
  'src/features/ranking/components/SortDirectionButton.vue',
  'src/features/ranking/format.ts',
  'src/features/ranking/model.ts',
  'src/shared/components/AppIcon.vue',
  'src/shared/components/DeferredSurfaceState.vue',
  'src/shared/components/SafeImage.vue',
  'src/shared/charts/categoricalPalette.ts',
  'src/shared/charts/timelineGeometry.ts',
  'src/shared/media/bangumiImage.ts',
  'src/shared/navigation/basePath.ts',
  'src/shared/styles/base.css',
  'src/vite-env.d.ts',
  'tests/api/catalog.contract.test.ts',
  'tests/api/candidates.test.ts',
  'tests/api/client.test.ts',
  'tests/api/co-star.test.ts',
  'tests/api/partners.test.ts',
  'tests/api/person-detail.test.ts',
  'tests/api/query-wire.contract.test.ts',
  'tests/api/rankings.test.ts',
  'tests/app/app.mount.test.ts',
  'tests/app/co-star.integration.test.ts',
  'tests/app/rankings.integration.test.ts',
  'tests/app/theme-overrides.test.ts',
  'tests/app/theme.test.ts',
  'tests/features/person-detail/components.test.ts',
  'tests/features/person-detail/coordinator.test.ts',
  'tests/features/person-detail/model.test.ts',
  'tests/features/co-star/co-star-components.test.ts',
  'tests/features/co-star/co-star-model.test.ts',
  'tests/features/co-star/components.test.ts',
  'tests/features/co-star/model.test.ts',
  'tests/features/co-star/partners-components.test.ts',
  'tests/features/co-star/partners-model.test.ts',
  'tests/features/query/coordinator-partners.test.ts',
  'tests/features/query/coordinator.test.ts',
  'tests/features/query/components.test.ts',
  'tests/features/query/fixtures.ts',
  'tests/features/query/model.test.ts',
  'tests/features/query/share-routes.test.ts',
  'tests/features/ranking/components.test.ts',
  'tests/features/ranking/model.test.ts',
  'tests/setup.ts',
  'tests/shared/SafeImage.test.ts',
  'tests/shared/base-path.test.ts',
  'tests/shared/scrollbar-system.test.ts',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
].sort();
const disposableRoots = new Set([
  '.cache',
  '.tmp',
  'coverage',
  'dist',
  'node_modules',
]);
const expectedDependencies = {
  ajv: '8.20.0',
  'ajv-formats': '3.0.1',
  'naive-ui': '2.44.1',
  pinia: '4.0.2',
  vue: '3.5.40',
};
const expectedDevDependencies = {
  '@hey-api/openapi-ts': '0.99.0',
  '@types/node': '24.13.3',
  '@vitejs/plugin-vue': '6.0.8',
  '@vue/test-utils': '2.4.11',
  jsdom: '29.1.1',
  typescript: '6.0.2',
  vite: '8.1.5',
  vitest: '4.1.10',
  'vue-tsc': '3.3.8',
};
const expectedBrandHash =
  'd3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a';

function fail(message) {
  throw new Error(message);
}

function walkPersistent(root, relative = '') {
  const current = path.join(root, relative);
  const result = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const child = path.posix.join(relative, entry.name);
    if (relative === '' && disposableRoots.has(entry.name)) {
      continue;
    }
    if (relative === 'build' && entry.name === '.tmp') {
      continue;
    }
    if (entry.isDirectory()) {
      result.push(...walkPersistent(root, child));
    } else if (entry.isFile()) {
      result.push(child);
    } else {
      fail(`unsupported filesystem entry: ${child}`);
    }
  }
  return result;
}

function walkSource(root) {
  const result = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      result.push(...walkSource(child));
    } else if (/\.(?:ts|vue)$/.test(entry.name)) {
      result.push(child);
    }
  }
  return result;
}

function count(source, expression) {
  return [...source.matchAll(expression)].length;
}

function assertExactFiles(label, actual, expected) {
  const actualSorted = [...actual].sort();
  const expectedSorted = [...expected].sort();
  if (JSON.stringify(actualSorted) !== JSON.stringify(expectedSorted)) {
    fail(`${label} violation: ${JSON.stringify(actualSorted)}`);
  }
}

if (process.version !== 'v24.18.0') {
  fail(`architecture check requires Node v24.18.0, received ${process.version}`);
}
if (fs.existsSync(path.join(frontendRoot, 'openspec'))) {
  fail('nested frontend OpenSpec is forbidden');
}

const inventory = walkPersistent(frontendRoot).sort();
if (JSON.stringify(inventory) !== JSON.stringify(expectedInventory)) {
  const missing = expectedInventory.filter((file) => !inventory.includes(file));
  const extra = inventory.filter((file) => !expectedInventory.includes(file));
  fail(
    `persistent inventory mismatch; missing=${JSON.stringify(missing)} extra=${JSON.stringify(extra)}`,
  );
}

const packageJson = JSON.parse(
  fs.readFileSync(path.join(frontendRoot, 'package.json'), 'utf8'),
);
if (
  JSON.stringify(packageJson.dependencies) !==
    JSON.stringify(expectedDependencies) ||
  JSON.stringify(packageJson.devDependencies) !==
    JSON.stringify(expectedDevDependencies)
) {
  fail('dependency inventory differs from the approved exact set');
}
if (
  packageJson.engines?.node !== '24.18.0' ||
  packageJson.engines?.npm !== '11.16.0' ||
  packageJson.packageManager !== 'npm@11.16.0' ||
  packageJson.overrides?.['js-yaml'] !== '4.3.0'
) {
  fail('toolchain or js-yaml override drifted');
}

const htmlFiles = inventory.filter((file) => file.endsWith('.html'));
if (htmlFiles.length !== 1 || htmlFiles[0] !== 'index.html') {
  fail(`expected one HTML entry, received ${JSON.stringify(htmlFiles)}`);
}
const html = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf8');
if (
  count(html, /id=["']app["']/g) !== 1 ||
  count(html, /<script\s+type=["']module["']/g) !== 1
) {
  fail('index.html must own exactly one app root and module entry');
}

const sourceFiles = walkSource(sourceRoot);
const sourceByFile = new Map(
  sourceFiles.map((file) => [file, fs.readFileSync(file, 'utf8')]),
);
const combinedSource = [...sourceByFile.values()].join('\n');
const appSource = sourceByFile.get(
  path.join(sourceRoot, 'app', 'App.vue'),
);
if (
  !appSource ||
  count(appSource, /:\s*recoverDeferredSurface\b/g) !== 4 ||
  !/\bcreateShareUrl\s*\(/.test(appSource) ||
  !/\blocation\.reload\s*\(/.test(appSource) ||
  !/deferred-surface-reload-v1/.test(appSource)
) {
  fail('all four deferred surfaces must retain production reload recovery');
}

if (
  count(combinedSource, /\bcreateApp\s*\(/g) !== 1 ||
  count(combinedSource, /\.mount\s*\(/g) !== 1 ||
  count(combinedSource, /\bcreatePinia\s*\(/g) !== 1
) {
  fail('Vue mount or Pinia root does not have one owner');
}

const queryWireImporters = [];
const catalogWireImporters = [];
const candidatesWireImporters = [];
const coStarWireImporters = [];
const personDetailWireImporters = [];
const partnersWireImporters = [];
const rankingsWireImporters = [];
const storeOwners = [];
const requestCallers = [];
const providerOwners = [];
const brandImporters = [];
for (const [file, source] of sourceByFile) {
  const relative = path.relative(frontendRoot, file);
  if (/generated\/query-wire/.test(source)) {
    queryWireImporters.push(relative);
  }
  if (/generated\/catalog/.test(source)) {
    catalogWireImporters.push(relative);
  }
  if (/generated\/candidates/.test(source)) {
    candidatesWireImporters.push(relative);
  }
  if (/generated\/co-star/.test(source)) {
    coStarWireImporters.push(relative);
  }
  if (/generated\/person-detail/.test(source)) {
    personDetailWireImporters.push(relative);
  }
  if (/generated\/partners/.test(source)) {
    partnersWireImporters.push(relative);
  }
  if (/generated\/rankings/.test(source)) {
    rankingsWireImporters.push(relative);
  }
  if (/\bdefineStore\s*\(/.test(source)) {
    storeOwners.push(relative);
  }
  if (/\bfetch(?:Implementation)?\s*\(/.test(source)) {
    requestCallers.push(relative);
  }
  if (/\bNConfigProvider\b/.test(source)) {
    providerOwners.push(relative);
  }
  if (/assets\/brand\/bgmss\.png/.test(source)) {
    brandImporters.push(relative);
  }
  if (
    relative.startsWith('src/shared/') &&
    /(?:from|import)\s*\(?\s*['"][^'"]*(?:\/app\/|\/api\/|\/features\/)/.test(
      source,
    )
  ) {
    fail(`shared import direction violation: ${relative}`);
  }
  if (
    relative.startsWith('src/api/') &&
    !relative.includes('/generated/') &&
    /(?:from|import)\s*\(?\s*['"][^'"]*(?:\/app\/|\/features\/)/.test(source)
  ) {
    fail(`API import direction violation: ${relative}`);
  }
  if (
    relative.endsWith('.vue') &&
    (/\bfetch\s*\(/.test(source) ||
      /generated\/(?:query-wire|candidates)/.test(source))
  ) {
    fail(`component bypasses API ownership: ${relative}`);
  }
  if (
    relative.endsWith('.vue') &&
    !relative.endsWith('src/app/App.vue') &&
    /\buse(?:Catalog|Query|Runtime)Store\s*\(/.test(source)
  ) {
    fail(`leaf component instantiates a store: ${relative}`);
  }
}

assertExactFiles('query wire ownership', queryWireImporters, [
  'src/api/adapters/queryWire.ts',
  'src/features/query/coordinator.ts',
  'src/features/query/model.ts',
  'src/features/query/share.ts',
]);
assertExactFiles('catalog wire ownership', catalogWireImporters, [
  'src/api/adapters/catalog.ts',
]);
assertExactFiles('candidates wire ownership', candidatesWireImporters, [
  'src/api/adapters/candidates.ts',
  'src/api/candidates.ts',
]);
assertExactFiles('co-star wire ownership', coStarWireImporters, [
  'src/api/adapters/coStar.ts',
  'src/api/coStar.ts',
]);
assertExactFiles('person-detail wire ownership', personDetailWireImporters, [
  'src/api/adapters/personDetail.ts',
  'src/api/personDetail.ts',
]);
assertExactFiles('partners wire ownership', partnersWireImporters, [
  'src/api/adapters/partners.ts',
  'src/api/partners.ts',
]);
assertExactFiles('rankings wire ownership', rankingsWireImporters, [
  'src/api/adapters/rankings.ts',
  'src/api/rankings.ts',
]);
assertExactFiles('Pinia store ownership', storeOwners, [
  'src/app/store/runtime.ts',
  'src/features/catalog/store.ts',
  'src/features/query/store.ts',
]);
assertExactFiles('request ownership', requestCallers, ['src/api/client.ts']);
assertExactFiles('Naive provider ownership', providerOwners, [
  'src/app/AppProviders.vue',
]);
assertExactFiles('brand ownership', brandImporters, [
  'src/features/query/components/AppHeader.vue',
]);

const brandBytes = fs.readFileSync(
  path.join(frontendRoot, 'src/assets/brand/bgmss.png'),
);
const brandHash = createHash('sha256').update(brandBytes).digest('hex');
if (brandHash !== expectedBrandHash) {
  fail(`brand asset hash drifted: ${brandHash}`);
}
if (
  brandBytes.length < 24 ||
  brandBytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
) {
  fail('brand asset is not the approved PNG');
}

const handwritten = [...sourceByFile]
  .filter(([file]) => !file.includes('/generated/'))
  .map(([, source]) => source)
  .join('\n');
const deniedPatterns = [
  ['Axios', /\baxios\b/i],
  [
    'direct Bangumi API upstream',
    /https?:\/\/(?:api\.)?(?:bgm\.tv|bangumi\.tv)\/v0\//i,
  ],
  ['fixture boot', /\bfixture(?:s)?\b/i],
  ['prototype workbench', /\b(?:useWorkbench|workbench-data)\b/],
  ['second state system', /\b(?:redux|zustand|vuex|mobx)\b/i],
  ['router', /\bvue-router\b/],
  [
    'PositionKey prefix inference',
    /\.(?:startsWith|match|split|test)\s*\(\s*['"`](?:staff|cast|staffset):/i,
  ],
  ['statistical formula', /\(\s*n\s*\*\s*[^+]+\+\s*5\s*\*\s*5\s*\)/i],
];
for (const [label, expression] of deniedPatterns) {
  if (expression.test(handwritten)) {
    fail(`${label} is forbidden in the foundation source`);
  }
}

console.log(
  `architecture check passed: ${inventory.length} persistent files, one mount/provider/request owner, three stores, approved brand ${brandHash}`,
);

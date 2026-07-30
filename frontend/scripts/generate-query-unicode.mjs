import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repositoryRoot = path.resolve(frontendRoot, '..');
const goldenRoot = path.join(repositoryRoot, 'contracts/goldens/query');
const manifestPath = path.join(goldenRoot, 'manifest.json');
const outputPath = path.join(
  frontendRoot,
  'src/features/query/unicode15_1.generated.ts',
);

function digest(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function authority(manifest, source) {
  const entry = manifest.unicode?.files?.find(
    (candidate) => candidate.source === source,
  );
  assert(entry, `Unicode authority is missing: ${source}`);
  const absolutePath = path.join(goldenRoot, entry.path);
  const bytes = fs.readFileSync(absolutePath);
  assert.equal(digest(bytes), entry.sha256, `${source} hash drifted`);
  return bytes.toString('utf8');
}

if (process.version !== 'v24.18.0') {
  throw new Error(
    `query Unicode generation requires Node v24.18.0, received ${process.version}`,
  );
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.unicode?.version, '15.1.0');
assert.equal(manifest.unicode?.normalization, 'NFKC');
assert.deepEqual(manifest.unicode?.caseFoldingStatuses, ['C', 'F']);
assert.deepEqual(manifest.unicode?.excludedCaseFoldingStatuses, ['S', 'T']);

const assignedRanges = [];
for (const line of authority(manifest, 'DerivedAge.txt').split(/\r?\n/u)) {
  const match = line.match(
    /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([0-9]+\.[0-9]+)/u,
  );
  if (!match) {
    continue;
  }
  assignedRanges.push([
    Number.parseInt(match[1], 16),
    Number.parseInt(match[2] ?? match[1], 16),
  ]);
}
assignedRanges.sort((left, right) => left[0] - right[0]);
assert(assignedRanges.length > 1000, 'DerivedAge projection is unexpectedly small');
for (let index = 1; index < assignedRanges.length; index += 1) {
  assert(
    assignedRanges[index - 1][1] < assignedRanges[index][0],
    'DerivedAge projection overlaps',
  );
}

const acceptedStatuses = new Set(manifest.unicode.caseFoldingStatuses);
const foldEntries = [];
for (const line of authority(manifest, 'CaseFolding.txt').split(/\r?\n/u)) {
  const match = line.match(
    /^([0-9A-F]+);\s*([A-Z]);\s*([0-9A-F ]+);/u,
  );
  if (!match || !acceptedStatuses.has(match[2])) {
    continue;
  }
  const mapping = match[3]
    .trim()
    .split(/\s+/u)
    .map((value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .join('');
  foldEntries.push([Number.parseInt(match[1], 16), mapping]);
}
foldEntries.sort((left, right) => left[0] - right[0]);
assert(foldEntries.length > 1000, 'CaseFolding projection is unexpectedly small');
assert.equal(
  new Set(foldEntries.map(([codePoint]) => codePoint)).size,
  foldEntries.length,
  'CaseFolding projection contains duplicate sources',
);

const lines = [
  '// Generated from the pinned Unicode 15.1 DerivedAge and CaseFolding authorities.',
  '// Regenerate only through scripts/generate-query-unicode.mjs.',
  '',
  'export const assignedRanges15_1: readonly (readonly [number, number])[] = [',
  ...assignedRanges.map(
    ([start, end]) => `  [0x${start.toString(16)}, 0x${end.toString(16)}],`,
  ),
  '];',
  '',
  'export const caseFold15_1: ReadonlyMap<number, string> = new Map([',
  ...foldEntries.map(
    ([codePoint, mapping]) =>
      `  [0x${codePoint.toString(16)}, ${JSON.stringify(mapping)}],`,
  ),
  ']);',
];

fs.writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(
  `query Unicode generated: ${assignedRanges.length} assigned ranges, ${foldEntries.length} folds`,
);

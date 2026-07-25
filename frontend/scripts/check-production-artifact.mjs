import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(frontendRoot, 'dist');
const maximumInitialJavaScriptGzipBytes = 300 * 1024;
const expectedBrandHash =
  'd3d1ca5d14d560f3415dfbcc84b58ece72741a51cf860362d09284ed21aa394a';

function fail(message) {
  throw new Error(message);
}

function walk(root) {
  return fs
    .readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(root, path.join(entry.parentPath, entry.name)))
    .sort();
}

if (process.version !== 'v24.18.0') {
  fail(`artifact check requires Node v24.18.0, received ${process.version}`);
}
if (!fs.existsSync(distRoot)) {
  fail('dist is missing; run the production build first');
}

const files = walk(distRoot);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
if (htmlFiles.length !== 1 || htmlFiles[0] !== 'index.html') {
  fail(`production must contain one HTML entry: ${JSON.stringify(htmlFiles)}`);
}
if (files.some((file) => file.endsWith('.map'))) {
  fail('production source maps are forbidden');
}
const pngFiles = files.filter((file) => file.endsWith('.png'));
const approvedBrandFiles = pngFiles.filter((file) => {
  const hash = createHash('sha256')
    .update(fs.readFileSync(path.join(distRoot, file)))
    .digest('hex');
  return hash === expectedBrandHash;
});
if (pngFiles.length !== 1 || approvedBrandFiles.length !== 1) {
  fail(
    `production must contain only the approved brand PNG: ${JSON.stringify(pngFiles)}`,
  );
}
if (
  files.some((file) =>
    /(?:fixture|snapshot|workbench|test|coverage)/i.test(file),
  )
) {
  fail('production artifact contains a forbidden fixture/prototype/test path');
}

const textualFiles = files.filter((file) =>
  /\.(?:css|html|js|json|svg|txt)$/.test(file),
);
const combinedText = textualFiles
  .map((file) => fs.readFileSync(path.join(distRoot, file), 'utf8'))
  .join('\n');
const deniedContent = [
  ['source map reference', /sourceMappingURL=/],
  [
    'direct Bangumi API upstream',
    /https?:\/\/(?:api\.)?(?:bgm\.tv|bangumi\.tv)\/v0\//i,
  ],
  ['Axios', /\baxios\b/i],
  ['prototype workbench', /\b(?:useWorkbench|workbench-data)\b/],
  ['fixture marker', /\bfixture(?:s)?\b/i],
  ['frontend statistical formula', /\(\s*n\s*\*\s*[^+]+\+\s*5\s*\*\s*5\s*\)/i],
];
for (const [label, expression] of deniedContent) {
  if (expression.test(combinedText)) {
    fail(`production artifact contains ${label}`);
  }
}

const javaScriptFiles = files.filter((file) => file.endsWith('.js'));
const gzipBytes = javaScriptFiles.reduce(
  (total, file) =>
    total + gzipSync(fs.readFileSync(path.join(distRoot, file))).byteLength,
  0,
);
if (gzipBytes >= maximumInitialJavaScriptGzipBytes) {
  fail(
    `initial JavaScript gzip budget exceeded: ${gzipBytes} >= ${maximumInitialJavaScriptGzipBytes}`,
  );
}

console.log(
  `artifact check passed: ${files.length} files, one HTML, approved brand, JavaScript gzip ${gzipBytes} bytes`,
);

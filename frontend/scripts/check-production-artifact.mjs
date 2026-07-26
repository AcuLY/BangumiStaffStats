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
const expectedDescription =
  '面向 Bangumi 收藏与全站数据的高密度 Staff 排名与共演分析界面';

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

function tagAttributes(tag) {
  const attributes = new Map();
  const pattern =
    /\s([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  for (const match of tag.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attributes;
}

function localArtifactPath(reference, label, files) {
  if (/^(?:[a-z]+:)?\/\//i.test(reference)) {
    fail(`${label} must be a local artifact path: ${reference}`);
  }
  const pathname = reference.split(/[?#]/u, 1)[0];
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    fail(`${label} contains invalid URL encoding: ${reference}`);
  }
  const relativePath = path.posix.normalize(decoded.replace(/^\/+/u, ''));
  if (
    !relativePath ||
    relativePath === '.' ||
    relativePath.startsWith('../') ||
    !files.includes(relativePath)
  ) {
    fail(`${label} does not resolve to a production file: ${reference}`);
  }
  return relativePath;
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
if (!/deferred-surface-reload-v1/.test(combinedText)) {
  fail('production artifact is missing deferred surface reload recovery');
}

const entryHtml = fs.readFileSync(path.join(distRoot, 'index.html'), 'utf8');
if (entryHtml.includes('正式前端基础')) {
  fail('production HTML contains the obsolete foundation description');
}
const descriptionTags = [...entryHtml.matchAll(/<meta\b[^>]*>/giu)]
  .map((match) => tagAttributes(match[0]))
  .filter(
    (attributes) =>
      attributes.get('name')?.toLowerCase() === 'description',
  );
if (
  descriptionTags.length !== 1 ||
  descriptionTags[0].get('content') !== expectedDescription
) {
  fail('production HTML must contain the exact approved product description');
}
if (
  !/<title>\s*Bangumi Staff Statistics\s*<\/title>/iu.test(entryHtml)
) {
  fail('production HTML must contain the exact approved document title');
}
const iconFiles = [...entryHtml.matchAll(/<link\b[^>]*>/giu)]
  .map((match) => tagAttributes(match[0]))
  .filter((attributes) =>
    (attributes.get('rel') ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .includes('icon'),
  )
  .map((attributes) => {
    const reference = attributes.get('href');
    if (!reference) {
      fail('production favicon link is missing href');
    }
    return localArtifactPath(reference, 'favicon', files);
  });
if (
  iconFiles.length !== 1 ||
  iconFiles[0] !== approvedBrandFiles[0]
) {
  fail(
    `production favicon must reuse the approved brand PNG: ${JSON.stringify(iconFiles)}`,
  );
}
const initialJavaScriptFiles = new Set();
for (const match of entryHtml.matchAll(/<(script|link)\b[^>]*>/giu)) {
  const tagName = match[1].toLowerCase();
  const attributes = tagAttributes(match[0]);
  const isModuleScript =
    tagName === 'script' &&
    attributes.get('type')?.toLowerCase() === 'module' &&
    attributes.has('src');
  const isModulePreload =
    tagName === 'link' &&
    (attributes.get('rel') ?? '')
      .toLowerCase()
      .split(/\s+/u)
      .includes('modulepreload') &&
    attributes.has('href');
  if (!isModuleScript && !isModulePreload) {
    continue;
  }
  const reference = attributes.get(isModuleScript ? 'src' : 'href');
  const file = localArtifactPath(
    reference,
    isModuleScript ? 'module script' : 'module preload',
    files,
  );
  if (!file.endsWith('.js')) {
    fail(`initial module reference must be JavaScript: ${reference}`);
  }
  initialJavaScriptFiles.add(file);
}
if (initialJavaScriptFiles.size === 0) {
  fail('production HTML must reference at least one initial JavaScript module');
}

const gzipSize = (file) =>
  gzipSync(fs.readFileSync(path.join(distRoot, file))).byteLength;
const initialJavaScriptGzipBytes = [...initialJavaScriptFiles].reduce(
  (total, file) => total + gzipSize(file),
  0,
);
if (
  initialJavaScriptGzipBytes >= maximumInitialJavaScriptGzipBytes
) {
  fail(
    `initial JavaScript gzip budget exceeded: ${initialJavaScriptGzipBytes} >= ${maximumInitialJavaScriptGzipBytes}`,
  );
}

const javaScriptFiles = files.filter((file) => file.endsWith('.js'));
const totalJavaScriptGzipBytes = javaScriptFiles.reduce(
  (total, file) =>
    total + gzipSize(file),
  0,
);

console.log(
  `artifact check passed: ${files.length} files, one HTML, approved metadata and brand, initial JavaScript gzip ${initialJavaScriptGzipBytes} bytes (${initialJavaScriptFiles.size} file), total JavaScript gzip ${totalJavaScriptGzipBytes} bytes`,
);

import { createHash } from 'node:crypto';
import fs from 'node:fs';

import { deepFreeze } from '../lib/canonical-json.mjs';
import { assertSha256 } from '../lib/digest.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';
import { requireCanonicalPath } from '../lib/path-policy.mjs';
import { IMAGE_MEDIA_TYPES, TARGET } from './constants.mjs';
import { withInspectedTarFile } from './tar.mjs';

const MAX_JSON_BYTES = 4 * 1024 * 1024;
const OCI_INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json';

export class ReleaseOciError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'ReleaseOciError';
  }
}

function fail(message, cause) {
  throw new ReleaseOciError(message, cause ? { cause } : undefined);
}

function exactKeys(value, required, optional, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(`${label} must be an object`);
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(`${label} contains unknown field ${key}`);
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(`${label} lacks field ${key}`);
  }
}

function descriptor(value, label, expectedMediaType) {
  exactKeys(
    value,
    ['digest', 'mediaType', 'size'],
    ['annotations', 'artifactType', 'data', 'platform', 'urls'],
    label,
  );
  const digest = assertSha256(value.digest, `${label}.digest`);
  if (value.mediaType !== expectedMediaType) {
    fail(`${label}.mediaType is not ${expectedMediaType}`);
  }
  if (!Number.isSafeInteger(value.size) || value.size < 0) {
    fail(`${label}.size must be a non-negative safe integer`);
  }
  return deepFreeze({
    digest,
    mediaType: value.mediaType,
    size: value.size,
  });
}

function blobPath(digest) {
  return `blobs/sha256/${assertSha256(digest).slice(7)}`;
}

function readMember(descriptor, member, maximum = MAX_JSON_BYTES) {
  if (member.size > maximum) fail(`OCI member exceeds read bound: ${member.path}`);
  const bytes = Buffer.alloc(member.size);
  let total = 0;
  while (total < member.size) {
    const count = fs.readSync(
      descriptor,
      bytes,
      total,
      member.size - total,
      member.offset + total,
    );
    if (count === 0) break;
    total += count;
  }
  if (total !== member.size) fail(`OCI member ended early: ${member.path}`);
  return bytes;
}

function digestMember(descriptor, member) {
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let total = 0;
  while (total < member.size) {
    const count = fs.readSync(
      descriptor,
      buffer,
      0,
      Math.min(buffer.length, member.size - total),
      member.offset + total,
    );
    if (count === 0) break;
    hash.update(buffer.subarray(0, count));
    total += count;
  }
  if (total !== member.size) fail(`OCI blob ended early: ${member.path}`);
  return `sha256:${hash.digest('hex')}`;
}

function verifyBlob(descriptor, members, declared, label) {
  const member = members.get(blobPath(declared.digest));
  if (!member) fail(`${label} blob is missing`);
  if (member.size !== declared.size) fail(`${label} blob size differs from descriptor`);
  if (digestMember(descriptor, member) !== declared.digest) {
    fail(`${label} blob digest differs from descriptor`);
  }
  return member;
}

function parseMemberJson(descriptor, member, label) {
  let value;
  try {
    value = parseJsonStrict(readMember(descriptor, member).toString('utf8'), label);
  } catch (error) {
    fail(`${label} is not strict JSON`, error);
  }
  return value;
}

export function inspectOciArchive({
  archivePath,
  declaredLoadReference,
  target = TARGET,
}) {
  const archive = requireCanonicalPath(archivePath, {
    label: 'OCI archive',
    requireSingleLink: true,
    type: 'file',
  });
  return withInspectedTarFile(archive, ({ descriptor: archiveDescriptor, members: membersArray }) => {
  const members = new Map(membersArray.map((entry) => [entry.path, entry]));
  for (const required of ['index.json', 'manifest.json', 'oci-layout']) {
    if (!members.has(required)) fail(`OCI archive lacks ${required}`);
  }
  const layout = parseMemberJson(archiveDescriptor, members.get('oci-layout'), 'OCI layout');
  exactKeys(layout, ['imageLayoutVersion'], [], 'OCI layout');
  if (layout.imageLayoutVersion !== '1.0.0') fail('OCI layout version must be 1.0.0');

  const index = parseMemberJson(archiveDescriptor, members.get('index.json'), 'OCI index');
  exactKeys(index, ['manifests', 'schemaVersion'], ['annotations', 'mediaType'], 'OCI index');
  if (
    index.schemaVersion !== 2 ||
    index.mediaType !== OCI_INDEX_MEDIA_TYPE ||
    !Array.isArray(index.manifests)
  ) {
    fail('OCI index must be schemaVersion 2 with manifests');
  }
  if (index.manifests.length !== 1) fail('OCI index must contain one manifest');
  const indexManifestValue = index.manifests[0];
  const manifestDescriptor = descriptor(
    indexManifestValue,
    'OCI index manifest',
    IMAGE_MEDIA_TYPES.manifest,
  );
  if (
    indexManifestValue.annotations?.['io.containerd.image.name'] !==
      declaredLoadReference ||
    indexManifestValue.annotations?.['org.opencontainers.image.ref.name'] !==
      declaredLoadReference.slice(declaredLoadReference.lastIndexOf(':') + 1)
  ) {
    fail('OCI index does not bind the exact declared load reference');
  }
  exactKeys(
    indexManifestValue.platform,
    ['architecture', 'os'],
    ['os.features', 'os.version', 'variant'],
    'OCI index platform',
  );
  if (
    indexManifestValue.platform.os !== target.os ||
    indexManifestValue.platform.architecture !== target.architecture
  ) {
    fail('OCI index platform differs from the admitted target');
  }
  const manifestMember = verifyBlob(
    archiveDescriptor,
    members,
    manifestDescriptor,
    'OCI manifest',
  );
  const manifest = parseMemberJson(archiveDescriptor, manifestMember, 'OCI manifest');
  exactKeys(
    manifest,
    ['config', 'layers', 'mediaType', 'schemaVersion'],
    ['annotations', 'artifactType', 'subject'],
    'OCI manifest',
  );
  if (
    manifest.schemaVersion !== 2 ||
    manifest.mediaType !== IMAGE_MEDIA_TYPES.manifest ||
    !Array.isArray(manifest.layers) ||
    manifest.layers.length === 0
  ) {
    fail('OCI manifest graph is outside the closed image profile');
  }
  const configDescriptor = descriptor(
    manifest.config,
    'OCI config',
    IMAGE_MEDIA_TYPES.config,
  );
  const layers = manifest.layers.map((entry, index) =>
    descriptor(entry, `OCI layer ${index}`, IMAGE_MEDIA_TYPES.layer),
  );
  const configMember = verifyBlob(
    archiveDescriptor,
    members,
    configDescriptor,
    'OCI config',
  );
  layers.forEach((entry, index) =>
    verifyBlob(archiveDescriptor, members, entry, `OCI layer ${index}`),
  );
  const config = parseMemberJson(archiveDescriptor, configMember, 'OCI config');
  if (
    config === null ||
    typeof config !== 'object' ||
    Array.isArray(config) ||
    config.os !== target.os ||
    config.architecture !== target.architecture
  ) {
    fail('OCI config platform differs from the admitted target');
  }
  if (
    config.rootfs === null ||
    typeof config.rootfs !== 'object' ||
    Array.isArray(config.rootfs) ||
    config.rootfs.type !== 'layers' ||
    !Array.isArray(config.rootfs.diff_ids) ||
    config.rootfs.diff_ids.length !== layers.length ||
    config.rootfs.diff_ids.some(
      (entry) => typeof entry !== 'string' || !/^sha256:[0-9a-f]{64}$/u.test(entry),
    )
  ) {
    fail('OCI config rootfs does not bind one diff ID per manifest layer');
  }
  if (!Array.isArray(config.history)) fail('OCI config history must be an array');
  const materialHistory = config.history.filter(
    (entry) =>
      entry !== null &&
      typeof entry === 'object' &&
      !Array.isArray(entry) &&
      entry.empty_layer !== true,
  );
  if (materialHistory.length !== layers.length) {
    fail('OCI config history does not bind the manifest layer count');
  }
  const expectedEntrypoint = declaredLoadReference.startsWith(
    'localhost/bgmss-backend-api:',
  )
    ? ['/usr/local/bin/bgmss-api']
    : ['/usr/local/bin/python', '-m', 'bangumi_staff_stats_updater'];
  if (
    config.config === null ||
    typeof config.config !== 'object' ||
    Array.isArray(config.config) ||
    config.config.User !== '65532:65532' ||
    !Array.isArray(config.config.Entrypoint) ||
    config.config.Entrypoint.length !== expectedEntrypoint.length ||
    config.config.Entrypoint.some(
      (entry, index) => entry !== expectedEntrypoint[index],
    )
  ) {
    fail('OCI runtime user or entrypoint differs from the accepted component');
  }

  const allowedBlobs = new Set([
    blobPath(manifestDescriptor.digest),
    blobPath(configDescriptor.digest),
    ...layers.map((entry) => blobPath(entry.digest)),
  ]);
  const allowedMembers = new Set([
    'index.json',
    'manifest.json',
    'oci-layout',
    ...allowedBlobs,
  ]);
  if (
    membersArray.length !== allowedMembers.size ||
    membersArray.some((member) => !allowedMembers.has(member.path))
  ) {
    fail('OCI archive contains an extra, orphan, or missing graph member');
  }

  const dockerManifest = parseMemberJson(
    archiveDescriptor,
    members.get('manifest.json'),
    'Docker compatibility manifest',
  );
  if (!Array.isArray(dockerManifest) || dockerManifest.length !== 1) {
    fail('Docker compatibility manifest must contain one image');
  }
  const dockerEntry = dockerManifest[0];
  exactKeys(
    dockerEntry,
    ['Config', 'Layers', 'RepoTags'],
    [],
    'Docker compatibility image',
  );
  if (
    dockerEntry.Config !== blobPath(configDescriptor.digest) ||
    !Array.isArray(dockerEntry.Layers) ||
    dockerEntry.Layers.length !== layers.length ||
    dockerEntry.Layers.some(
      (entry, index) => entry !== blobPath(layers[index].digest),
    ) ||
    !Array.isArray(dockerEntry.RepoTags) ||
    dockerEntry.RepoTags.length !== 1 ||
    dockerEntry.RepoTags[0] !== declaredLoadReference
  ) {
    fail('Docker compatibility manifest does not bind the OCI graph and load reference');
  }
  return deepFreeze({
    config: configDescriptor,
    indexDigest: digestMember(archiveDescriptor, members.get('index.json')),
    layers,
    manifest: manifestDescriptor,
  });
  });
}

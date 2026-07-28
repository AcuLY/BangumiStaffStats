import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { canonicalJson } from '../../lib/canonical-json.mjs';
import { sha256 } from '../../lib/digest.mjs';
import { createRunRoot } from '../../lib/run-root.mjs';
import { inspectOciArchive, ReleaseOciError } from '../../release/oci.mjs';
import { cleanupOwnedRunRoot } from '../../release/owned-cleanup.mjs';
import {
  withInspectedTarFile,
  writeDeterministicTar,
} from '../../release/tar.mjs';

const TEST_TMP = path.join(os.tmpdir(), 'bgmss-release-oci-tests');
const LOAD_REFERENCE =
  'localhost/bgmss-backend-api:0000000000000000000000000000000000000000-amd64';
const CONFIG_MEDIA_TYPE = 'application/vnd.oci.image.config.v1+json';
const INDEX_MEDIA_TYPE = 'application/vnd.oci.image.index.v1+json';
const LAYER_MEDIA_TYPE = 'application/vnd.oci.image.layer.v1.tar+gzip';
const MANIFEST_MEDIA_TYPE = 'application/vnd.oci.image.manifest.v1+json';

function descriptor(bytes, mediaType) {
  return {
    digest: sha256(bytes),
    mediaType,
    size: bytes.length,
  };
}

function sourceFile(root, name, bytes) {
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o444 });
  return file;
}

function buildArchive({
  configArchitecture = 'amd64',
  extraMember = false,
  memberMtime = 0,
  omitDirectories = false,
  orphanBlob = false,
  rootfsDiffIds = [
    'sha256:1111111111111111111111111111111111111111111111111111111111111111',
  ],
} = {}) {
  const purpose = 'oci-archive-test';
  const run = createRunRoot({
    directories: ['archive', 'source'],
    purpose,
    tmpRoot: TEST_TMP,
  });
  const source = path.join(run.runRoot, 'source');
  const layerBytes = Buffer.from('closed layer bytes\n', 'utf8');
  const layerDescriptor = descriptor(layerBytes, LAYER_MEDIA_TYPE);
  const configBytes = Buffer.from(
    canonicalJson({
      architecture: configArchitecture,
      config: {
        Entrypoint: ['/usr/local/bin/bgmss-api'],
        User: '65532:65532',
      },
      history: [{ created_by: 'closed test fixture' }],
      os: 'linux',
      rootfs: {
        diff_ids: rootfsDiffIds,
        type: 'layers',
      },
    }),
    'utf8',
  );
  const configDescriptor = descriptor(configBytes, CONFIG_MEDIA_TYPE);
  const manifestBytes = Buffer.from(
    canonicalJson({
      config: configDescriptor,
      layers: [layerDescriptor],
      mediaType: MANIFEST_MEDIA_TYPE,
      schemaVersion: 2,
    }),
    'utf8',
  );
  const manifestDescriptor = descriptor(manifestBytes, MANIFEST_MEDIA_TYPE);
  const indexBytes = Buffer.from(
    canonicalJson({
      manifests: [
        {
          ...manifestDescriptor,
          annotations: {
            'io.containerd.image.name': LOAD_REFERENCE,
            'org.opencontainers.image.ref.name':
              LOAD_REFERENCE.slice(LOAD_REFERENCE.lastIndexOf(':') + 1),
          },
          platform: {
            architecture: 'amd64',
            os: 'linux',
          },
        },
      ],
      mediaType: INDEX_MEDIA_TYPE,
      schemaVersion: 2,
    }),
    'utf8',
  );
  const dockerManifestBytes = Buffer.from(
    canonicalJson([
      {
        Config: `blobs/sha256/${configDescriptor.digest.slice(7)}`,
        Layers: [`blobs/sha256/${layerDescriptor.digest.slice(7)}`],
        RepoTags: [LOAD_REFERENCE],
      },
    ]),
    'utf8',
  );
  const layoutBytes = Buffer.from(
    canonicalJson({ imageLayoutVersion: '1.0.0' }),
    'utf8',
  );
  const members = [
    ...(
      omitDirectories
        ? []
        : [
            {
              path: 'blobs',
              type: 'directory',
            },
            {
              path: 'blobs/sha256',
              type: 'directory',
            },
          ]
    ),
    {
      path: 'index.json',
      bytes: indexBytes,
    },
    {
      path: 'manifest.json',
      bytes: dockerManifestBytes,
    },
    {
      path: 'oci-layout',
      bytes: layoutBytes,
    },
    {
      path: `blobs/sha256/${manifestDescriptor.digest.slice(7)}`,
      bytes: manifestBytes,
    },
    {
      path: `blobs/sha256/${configDescriptor.digest.slice(7)}`,
      bytes: configBytes,
    },
    {
      path: `blobs/sha256/${layerDescriptor.digest.slice(7)}`,
      bytes: layerBytes,
    },
  ];
  if (extraMember) {
    members.push({
      bytes: Buffer.from('extra\n', 'utf8'),
      path: 'unreviewed.txt',
    });
  }
  if (orphanBlob) {
    const bytes = Buffer.from('orphan\n', 'utf8');
    members.push({
      bytes,
      path: `blobs/sha256/${sha256(bytes).slice(7)}`,
    });
  }
  const tarMembers = members.map((member, index) =>
    member.type === 'directory'
      ? {
          mode: 0o555,
          mtime: memberMtime,
          path: member.path,
          type: 'directory',
        }
      : {
          mode: 0o444,
          mtime: memberMtime,
          path: member.path,
          source: sourceFile(source, `member-${index}`, member.bytes),
        },
  );
  const archive = path.join(run.runRoot, 'archive', 'image.oci.tar');
  writeDeterministicTar({ archivePath: archive, members: tarMembers });
  return { archive, purpose, run };
}

function cleanup(fixture) {
  cleanupOwnedRunRoot(fixture.run.runRoot, {
    expectedPurpose: fixture.purpose,
    tmpRoot: TEST_TMP,
  });
}

test('OCI inspector accepts one closed linux/amd64 graph', () => {
  const fixture = buildArchive();
  try {
    const graph = inspectOciArchive({
      archivePath: fixture.archive,
      declaredLoadReference: LOAD_REFERENCE,
    });
    assert.equal(graph.config.mediaType, CONFIG_MEDIA_TYPE);
    assert.equal(graph.layers.length, 1);
    assert.equal(graph.manifest.mediaType, MANIFEST_MEDIA_TYPE);
  } finally {
    cleanup(fixture);
  }
});

for (const [name, mutation] of [
  ['config platform mismatch', { configArchitecture: 'arm64' }],
  ['extra top-level member', { extraMember: true }],
  ['missing normalized directories', { omitDirectories: true }],
  ['orphan blob', { orphanBlob: true }],
  ['rootfs and manifest layer mismatch', { rootfsDiffIds: [] }],
]) {
  test(`OCI inspector rejects ${name}`, () => {
    const fixture = buildArchive(mutation);
    try {
      assert.throws(
        () =>
          inspectOciArchive({
            archivePath: fixture.archive,
            declaredLoadReference: LOAD_REFERENCE,
          }),
        ReleaseOciError,
      );
    } finally {
      cleanup(fixture);
    }
  });
}

test('OCI inspector binds the normalized source epoch', () => {
  const memberMtime = 1_700_000_000;
  const fixture = buildArchive({ memberMtime });
  try {
    assert.doesNotThrow(() =>
      inspectOciArchive({
        archivePath: fixture.archive,
        declaredLoadReference: LOAD_REFERENCE,
        expectedMtime: memberMtime,
      }),
    );
    assert.throws(() =>
      inspectOciArchive({
        archivePath: fixture.archive,
        declaredLoadReference: LOAD_REFERENCE,
        expectedMtime: memberMtime + 1,
      }),
    );
  } finally {
    cleanup(fixture);
  }
});

test('OCI archive inspection rejects same-byte pathname replacement', () => {
  const fixture = buildArchive();
  try {
    assert.throws(() =>
      withInspectedTarFile(fixture.archive, () => {
        const retained = `${fixture.archive}.retained`;
        fs.renameSync(fixture.archive, retained);
        fs.copyFileSync(
          retained,
          fixture.archive,
          fs.constants.COPYFILE_EXCL,
        );
        fs.chmodSync(fixture.archive, 0o444);
      }),
    );
  } finally {
    cleanup(fixture);
  }
});

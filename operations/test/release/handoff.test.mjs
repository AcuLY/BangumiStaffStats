import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createRunRoot } from '../../lib/run-root.mjs';
import {
  assertCompleteInventoryMatches,
  assertClosedHandoffMembers,
} from '../../release/verify-handoff-lib.mjs';
import { cleanupOwnedRunRoot } from '../../release/owned-cleanup.mjs';
import {
  assertTarExpansionBounds,
  extractTarFile,
  RELEASE_TAR_LIMITS,
  withInspectedTarFile,
  writeDeterministicTar,
} from '../../release/tar.mjs';

const TEST_TMP = path.join(os.tmpdir(), 'bgmss-release-handoff-tests');

function ownedRun(purpose, directories = []) {
  return createRunRoot({ directories, purpose, tmpRoot: TEST_TMP });
}

function cleanup(run, purpose) {
  cleanupOwnedRunRoot(run.runRoot, {
    expectedPurpose: purpose,
    tmpRoot: TEST_TMP,
  });
}

test('complete inventory and tar member closure reject forged, extra, and missing facts', () => {
  const inventory = {
    candidateDocument: 'validation-candidate-v1.json',
    candidateKind: 'validation',
    contentAddress:
      'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    fileCount: 1,
    files: [
      {
        mode: '0444',
        path: 'validation-candidate-v1.json',
        sha256:
          'sha256:0000000000000000000000000000000000000000000000000000000000000000',
        size: 1,
      },
    ],
    schemaVersion: 'operations-candidate-complete-inventory-v1',
    totalSize: 1,
  };
  assert.doesNotThrow(() =>
    assertCompleteInventoryMatches(inventory, structuredClone(inventory)),
  );
  const forged = structuredClone(inventory);
  forged.totalSize = 2;
  assert.throws(() => assertCompleteInventoryMatches(forged, inventory));
  assert.doesNotThrow(() =>
    assertClosedHandoffMembers({
      completeInventory: inventory,
      kind: 'validation',
      members: ['candidate/validation-candidate-v1.json'],
    }),
  );
  for (const members of [
    [],
    [
      'candidate/validation-candidate-v1.json',
      'candidate/unlisted.json',
    ],
  ]) {
    assert.throws(() =>
      assertClosedHandoffMembers({
        completeInventory: inventory,
        kind: 'validation',
        members,
      }),
    );
  }
});

test('tar inspection rejects same-byte pathname replacement', () => {
  const purpose = 'tar-replacement-test';
  const run = ownedRun(purpose, ['source', 'output']);
  try {
    const source = path.join(run.runRoot, 'source', 'payload.txt');
    fs.writeFileSync(source, 'payload\n', { flag: 'wx', mode: 0o444 });
    const archive = path.join(run.runRoot, 'output', 'candidate.tar');
    writeDeterministicTar({
      archivePath: archive,
      members: [{ mode: 0o444, path: 'candidate/payload.txt', source }],
    });
    assert.throws(() =>
      withInspectedTarFile(archive, () => {
        const retained = `${archive}.retained`;
        fs.renameSync(archive, retained);
        fs.copyFileSync(retained, archive, fs.constants.COPYFILE_EXCL);
        fs.chmodSync(archive, 0o444);
      }),
    );
  } finally {
    cleanup(run, purpose);
  }
});
test('tar extraction rejects extra members and enforces resource bounds', () => {
  const purpose = 'tar-boundary-test';
  const run = ownedRun(purpose, ['source', 'archive', 'extract']);
  try {
    const first = path.join(run.runRoot, 'source', 'first.txt');
    const second = path.join(run.runRoot, 'source', 'second.txt');
    fs.writeFileSync(first, 'first\n', { flag: 'wx', mode: 0o444 });
    fs.writeFileSync(second, 'second\n', { flag: 'wx', mode: 0o444 });
    const archive = path.join(run.runRoot, 'archive', 'candidate.tar');
    writeDeterministicTar({
      archivePath: archive,
      members: [
        { mode: 0o444, path: 'candidate/first.txt', source: first },
        { mode: 0o444, path: 'candidate/second.txt', source: second },
      ],
    });
    assert.throws(() =>
      extractTarFile({
        admitMember: (member) => member.path === 'candidate/first.txt',
        archivePath: archive,
        destinationRoot: path.join(run.runRoot, 'extract'),
      }),
    );
    assert.throws(() =>
      assertTarExpansionBounds({
        expandedBytes: RELEASE_TAR_LIMITS.archiveBytes + 1,
        memberCount: 1,
      }),
    );
    assert.throws(() =>
      assertTarExpansionBounds({
        expandedBytes: 1,
        memberCount: RELEASE_TAR_LIMITS.memberCount + 1,
      }),
    );
  } finally {
    cleanup(run, purpose);
  }
});

test('deterministic tar rejects a sparse member above the accepted bound', () => {
  const purpose = 'tar-oversize-test';
  const run = ownedRun(purpose, ['source', 'archive']);
  try {
    const source = path.join(run.runRoot, 'source', 'oversize.bin');
    const descriptor = fs.openSync(source, 'wx', 0o600);
    fs.ftruncateSync(descriptor, RELEASE_TAR_LIMITS.memberBytes + 1);
    fs.closeSync(descriptor);
    fs.chmodSync(source, 0o444);
    assert.throws(() =>
      writeDeterministicTar({
        archivePath: path.join(run.runRoot, 'archive', 'candidate.tar'),
        members: [{ mode: 0o444, path: 'candidate/oversize.bin', source }],
      }),
    );
  } finally {
    cleanup(run, purpose);
  }
});

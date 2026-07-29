import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { sha256 } from '../../lib/digest.mjs';
import { readCandidateAcceptedDevelopment } from '../../release/verify-candidate-lib.mjs';

const SOURCE_RECEIPT = new URL(
  '../../release/accepted-development.json',
  import.meta.url,
);

function fixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-candidate-receipt-'),
  );
  const receiptPath = path.join(root, 'accepted-development.json');
  const bytes = fs.readFileSync(SOURCE_RECEIPT);
  fs.writeFileSync(receiptPath, bytes, { flag: 'wx', mode: 0o444 });
  fs.chmodSync(receiptPath, 0o444);
  return {
    bytes,
    descriptor: {
      mode: '0444',
      path: 'accepted-development.json',
      sha256: sha256(bytes),
      size: bytes.byteLength,
    },
    receiptPath,
    root,
  };
}

function removeFixture(root) {
  fs.rmSync(root, { force: true, recursive: true });
}

function afterFirstDescriptorRead(action) {
  const original = fs.readSync;
  let called = false;
  fs.readSync = function patchedReadSync(...arguments_) {
    const count = original.apply(this, arguments_);
    if (!called && count > 0) {
      called = true;
      action();
    }
    return count;
  };
  return () => {
    fs.readSync = original;
  };
}

test('candidate receipt uses one opened descriptor and never rereads its pathname', {
  concurrency: false,
}, () => {
  const current = fixture();
  const originalOpen = fs.openSync;
  const originalReadFile = fs.readFileSync;
  let receiptOpenCount = 0;
  fs.openSync = function countedOpenSync(filePath, ...rest) {
    if (filePath === current.receiptPath) receiptOpenCount += 1;
    return originalOpen.call(this, filePath, ...rest);
  };
  fs.readFileSync = function forbiddenPathRead() {
    throw new Error('candidate receipt pathname was read twice');
  };
  try {
    const receipt = readCandidateAcceptedDevelopment(
      current.root,
      current.descriptor,
    );
    assert.equal(receipt.digest, current.descriptor.sha256);
    assert.equal(receipt.size, current.descriptor.size);
    assert.equal(receiptOpenCount, 1);
  } finally {
    fs.openSync = originalOpen;
    fs.readFileSync = originalReadFile;
    removeFixture(current.root);
  }
});

test('candidate receipt rejects in-place mutation during its descriptor read', {
  concurrency: false,
}, () => {
  const current = fixture();
  const restoreRead = afterFirstDescriptorRead(() => {
    const mutated = Buffer.from(current.bytes);
    mutated[0] = mutated[0] === 0x7b ? 0x5b : 0x7b;
    fs.chmodSync(current.receiptPath, 0o644);
    fs.writeFileSync(current.receiptPath, mutated);
  });
  try {
    assert.throws(
      () =>
        readCandidateAcceptedDevelopment(current.root, current.descriptor),
      /identity changed while it was read/u,
    );
  } finally {
    restoreRead();
    removeFixture(current.root);
  }
});

test('candidate receipt rejects pathname replacement while its descriptor stays open', {
  concurrency: false,
}, () => {
  const current = fixture();
  const originalPath = `${current.receiptPath}.opened`;
  const restoreRead = afterFirstDescriptorRead(() => {
    fs.renameSync(current.receiptPath, originalPath);
    fs.writeFileSync(current.receiptPath, current.bytes, {
      flag: 'wx',
      mode: 0o444,
    });
    fs.chmodSync(current.receiptPath, 0o444);
  });
  try {
    assert.throws(
      () =>
        readCandidateAcceptedDevelopment(current.root, current.descriptor),
      /identity changed while it was read/u,
    );
  } finally {
    restoreRead();
    removeFixture(current.root);
  }
});

test('candidate receipt rejects a symbolic-link leaf', {
  concurrency: false,
}, () => {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), 'bgmss-candidate-receipt-symlink-'),
  );
  const bytes = fs.readFileSync(SOURCE_RECEIPT);
  fs.symlinkSync(
    fileURLToPath(SOURCE_RECEIPT),
    path.join(root, 'accepted-development.json'),
  );
  try {
    assert.throws(
      () =>
        readCandidateAcceptedDevelopment(root, {
          mode: '0444',
          path: 'accepted-development.json',
          sha256: sha256(bytes),
          size: bytes.byteLength,
        }),
      /cannot be read safely/u,
    );
  } finally {
    removeFixture(root);
  }
});

test('candidate receipt rejects every descriptor field mismatch', {
  concurrency: false,
}, () => {
  const current = fixture();
  try {
    for (const descriptor of [
      { ...current.descriptor, mode: '0555' },
      { ...current.descriptor, sha256: `sha256:${'0'.repeat(64)}` },
      { ...current.descriptor, size: current.descriptor.size + 1 },
    ]) {
      assert.throws(
        () => readCandidateAcceptedDevelopment(current.root, descriptor),
        /accepted receipt\.(?:mode|sha256|size) differs/u,
      );
    }
  } finally {
    removeFixture(current.root);
  }
});

test('candidate receipt rejects a writable actual receipt mode', {
  concurrency: false,
}, () => {
  const current = fixture();
  fs.chmodSync(current.receiptPath, 0o644);
  try {
    assert.throws(
      () =>
        readCandidateAcceptedDevelopment(current.root, current.descriptor),
      /bounded single-link regular file/u,
    );
  } finally {
    removeFixture(current.root);
  }
});

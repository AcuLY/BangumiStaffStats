import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  attestRunRoot,
  cleanupInventoriedRunRoot,
  cleanupRunRoot,
  createRunRoot,
  inventoryRunRoot,
  RUN_MARKER,
  RunRootError,
} from '../../lib/run-root.mjs';

test('run roots carry an immutable ownership and filesystem identity marker', () => {
  const run = createRunRoot({
    purpose: 'run-root-test',
    directories: ['evidence', 'inputs'],
  });
  const attested = attestRunRoot(run.runRoot, {
    expectedOwner: 'bangumi-staff-stats-operations',
    expectedPurpose: 'run-root-test',
  });
  assert.equal(attested.runId, run.runId);
  assert.match(attested.markerDigest, /^sha256:[0-9a-f]{64}$/u);
  const inventory = inventoryRunRoot(run.runRoot);
  assert.deepEqual(
    inventory.entries
      .filter((entry) => entry.type === 'directory')
      .map((entry) => entry.path),
    ['evidence/', 'inputs/'],
  );
  cleanupRunRoot(run.runRoot);
  assert.equal(fs.existsSync(run.runRoot), false);
});

test('cleanup refuses symbolic links and preserves ambiguous state', () => {
  const run = createRunRoot({ purpose: 'run-cleanup-test' });
  const link = path.join(run.runRoot, 'unknown-link');
  fs.symlinkSync(RUN_MARKER, link);
  assert.throws(() => cleanupRunRoot(run.runRoot), RunRootError);
  assert.equal(fs.lstatSync(link).isSymbolicLink(), true);
  fs.unlinkSync(link);
  cleanupRunRoot(run.runRoot);
});

test('attestation refuses a copied marker under another run identity', () => {
  const first = createRunRoot({ purpose: 'marker-source-test' });
  const second = createRunRoot({ purpose: 'marker-target-test' });
  const secondMarker = path.join(second.runRoot, RUN_MARKER);
  fs.chmodSync(secondMarker, 0o600);
  fs.copyFileSync(path.join(first.runRoot, RUN_MARKER), secondMarker);
  fs.chmodSync(secondMarker, 0o400);
  assert.throws(() => attestRunRoot(second.runRoot), RunRootError);
  fs.unlinkSync(secondMarker);
  fs.copyFileSync(path.join(first.runRoot, RUN_MARKER), secondMarker);
  fs.chmodSync(secondMarker, 0o600);
  const source = fs.readFileSync(secondMarker, 'utf8');
  const repaired = source
    .replace(first.runId, second.runId)
    .replace('"marker-source-test"', '"marker-target-test"');
  const information = fs.lstatSync(second.runRoot, { bigint: true });
  const identityRepaired = repaired
    .replace(
      /"rootDevice":"[0-9]+"/u,
      `"rootDevice":"${String(information.dev)}"`,
    )
    .replace(
      /"rootInode":"[0-9]+"/u,
      `"rootInode":"${String(information.ino)}"`,
    );
  fs.writeFileSync(secondMarker, identityRepaired, { mode: 0o400 });
  fs.chmodSync(secondMarker, 0o400);
  cleanupRunRoot(second.runRoot);
  cleanupRunRoot(first.runRoot);
});

test('cleanup refuses a file replaced after its admitted inventory', () => {
  const run = createRunRoot({ purpose: 'file-replacement-test' });
  const victim = path.join(run.runRoot, 'victim.txt');
  const preserved = path.join(path.dirname(run.runRoot), `${run.runId}-original`);
  const replacement = path.join(
    path.dirname(run.runRoot),
    `${run.runId}-replacement`,
  );
  fs.writeFileSync(victim, 'original\n', { mode: 0o600 });
  fs.writeFileSync(replacement, 'replacement\n', { mode: 0o600 });
  const inventory = inventoryRunRoot(run.runRoot);
  fs.renameSync(victim, preserved);
  fs.renameSync(replacement, victim);
  assert.throws(
    () => cleanupInventoriedRunRoot(inventory),
    RunRootError,
  );
  assert.equal(fs.readFileSync(victim, 'utf8'), 'replacement\n');
  fs.unlinkSync(victim);
  fs.renameSync(preserved, victim);
  cleanupRunRoot(run.runRoot);
});

test('cleanup refuses an empty directory replaced after inventory', () => {
  const run = createRunRoot({
    purpose: 'directory-replacement-test',
    directories: ['empty'],
  });
  const victim = path.join(run.runRoot, 'empty');
  const preserved = path.join(path.dirname(run.runRoot), `${run.runId}-original`);
  const replacement = path.join(
    path.dirname(run.runRoot),
    `${run.runId}-replacement`,
  );
  fs.mkdirSync(replacement, { mode: 0o700 });
  const inventory = inventoryRunRoot(run.runRoot);
  fs.renameSync(victim, preserved);
  fs.renameSync(replacement, victim);
  assert.throws(
    () => cleanupInventoriedRunRoot(inventory),
    RunRootError,
  );
  assert.equal(fs.lstatSync(victim).isDirectory(), true);
  fs.rmdirSync(victim);
  fs.renameSync(preserved, victim);
  cleanupRunRoot(run.runRoot);
});

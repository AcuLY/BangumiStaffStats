import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const remote = (name) =>
  fs.readFileSync(
    new URL(`../../validation/remote/${name}`, import.meta.url),
    'utf8',
  );

test('ledger authority remains bound to one authenticated descriptor', () => {
  const ledger = remote('ownership-ledger.sh');
  for (const contract of [
    'ledger_open_regular_nofollow',
    'ledger_adopt_authority',
    'ledger_assert_path_binding',
    'ledger_fd_path="/proc/self/fd/',
    'ledger_verify_state_machine_fd',
  ]) {
    assert.match(ledger, new RegExp(contract.replaceAll('/', '\\/'), 'u'));
  }
  assert.match(ledger, /sync -f -- "\/proc\/self\/fd\/\$\{append_fd\}"/u);
  assert.doesNotMatch(
    ledger,
    /done < "\$ledger_path"|>> "\$ledger_path"/u,
  );
});

test('ledger replay requires creation, closure, quarantine, and removal order', () => {
  const ledger = remote('ownership-ledger.sh');
  for (const event of [
    'object-creating',
    'object-created',
    'object-create-abandoned',
    'object-removing',
    'object-removed',
    'path-replace-creating',
    'path-replaced',
    'transfer-watchdog-cancel-requested',
    'transfer-watchdog-cancel-closed',
    'successor-lease-closed',
    'phase-handoff',
  ]) {
    assert.match(ledger, new RegExp(`"${event}"`, 'u'));
  }
  assert.match(ledger, /safe_quarantine/u);
  assert.match(
    ledger,
    /\$prior\.event == "object-create-abandoned" or\s+\$prior\.event == "path-replaced"/u,
  );
  assert.doesNotMatch(
    ledger,
    /\$prior\.event == "path-replaced-destination"/u,
  );
  assert.match(ledger, /\$payload\.details\.previousDestination == null/u);
  assert.doesNotMatch(
    ledger,
    /\$payload\.details\.previousDestination \| identity/u,
  );
  assert.match(ledger, /invalid ledger phase transition/u);
  assert.match(ledger, /invalid event after transfer watchdog cancellation/u);
  assert.match(ledger, /unknown ledger event/u);
});

test('remote cleanup atomically quarantines exact identities and tombstones root', () => {
  const agent = remote('transfer-agent.sh');
  assert.match(agent, /ledger_new_quarantine/u);
  assert.match(agent, /ledger_quarantine_remove/u);
  assert.match(agent, /finalizer_lease/u);
  assert.match(agent, /finalizer_tombstone/u);
  assert.match(agent, /finalize_root_locked/u);
  assert.match(agent, /mv -T --no-clobber/u);
  assert.match(agent, /ledger_fsync_directory/u);
  assert.doesNotMatch(agent, /\brm\s+-[A-Za-z]*r/u);
});

test('bootstrap publishes only after an external authenticated finalizer is live', () => {
  const bootstrap = remote('bootstrap.sh');
  const ready = bootstrap.indexOf('process_live "$finalizer_pid"');
  const publish = bootstrap.indexOf(
    'mv -T --no-clobber -- "$staging" "$target_root"',
  );
  assert.ok(ready > 0 && publish > ready);
  assert.match(bootstrap, /operations-validation-bootstrap-lease-v1/u);
  assert.match(bootstrap, /bootstrap_residue/u);
  assert.match(bootstrap, /fsync_directory \/srv/u);
  assert.match(bootstrap, /watchdog_event/u);
  assert.match(bootstrap, /process_live "\$watchdog_pid"/u);
});

test('successor handoff and recovery require exact process identities', () => {
  const agent = remote('transfer-agent.sh');
  const recovery = remote('recover.sh');
  assert.match(agent, /verify_successor_handoff/u);
  assert.match(agent, /process_identity_live/u);
  assert.match(agent, /successor-lease-closed/u);
  assert.match(
    agent,
    /runtime-closed\|successor-lease-closed\|transfer-aborted/u,
  );
  assert.match(agent, /ackHead/u);
  assert.match(
    agent,
    /append_event object-creating transfer "\$details" "\$current_head"/u,
  );
  assert.match(
    agent,
    /append_event object-created transfer "\$details" "\$current_head"/u,
  );
  assert.match(
    agent,
    /append_event watchdog-closed transfer "\$details" "\$current_head"/u,
  );
  assert.match(
    agent,
    /append_event transfer-watchdog-cancel-closed transfer/u,
  );
  assert.match(recovery, /acquire_recovery_lock/u);
  assert.match(recovery, /flock -n "\$recovery_lock_fd"/u);
  assert.match(recovery, /watchdog_record_live/u);
  assert.match(recovery, /cancel_transfer_watchdog/u);
  assert.match(
    recovery,
    /ledger_append transfer-watchdog-cancel-requested transfer/u,
  );
  assert.match(recovery, /finalizer_tombstone/u);
  assert.match(recovery, /finalizer_lease_matches_tombstone/u);
  assert.match(recovery, /finalizer_status.*== "2"/u);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRuntimeRelease,
  composeModel,
  runtimeReleaseEnvironment,
  serializeReleaseEnvironment,
  validateComposeModel,
} from '../../compose/model.mjs';

const digest = (value) => `sha256:${value.repeat(64)}`;
const release = {
  apiImage: `ghcr.io/aculy/bangumi-staff-stats-api@${digest('a')}`,
  appRevision: 'b'.repeat(40),
  appVersion: 'v0.1.0',
  archiveSmokeDigest: digest('c'),
  commonCommit: 'd'.repeat(40),
  manifestDigest: digest('e'),
  schemaVersion: 'runtime-release-v1',
  updaterImage: `ghcr.io/aculy/bangumi-staff-stats-updater@${digest('f')}`,
};

test('production and validation models retain their exact reserved tuples', () => {
  const production = composeModel('production');
  assert.equal(production.name, 'bgmss_v2');
  assert.deepEqual(production.services.api.ports, [
    {
      host_ip: '127.0.0.1',
      mode: 'host',
      protocol: 'tcp',
      published: '18080',
      target: 8080,
    },
  ]);
  assert.equal(production.networks.runtime.internal, true);
  assert.equal(production.networks.outbound.internal, false);
  assert.deepEqual(production.services.api.networks, ['outbound', 'runtime']);
  assert.deepEqual(production.services.updater.networks, ['outbound']);
  assert.deepEqual(production.services.prometheus.networks, ['runtime']);

  const validation = composeModel('validation');
  assert.equal(validation.name, 'bgmss_ops_validation');
  assert.equal(validation.services.api.ports[0].published, '19090');
  assert.equal(validation.networks.runtime.internal, true);
  assert.equal(validation.networks.outbound.internal, false);
});

test('closed Compose validation rejects topology and privilege mutations', () => {
  const mutations = [
    (value) => {
      value.services.extra = structuredClone(value.services.api);
    },
    (value) => {
      value.networks.outbound.internal = true;
    },
    (value) => {
      value.services.prometheus.networks.push('outbound');
    },
    (value) => {
      value.services.updater.networks.push('runtime');
    },
    (value) => {
      value.services.api.ports[0].host_ip = '0.0.0.0';
    },
    (value) => {
      value.services.prometheus.ports = ['9090:9090'];
    },
    (value) => {
      value.services.api.read_only = false;
    },
    (value) => {
      value.services.api.privileged = true;
    },
    (value) => {
      value.services.updater.volumes.push({
        source: '/var/run/docker.sock',
        target: '/var/run/docker.sock',
        type: 'bind',
      });
    },
    (value) => {
      value.volumes = { legacy: {} };
    },
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(composeModel('production'));
    mutate(changed);
    assert.throws(() => validateComposeModel(changed, 'production'));
  }
});

test('release environment accepts only strict immutable release identity', () => {
  assert.doesNotThrow(() => assertRuntimeRelease(structuredClone(release)));
  const environment = runtimeReleaseEnvironment('production', release);
  assert.equal(
    environment.BGMSS_RELEASE_ROOT,
    '/srv/bgmss-v2/releases/v0.1.0',
  );
  assert.match(
    serializeReleaseEnvironment(environment),
    /^BGMSS_API_IMAGE=ghcr\.io\/aculy\//u,
  );
  for (const appVersion of [
    'v01.2.3',
    'v1.02.3',
    'v1.2.03',
    'v1.2.3-rc.1',
    '1.2.3',
  ]) {
    assert.throws(() =>
      assertRuntimeRelease({ ...release, appVersion }),
    );
  }
  assert.throws(() => composeModel('unreviewed'));
});

import { deepFreeze } from '../lib/canonical-json.mjs';
import { parseJsonStrict } from '../lib/strict-json.mjs';

export const MINIMUM_DOCKER_API_VERSION = '1.45';

const DOCKER_VERSION_IDENTITY =
  /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u;
const DOCKER_API_VERSION =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;

function fail(message) {
  throw new Error(message);
}

function requireObject(value, label) {
  if (
    value === null ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    fail(`Docker version evidence ${label} must be an object`);
  }
  return value;
}

function objectField(value, key, label) {
  const object = requireObject(value, `container for ${label}`);
  if (!Object.hasOwn(object, key)) {
    fail(`Docker version evidence is missing ${label}`);
  }
  return object[key];
}

function apiField(value, label) {
  const object = requireObject(value, label);
  const candidates = ['ApiVersion', 'APIVersion']
    .filter((key) => Object.hasOwn(object, key));
  if (candidates.length !== 1) {
    fail(`Docker version evidence has ambiguous ${label}`);
  }
  return object[candidates[0]];
}

function apiVersionParts(value, label) {
  if (!DOCKER_API_VERSION.test(value)) {
    fail(`${label} is not a safe Docker API identity`);
  }
  return value.split('.').map(Number);
}

function compareApiVersions(left, right) {
  const leftParts = apiVersionParts(left, 'left Docker API version');
  const rightParts = apiVersionParts(right, 'right Docker API version');
  return leftParts[0] - rightParts[0] || leftParts[1] - rightParts[1];
}

function normalizedArchitecture(value) {
  const normalized =
    value === 'x86_64'
      ? 'amd64'
      : value === 'aarch64'
        ? 'arm64'
        : value;
  if (!['amd64', 'arm64'].includes(normalized)) {
    fail('Docker server architecture is not admitted');
  }
  return normalized;
}

export function admitDockerCapability({
  dockerClientVersion,
  dockerNegotiatedApiVersion,
  dockerServerApiVersion,
  dockerServerArchitecture,
  dockerServerMinimumApiVersion,
  dockerServerOs,
  dockerServerVersion,
}) {
  for (const [label, value] of [
    ['Docker client version', dockerClientVersion],
    ['Docker server version', dockerServerVersion],
  ]) {
    if (
      typeof value !== 'string' ||
      !DOCKER_VERSION_IDENTITY.test(value)
    ) {
      fail(`${label} is not a safe evidence identity`);
    }
  }
  if (dockerServerOs !== 'linux') {
    fail('Docker server must be Linux');
  }
  const architecture = normalizedArchitecture(dockerServerArchitecture);
  apiVersionParts(
    dockerServerMinimumApiVersion,
    'Docker server minimum API version',
  );
  apiVersionParts(dockerServerApiVersion, 'Docker server API version');
  apiVersionParts(
    dockerNegotiatedApiVersion,
    'Docker negotiated API version',
  );
  if (
    compareApiVersions(
      dockerNegotiatedApiVersion,
      MINIMUM_DOCKER_API_VERSION,
    ) < 0
  ) {
    fail(
      `Docker negotiated API must be at least ${MINIMUM_DOCKER_API_VERSION}`,
    );
  }
  if (
    compareApiVersions(
      dockerServerMinimumApiVersion,
      dockerNegotiatedApiVersion,
    ) > 0 ||
    compareApiVersions(
      dockerNegotiatedApiVersion,
      dockerServerApiVersion,
    ) > 0
  ) {
    fail('Docker negotiated API is outside the server API interval');
  }
  return deepFreeze({
    dockerClientVersion,
    dockerNegotiatedApiVersion,
    dockerServerApiVersion,
    dockerServerArchitecture: architecture,
    dockerServerMinimumApiVersion,
    dockerServerOs,
    dockerServerVersion,
  });
}

export function parseDockerVersionEvidence(source) {
  if (
    typeof source !== 'string' ||
    source.length === 0 ||
    Buffer.byteLength(source, 'utf8') > 65_536
  ) {
    fail('Docker version evidence is outside the closed byte bound');
  }
  const value = parseJsonStrict(source, 'Docker version evidence');
  const client = requireObject(
    objectField(value, 'Client', 'Client'),
    'Client',
  );
  const server = requireObject(
    objectField(value, 'Server', 'Server'),
    'Server',
  );
  return admitDockerCapability({
    dockerClientVersion: objectField(
      client,
      'Version',
      'Client.Version',
    ),
    dockerNegotiatedApiVersion: apiField(client, 'Client API version'),
    dockerServerApiVersion: apiField(server, 'Server API version'),
    dockerServerArchitecture: objectField(
      server,
      'Arch',
      'Server.Arch',
    ),
    dockerServerMinimumApiVersion: objectField(
      server,
      'MinAPIVersion',
      'Server.MinAPIVersion',
    ),
    dockerServerOs: objectField(server, 'Os', 'Server.Os'),
    dockerServerVersion: objectField(
      server,
      'Version',
      'Server.Version',
    ),
  });
}

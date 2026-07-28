import { deepFreeze } from '../lib/canonical-json.mjs';

export const MINIMUM_DOCKER_API_VERSION = '1.45';

const DOCKER_VERSION_IDENTITY =
  /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/u;
const DOCKER_API_VERSION =
  /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u;

function fail(message) {
  throw new Error(message);
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

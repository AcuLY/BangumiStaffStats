import { canonicalJson, deepFreeze } from '../lib/canonical-json.mjs';
import {
  composeModel,
  PRODUCTION_PROFILE,
  VALIDATION_PROFILE,
  validateComposeModel,
} from '../compose/model.mjs';

export class ValidationRenderPolicyError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationRenderPolicyError';
  }
}

function fail(message) {
  throw new ValidationRenderPolicyError(message);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalized(model) {
  const result = clone(model);
  result.name = '<project>';
  for (const [name, network] of Object.entries(result.networks)) {
    network.name = `<project>_${name}`;
  }
  for (const [name, service] of Object.entries(result.services)) {
    service.logging.options.tag = `<project>-${name}`;
    service.pull_policy = '<profile-pull-policy>';
    if (name === 'prometheus') service.image = '<prometheus-image>';
    for (const volume of service.volumes ?? []) {
      if (volume.source.startsWith('/srv/bgmss-v2/')) {
        volume.source = `<root>/${volume.source.slice('/srv/bgmss-v2/'.length)}`;
      } else if (volume.source.startsWith('/srv/bgmss-ops-validation/')) {
        volume.source =
          `<root>/${volume.source.slice('/srv/bgmss-ops-validation/'.length)}`;
      }
    }
  }
  result.services.api.ports[0].published = '<api-port>';
  return result;
}

export function assertProductionValidationRenderParity() {
  const production = validateComposeModel(
    composeModel(PRODUCTION_PROFILE),
    PRODUCTION_PROFILE,
  );
  const validation = validateComposeModel(
    composeModel(VALIDATION_PROFILE),
    VALIDATION_PROFILE,
  );
  if (
    production.networks.runtime.internal !== true ||
    validation.networks.runtime.internal !== true ||
    production.networks.outbound.internal !== false ||
    validation.networks.outbound.internal !== false
  ) {
    fail(
      'validation must preserve runtime isolation while admitting exact outbound acquisition egress',
    );
  }
  if (
    validation.services.api.ports[0].host_ip !== '127.0.0.1' ||
    validation.services.api.ports[0].published !== '19090' ||
    validation.services.api.ports[0].target !== 8080
  ) {
    fail('validation API publication differs from the exact loopback tuple');
  }
  if (
    canonicalJson(normalized(production)) !==
    canonicalJson(normalized(validation))
  ) {
    fail('production and validation Compose semantics drift beyond substitutions');
  }
  return deepFreeze({ production, validation });
}

export function runOverlay(runId) {
  if (!/^run-[0-9a-f]{32}$/u.test(runId)) {
    throw new TypeError('validation overlay requires an exact run ID');
  }
  const label = { 'fun.bgmss.validation-run': runId };
  return deepFreeze({
    networks: {
      outbound: { labels: label },
      runtime: { labels: label },
    },
    services: {
      api: { labels: label },
      prometheus: { labels: label },
      updater: { labels: label },
    },
  });
}

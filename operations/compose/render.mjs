import { stringify } from 'yaml';

import {
  composeModel,
  runtimeReleaseEnvironment,
  serializeReleaseEnvironment,
} from './model.mjs';

export function renderCompose(profileName) {
  return stringify(composeModel(profileName), {
    aliasDuplicateObjects: false,
    lineWidth: 0,
    sortMapEntries: true,
  });
}

export function renderReleaseEnvironment(profileName, release) {
  return serializeReleaseEnvironment(
    runtimeReleaseEnvironment(profileName, release),
  );
}

import fs from 'node:fs';

import {
  StrictJsonError,
  parseJsonStrict as parseArtifactJsonStrict,
} from '../../artifacts/lib/strict-json.mjs';

export { StrictJsonError };

const fatalUtf8 = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false });

export function decodeUtf8Strict(bytes, label = 'UTF-8 input') {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} must be a Uint8Array`);
  }
  try {
    return fatalUtf8.decode(bytes);
  } catch (error) {
    throw new StrictJsonError(`${label}: invalid UTF-8 (${error.message})`);
  }
}

export function parseJsonStrict(source, label = 'JSON') {
  return parseArtifactJsonStrict(source, label);
}

export function readJsonStrict(filePath) {
  const bytes = fs.readFileSync(filePath);
  return parseJsonStrict(decodeUtf8Strict(bytes, filePath), filePath);
}

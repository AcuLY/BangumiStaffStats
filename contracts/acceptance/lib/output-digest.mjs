import { createHash } from 'node:crypto';

import { canonicalJson } from './canonical-json.mjs';

export const OUTPUT_DIGEST_PLACEHOLDER = `sha256:${'0'.repeat(64)}`;

export function resultOutputDigest(result) {
  const normalized = {
    ...result,
    seals: {
      ...result.seals,
      outputDigest: OUTPUT_DIGEST_PLACEHOLDER,
    },
  };
  return `sha256:${createHash('sha256').update(canonicalJson(normalized)).digest('hex')}`;
}

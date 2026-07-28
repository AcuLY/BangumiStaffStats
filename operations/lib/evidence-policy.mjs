import { deepFreeze } from './canonical-json.mjs';

export class EvidencePolicyError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'EvidencePolicyError';
  }
}

const SECRET_KEY_PATTERN =
  /(?:authorization|bearer|cookie|credential|passwd|password|private.?key|registry.?auth|secret|ssh.?key|token)/iu;
const NONDETERMINISTIC_KEY_PATTERN =
  /(?:created.?at|generated.?at|nonce|now|observed.?at|pid|process.?id|random|temporary.?path|timestamp|updated.?at|uuid)/iu;
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/u;
const SECRET_VALUE_PATTERNS = Object.freeze([
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/u,
  /\bBearer\s+[A-Za-z0-9._~+/-]+=*/u,
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bsk-[A-Za-z0-9_-]{20,}\b/u,
  /(?:^|[?&\s])(?:password|secret|token)=[^\s&]+/iu,
  /:\/\/[^/\s:@]+:[^/\s@]+@/u,
]);
const MACHINE_LOCAL_PATH_PATTERNS = Object.freeze([
  /(?:^|[\s"'])\/Users\/[^/\s]+/u,
  /(?:^|[\s"'])\/home\/[^/\s]+/u,
]);
const FORBIDDEN_ACCEPTANCE_VALUES = new Set([
  'development-accepted-operations-pending',
]);

function location(parent, key) {
  return parent === '$'
    ? `${parent}.${String(key)}`
    : `${parent}.${String(key)}`;
}

export function assertEvidenceSafe(
  value,
  {
    label = 'evidence',
    allowNondeterministicKeys = false,
    allowTimestamps = false,
    maxDepth = 64,
    maxNodes = 100_000,
  } = {},
) {
  const seen = new Set();
  let nodes = 0;

  function inspect(entry, pointer, depth) {
    nodes += 1;
    if (nodes > maxNodes) {
      throw new EvidencePolicyError(`${label} exceeds the closed node count`);
    }
    if (depth > maxDepth) {
      throw new EvidencePolicyError(`${label} exceeds the closed nesting depth`);
    }
    if (typeof entry === 'string') {
      if (FORBIDDEN_ACCEPTANCE_VALUES.has(entry)) {
        throw new EvidencePolicyError(
          `${label} contains a forbidden synthesized acceptance verdict at ${pointer}`,
        );
      }
      if (!allowTimestamps && RFC3339_PATTERN.test(entry)) {
        throw new EvidencePolicyError(
          `${label} contains a nondeterministic timestamp at ${pointer}`,
        );
      }
      if (SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(entry))) {
        throw new EvidencePolicyError(
          `${label} contains secret-shaped text at ${pointer}`,
        );
      }
      if (MACHINE_LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(entry))) {
        throw new EvidencePolicyError(
          `${label} contains a machine-local home path at ${pointer}`,
        );
      }
      return;
    }
    if (entry === null || typeof entry !== 'object') return;
    if (seen.has(entry)) {
      throw new EvidencePolicyError(`${label} contains a cycle at ${pointer}`);
    }
    seen.add(entry);
    try {
      if (Array.isArray(entry)) {
        entry.forEach((item, index) =>
          inspect(item, `${pointer}[${index}]`, depth + 1),
        );
        return;
      }
      for (const [key, item] of Object.entries(entry)) {
        if (SECRET_KEY_PATTERN.test(key)) {
          throw new EvidencePolicyError(
            `${label} contains a secret-shaped field at ${location(pointer, key)}`,
          );
        }
        if (!allowNondeterministicKeys && NONDETERMINISTIC_KEY_PATTERN.test(key)) {
          throw new EvidencePolicyError(
            `${label} contains a nondeterministic field at ${location(pointer, key)}`,
          );
        }
        inspect(item, location(pointer, key), depth + 1);
      }
    } finally {
      seen.delete(entry);
    }
  }

  inspect(value, '$', 0);
  return deepFreeze(value);
}

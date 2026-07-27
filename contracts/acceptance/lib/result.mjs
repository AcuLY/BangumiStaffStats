import { canonicalJson } from './canonical-json.mjs';
import { MATRIX_VERSION, RESULT_VERDICT } from './constants.mjs';
import { resultOutputDigest } from './output-digest.mjs';
import { sanitizeSummary } from './runner.mjs';

export class ResultStateError extends Error {}

function fail(message) {
  throw new ResultStateError(message);
}

function blankCell(cell) {
  return {
    id: cell.id,
    owner: cell.owner,
    status: 'blocked',
    durationMs: 0,
    evidence: [],
    failure: {
      code: 'NOT_RUN',
      summary: 'cell has not run',
      blockedBy: null,
    },
  };
}

export class ResultStateMachine {
  #matrix;
  #cells;
  #cursor = 0;
  #failedBy = null;

  constructor(matrix) {
    this.#matrix = matrix;
    this.#cells = matrix.cells.map(blankCell);
  }

  next() {
    return this.#matrix.cells[this.#cursor] ?? null;
  }

  pass(id, { durationMs, evidence }) {
    this.#settle(id, {
      status: 'pass',
      durationMs,
      evidence,
      failure: null,
    });
  }

  fail(id, { durationMs, evidence = [], code, summary, redactions = [] }) {
    if (this.#failedBy) fail(`result already failed at ${this.#failedBy}`);
    const failure = {
      code,
      summary: sanitizeSummary(summary, redactions),
      blockedBy: null,
    };
    this.#settle(id, {
      status: 'fail',
      durationMs,
      evidence,
      failure,
    });
    this.#failedBy = id;
    for (let index = this.#cursor; index < this.#cells.length; index += 1) {
      this.#cells[index] = {
        ...this.#cells[index],
        failure: {
          code: 'BLOCKED_BY_FAILURE',
          summary: `blocked by ${id}`,
          blockedBy: id,
        },
      };
    }
  }

  #settle(id, replacement) {
    const expected = this.next();
    if (!expected) fail('all matrix cells are already settled');
    if (expected.id !== id) {
      fail(`matrix cell order mismatch: expected ${expected.id}, received ${id}`);
    }
    if (!Number.isInteger(replacement.durationMs) || replacement.durationMs < 0) {
      fail('cell duration must be a non-negative integer');
    }
    if (!Array.isArray(replacement.evidence)) fail('cell evidence must be an array');
    this.#cells[this.#cursor] = {
      id: expected.id,
      owner: expected.owner,
      ...replacement,
    };
    this.#cursor += 1;
  }

  get failedBy() {
    return this.#failedBy;
  }

  get complete() {
    return this.#cursor === this.#cells.length && !this.#failedBy;
  }

  snapshot() {
    return this.#cells.map((cell) => ({
      ...cell,
      evidence: [...cell.evidence],
      failure: cell.failure ? { ...cell.failure } : null,
    }));
  }
}

export function buildResult({
  runId,
  matrix,
  state,
  identities,
  machine,
  measurements,
  seals,
  lifecycle,
}) {
  const cells = state.snapshot();
  const green = cells.every((cell) => cell.status === 'pass');
  const result = {
    schemaVersion: 1,
    matrixVersion: MATRIX_VERSION,
    runId,
    classification: 'development characterization on this recorded profile',
    identities,
    machine,
    measurements,
    cells,
    seals: {
      ...seals,
      outputDigest: null,
    },
    lifecycle: {
      specified: Boolean(lifecycle.specified),
      implemented: Boolean(lifecycle.implemented),
      verified: Boolean(lifecycle.verified),
      committed: Boolean(lifecycle.committed),
      pushed: Boolean(lifecycle.pushed),
      released: false,
      deployed: false,
    },
    verdict: green ? RESULT_VERDICT : null,
  };
  if (matrix.matrixVersion !== result.matrixVersion) {
    fail('matrix/result version mismatch');
  }
  result.seals.outputDigest = resultOutputDigest(result);
  return result;
}

export function canonicalResult(result) {
  return canonicalJson(result);
}

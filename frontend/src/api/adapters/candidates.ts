import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import errorEnvelopeSchema from '../../../../contracts/schemas/rankings/result-error-envelope-v1.schema.json';
import candidatesSuccessSchema from '../../../../contracts/schemas/candidates/success-envelope-v1.schema.json';
import sharedQuerySchema from '../../../../contracts/schemas/query/shared-query-v1.schema.json';
import type {
  CandidatesSuccessEnvelopeV1,
  ResultErrorEnvelopeV1,
} from '../generated/candidates/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

export interface CandidatePerson {
  readonly id: number;
  readonly name: string;
  readonly nameCN: string | null;
}

export interface CandidateItem {
  readonly person: CandidatePerson;
  readonly rank: number;
  readonly workCount: number;
}

export interface CandidatePayload {
  readonly collection?: Readonly<{
    fetchedAt: string;
    stale: boolean;
    warningCodes: readonly string[];
  }>;
  readonly dataVersion: string;
  readonly items: readonly CandidateItem[];
  readonly pagination: Readonly<{
    page: number;
    pageSize: 5 | 10 | 20;
    total: number;
  }>;
  readonly positionCounts: readonly Readonly<{
    count: number;
    positionKey: string;
  }>[];
  readonly positionKey: string;
  readonly requestId: string;
  readonly scope: 'global' | 'personal';
  readonly workUnit: 'series' | 'subject';
}

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
  validateFormats: true,
});
addFormats(ajv);
ajv.addSchema(sharedQuerySchema);

const validateSuccess = ajv.compile(
  candidatesSuccessSchema,
) as ValidateFunction<CandidatesSuccessEnvelopeV1>;
const validateError = ajv.compile(
  errorEnvelopeSchema,
) as ValidateFunction<ResultErrorEnvelopeV1>;

function issues(
  errors: ErrorObject[] | null | undefined,
): readonly DecodeIssue[] {
  return (errors ?? []).slice(0, 8).map((error) => ({
    keyword: error.keyword,
    path: error.instancePath || '/',
  }));
}

function fail(
  label: string,
  errors: ErrorObject[] | null | undefined,
): never {
  throw new ApiDecodeError(
    'schema-mismatch',
    `${label} does not match the candidates wire contract`,
    { issues: issues(errors) },
  );
}

export function decodeCandidatesSuccess(
  value: unknown,
): CandidatesSuccessEnvelopeV1 {
  if (!validateSuccess(value)) {
    return fail('Candidates success response', validateSuccess.errors);
  }
  return value;
}

export function decodeCandidatesError(
  value: unknown,
): ResultErrorEnvelopeV1 {
  if (!validateError(value)) {
    return fail('Candidates error response', validateError.errors);
  }
  return value;
}

export function adaptCandidatesSuccess(
  envelope: CandidatesSuccessEnvelopeV1,
): CandidatePayload {
  const collection =
    'collection' in envelope.meta
      ? Object.freeze({
          fetchedAt: envelope.meta.collection.fetchedAt,
          stale: envelope.meta.collection.stale,
          warningCodes: Object.freeze([
            ...envelope.meta.collection.warningCodes,
          ]) as readonly string[],
        })
      : undefined;

  return Object.freeze({
    ...(collection ? { collection } : {}),
    dataVersion: envelope.meta.dataVersion,
    items: Object.freeze(
      envelope.data.items.map((item) =>
        Object.freeze({
          person: Object.freeze({
            id: item.person.id,
            name: item.person.name,
            nameCN: item.person.nameCN,
          }),
          rank: item.rank,
          workCount: item.workCount,
        }),
      ),
    ),
    pagination: Object.freeze({
      page: envelope.meta.pagination.page,
      pageSize: envelope.meta.pagination.pageSize,
      total: envelope.meta.pagination.total,
    }),
    positionCounts: Object.freeze(
      envelope.data.summary.positionCounts.map((entry) =>
        Object.freeze({
          count: entry.count,
          positionKey: String(entry.positionKey),
        }),
      ),
    ),
    positionKey: String(envelope.data.positionKey),
    requestId: envelope.meta.requestId,
    scope: collection ? 'personal' : 'global',
    workUnit: envelope.data.workUnit,
  });
}

export function decodeCandidatePayload(
  value: unknown,
  expectedScope?: 'global' | 'personal',
): CandidatePayload {
  const payload = adaptCandidatesSuccess(decodeCandidatesSuccess(value));
  if (expectedScope && payload.scope !== expectedScope) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Candidates response scope does not match the requested scope',
      {
        issues: [
          {
            keyword: 'scope-omission',
            path: '/meta/collection',
          },
        ],
      },
    );
  }
  return payload;
}

import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import errorEnvelopeSchema from '../../../../contracts/schemas/rankings/result-error-envelope-v1.schema.json';
import rankingsSuccessSchema from '../../../../contracts/schemas/rankings/success-envelope-v1.schema.json';
import type {
  GlobalRankingItemV1,
  PersonalRankingItemV1,
  PreferenceV1,
  RationalV1,
  RankingsMetricScaleV1,
  RankingsSuccessEnvelopeV1,
  ResultErrorEnvelopeV1,
} from '../generated/rankings/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

export type RankingRational = Readonly<RationalV1>;
export type RankingPreference = Readonly<
  Omit<PreferenceV1, 'evidenceWeight' | 'mean' | 'score'> & {
    readonly evidenceWeight: RankingRational;
    readonly mean: RankingRational;
    readonly score: RankingRational;
  }
>;
export interface RankingItem {
  readonly average: number | null;
  readonly overall: number | null;
  readonly person: Readonly<{
    id: number;
    name: string;
    nameCN: string | null;
  }>;
  readonly preference?: RankingPreference | null;
  readonly rank: number;
  readonly workCount: number;
}
export type RankingMetricScale =
  | Readonly<{
      kind: 'linear';
      max: number | null;
      metric: 'average' | 'count' | 'overall';
    }>
  | Readonly<{
      kind: 'linear';
      max: RankingRational | null;
      metric: 'preference';
    }>;
export interface RankingPayload {
  readonly collection?: Readonly<{
    fetchedAt: string;
    stale: boolean;
    warningCodes: readonly string[];
  }>;
  readonly dataVersion: string;
  readonly items: readonly RankingItem[];
  readonly metricScale: RankingMetricScale;
  readonly pagination: Readonly<{
    page: number;
    pageSize: 5 | 10 | 20;
    total: number;
  }>;
  readonly requestId: string;
  readonly scope: 'global' | 'personal';
  readonly summary: Readonly<{
    characterCount?: number;
    personCount: number;
    workCount: number;
    workUnit: 'series' | 'subject';
  }>;
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

const validateSuccess = ajv.compile(
  rankingsSuccessSchema,
) as ValidateFunction<RankingsSuccessEnvelopeV1>;
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
    `${label} does not match the rankings wire contract`,
    { issues: issues(errors) },
  );
}

export function decodeRankingsSuccess(
  value: unknown,
): RankingsSuccessEnvelopeV1 {
  if (!validateSuccess(value)) {
    return fail('Rankings success response', validateSuccess.errors);
  }
  return value;
}

export function decodeRankingsError(value: unknown): ResultErrorEnvelopeV1 {
  if (!validateError(value)) {
    return fail('Rankings error response', validateError.errors);
  }
  return value;
}

function freezeRational(value: RankingRational): RankingRational {
  return Object.freeze({
    denominator: value.denominator,
    numerator: value.numerator,
  });
}

function adaptMetricScale(
  scale: RankingsMetricScaleV1,
): RankingMetricScale {
  if (scale.metric === 'preference') {
    return Object.freeze({
      kind: scale.kind,
      max: scale.max ? freezeRational(scale.max) : null,
      metric: scale.metric,
    });
  }
  return Object.freeze({
    kind: scale.kind,
    max: scale.max,
    metric: scale.metric,
  });
}

function adaptItem(
  item: GlobalRankingItemV1 | PersonalRankingItemV1,
): RankingItem {
  const preference =
    'preference' in item
      ? item.preference
        ? Object.freeze({
            comparableCount: item.preference.comparableCount,
            comparableSeriesCount: item.preference.comparableSeriesCount,
            effectiveEvidence: item.preference.effectiveEvidence,
            evidenceWeight: freezeRational(item.preference.evidenceWeight),
            mean: freezeRational(item.preference.mean),
            score: freezeRational(item.preference.score),
          })
        : null
      : undefined;
  return Object.freeze({
    average: item.average,
    overall: item.overall,
    person: Object.freeze({
      id: item.person.id,
      name: item.person.name,
      nameCN: item.person.nameCN,
    }),
    ...(preference === undefined ? {} : { preference }),
    rank: item.rank,
    workCount: item.workCount,
  });
}

export function adaptRankingsSuccess(
  envelope: RankingsSuccessEnvelopeV1,
): RankingPayload {
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
    items: Object.freeze(envelope.data.items.map(adaptItem)),
    metricScale: adaptMetricScale(envelope.data.metricScale),
    pagination: Object.freeze({
      page: envelope.meta.pagination.page,
      pageSize: envelope.meta.pagination.pageSize,
      total: envelope.meta.pagination.total,
    }),
    requestId: envelope.meta.requestId,
    scope: collection ? 'personal' : 'global',
    summary: Object.freeze({
      ...('characterCount' in envelope.data.summary
        ? { characterCount: envelope.data.summary.characterCount }
        : {}),
      personCount: envelope.data.summary.personCount,
      workCount: envelope.data.summary.workCount,
      workUnit: envelope.data.summary.workUnit,
    }),
  });
}

export function decodeRankingPayload(value: unknown): RankingPayload {
  return adaptRankingsSuccess(decodeRankingsSuccess(value));
}

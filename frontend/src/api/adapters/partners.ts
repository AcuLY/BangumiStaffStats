import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import errorEnvelopeSchema from '../../../../contracts/schemas/rankings/result-error-envelope-v1.schema.json';
import partnersSuccessSchema from '../../../../contracts/schemas/partners/success-envelope-v1.schema.json';
import sharedQuerySchema from '../../../../contracts/schemas/query/shared-query-v1.schema.json';
import type {
  GlobalPartnerCoreV1,
  GlobalPartnerItemV1,
  PartnersResultErrorEnvelopeV1,
  PartnersSuccessEnvelopeV1,
  PersonalPartnerCoreV1,
  PersonalPartnerItemV1,
  PreferenceV1,
  RationalV1,
} from '../generated/partners/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

export interface PartnerPerson {
  readonly id: number;
  readonly name: string;
  readonly nameCN: string | null;
}

export type PartnerRational = Readonly<RationalV1>;

export interface PartnerPreference {
  readonly comparableCount: number;
  readonly comparableSeriesCount: number;
  readonly effectiveEvidence: number;
  readonly evidenceWeight: PartnerRational;
  readonly mean: PartnerRational | null;
  readonly score: PartnerRational | null;
}

export interface PartnerMetrics {
  readonly average: number | null;
  readonly overall: number | null;
  readonly ratedWorkCount: number;
  readonly workCount: number;
}

export interface PartnerCore {
  readonly metrics: PartnerMetrics;
  readonly person: PartnerPerson;
  readonly positionKeys: readonly string[];
  readonly preference?: PartnerPreference;
}

export interface PartnerItem extends PartnerCore {
  readonly rank: number;
}

export interface PartnerLeader {
  readonly item: PartnerCore | null;
  readonly metric: 'average' | 'count' | 'overall' | 'preference';
}

export interface PartnersPayload {
  readonly collection?: Readonly<{
    fetchedAt: string;
    stale: boolean;
    warningCodes: readonly string[];
  }>;
  readonly dataVersion: string;
  readonly items: readonly PartnerItem[];
  readonly pagination: Readonly<{
    page: number;
    pageSize: 5 | 10 | 20;
    total: number;
  }>;
  readonly requestId: string;
  readonly scope: 'global' | 'personal';
  readonly source: Readonly<{
    metrics: Readonly<{
      average: number | null;
      ratedWorkCount: number;
      workCount: number;
    }>;
    person: PartnerPerson;
    positionKeys: readonly string[];
  }>;
  readonly summary: Readonly<{
    leaders: readonly PartnerLeader[];
    partnerCount: number;
  }>;
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
  partnersSuccessSchema,
) as ValidateFunction<PartnersSuccessEnvelopeV1>;
const validateError = ajv.compile(
  errorEnvelopeSchema,
) as ValidateFunction<PartnersResultErrorEnvelopeV1>;

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
    `${label} does not match the partners wire contract`,
    { issues: issues(errors) },
  );
}

export function decodePartnersSuccess(
  value: unknown,
): PartnersSuccessEnvelopeV1 {
  if (!validateSuccess(value)) {
    return fail('Partners success response', validateSuccess.errors);
  }
  return value;
}

export function decodePartnersError(
  value: unknown,
): PartnersResultErrorEnvelopeV1 {
  if (!validateError(value)) {
    return fail('Partners error response', validateError.errors);
  }
  return value;
}

function freezePerson(
  person: Readonly<{ id: number; name: string; nameCN: string | null }>,
): PartnerPerson {
  return Object.freeze({
    id: person.id,
    name: person.name,
    nameCN: person.nameCN,
  });
}

function freezeRational(value: RationalV1): PartnerRational {
  return Object.freeze({
    denominator: value.denominator,
    numerator: value.numerator,
  });
}

function freezePreference(value: PreferenceV1): PartnerPreference {
  return Object.freeze({
    comparableCount: value.comparableCount,
    comparableSeriesCount: value.comparableSeriesCount,
    effectiveEvidence: value.effectiveEvidence,
    evidenceWeight: freezeRational(value.evidenceWeight),
    mean: value.mean ? freezeRational(value.mean) : null,
    score: value.score ? freezeRational(value.score) : null,
  });
}

function adaptCore(
  item:
    | GlobalPartnerCoreV1
    | GlobalPartnerItemV1
    | PersonalPartnerCoreV1
    | PersonalPartnerItemV1,
): PartnerCore {
  return Object.freeze({
    metrics: Object.freeze({
      average: item.metrics.average,
      overall: item.metrics.overall,
      ratedWorkCount: item.metrics.ratedWorkCount,
      workCount: item.metrics.workCount,
    }),
    person: freezePerson(item.person),
    positionKeys: Object.freeze(item.positionKeys.map(String)),
    ...('preference' in item
      ? { preference: freezePreference(item.preference) }
      : {}),
  });
}

function adaptItem(
  item: GlobalPartnerItemV1 | PersonalPartnerItemV1,
): PartnerItem {
  return Object.freeze({
    ...adaptCore(item),
    rank: item.rank,
  });
}

function adaptLeader(
  leader: PartnersSuccessEnvelopeV1['data']['summary']['leaders'][number],
): PartnerLeader {
  const item = (
    leader as unknown as {
      readonly item:
        | GlobalPartnerCoreV1
        | PersonalPartnerCoreV1
        | null;
    }
  ).item;
  return Object.freeze({
    item: item ? adaptCore(item) : null,
    metric: leader.metric,
  });
}

export function adaptPartnersSuccess(
  envelope: PartnersSuccessEnvelopeV1,
): PartnersPayload {
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
    pagination: Object.freeze({
      page: envelope.meta.pagination.page,
      pageSize: envelope.meta.pagination.pageSize,
      total: envelope.meta.pagination.total,
    }),
    requestId: envelope.meta.requestId,
    scope: collection ? 'personal' : 'global',
    source: Object.freeze({
      metrics: Object.freeze({
        average: envelope.data.source.metrics.average,
        ratedWorkCount: envelope.data.source.metrics.ratedWorkCount,
        workCount: envelope.data.source.metrics.workCount,
      }),
      person: freezePerson(envelope.data.source.person),
      positionKeys: Object.freeze(
        envelope.data.source.positionKeys.map(String),
      ),
    }),
    summary: Object.freeze({
      leaders: Object.freeze(
        envelope.data.summary.leaders.map(adaptLeader),
      ),
      partnerCount: envelope.data.summary.partnerCount,
    }),
    workUnit: envelope.data.workUnit,
  });
}

export function decodePartnersPayload(
  value: unknown,
  expectedScope?: 'global' | 'personal',
): PartnersPayload {
  const payload = adaptPartnersSuccess(decodePartnersSuccess(value));
  if (expectedScope && payload.scope !== expectedScope) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Partners response scope does not match the requested scope',
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

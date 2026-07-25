import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import personDetailErrorSchema from '../../../../contracts/schemas/person-detail/result-error-envelope-v1.schema.json';
import personDetailSuccessSchema from '../../../../contracts/schemas/person-detail/success-envelope-v1.schema.json';
import type {
  CharacterItemV1,
  ContributionV1,
  GlobalMetricsV1,
  GlobalRatingsV1,
  GlobalSeriesWorkV1,
  GlobalSubjectWorkV1,
  GlobalTagsV1,
  NonNegativeRationalV1,
  PersonDetailErrorEnvelopeV1,
  PersonDetailSuccessEnvelopeV1,
  PersonV1,
  PersonalMetricsV1,
  PersonalRatingsV1,
  PersonalSeriesWorkV1,
  PersonalSubjectWorkV1,
  PersonalTagsV1,
  PreferenceV1,
  RatingDistributionV1,
  RationalV1,
  SeriesContributionV1,
  UnitReferenceV1,
} from '../generated/person-detail/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type PersonDetailCharacterItem = DeepReadonly<CharacterItemV1>;
export type PersonDetailContribution = DeepReadonly<
  ContributionV1 | SeriesContributionV1
>;
export type PersonDetailEntityRef = DeepReadonly<UnitReferenceV1>;
export type PersonDetailRational = DeepReadonly<
  RationalV1 | NonNegativeRationalV1
>;
export type PersonDetailRatingSet = DeepReadonly<RatingDistributionV1>;
export type PersonDetailSeriesItem = DeepReadonly<
  GlobalSeriesWorkV1 & {
    latestCollectionUpdatedAt?: PersonalSeriesWorkV1['latestCollectionUpdatedAt'];
    personalScore?: PersonalSeriesWorkV1['personalScore'];
  }
>;
export type PersonDetailSubjectItem = DeepReadonly<
  GlobalSubjectWorkV1 & {
    personal?: PersonalSubjectWorkV1['personal'];
  }
>;
export type PersonDetailItem =
  | PersonDetailCharacterItem
  | PersonDetailSeriesItem
  | PersonDetailSubjectItem;

export interface PersonDetailPayload {
  readonly collection?: DeepReadonly<{
    fetchedAt: string;
    stale: boolean;
    warningCodes: readonly 'COLLECTION_STALE'[];
  }>;
  readonly dataVersion: string;
  readonly items: readonly PersonDetailItem[];
  readonly metrics: DeepReadonly<
    GlobalMetricsV1 & {
      globalAverage?: PersonalMetricsV1['globalAverage'];
      highest?: PersonalMetricsV1['highest'];
      lowest?: PersonalMetricsV1['lowest'];
    }
  >;
  readonly pagination: DeepReadonly<{
    page: number;
    pageSize: 5 | 10 | 20;
    total: number;
  }>;
  readonly person: DeepReadonly<PersonV1>;
  readonly preference?: DeepReadonly<PreferenceV1>;
  readonly ratings: DeepReadonly<
    GlobalRatingsV1 & {
      personal?: PersonalRatingsV1['personal'];
    }
  >;
  readonly requestId: string;
  readonly scope: 'global' | 'personal';
  readonly section: 'characters' | 'works';
  readonly summary: DeepReadonly<{
    characterCount?: number;
    workCount: number;
    workUnit: 'series' | 'subject';
  }>;
  readonly tags: DeepReadonly<
    GlobalTagsV1 & {
      personal?: PersonalTagsV1['personal'];
    }
  >;
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
  personDetailSuccessSchema,
) as ValidateFunction<PersonDetailSuccessEnvelopeV1>;
const validateError = ajv.compile(
  personDetailErrorSchema,
) as ValidateFunction<PersonDetailErrorEnvelopeV1>;

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
    `${label} does not match the person-detail wire contract`,
    { issues: issues(errors) },
  );
}

function semanticFailure(message: string, path: string): never {
  throw new ApiDecodeError('schema-mismatch', message, {
    issues: [{ keyword: 'person-detail-semantic', path }],
  });
}

export function decodePersonDetailSuccess(
  value: unknown,
): PersonDetailSuccessEnvelopeV1 {
  if (!validateSuccess(value)) {
    return fail('Person-detail success response', validateSuccess.errors);
  }
  value.data.ratings.global.buckets.forEach((bucket, index) => {
    if (bucket.score !== index + 1) {
      semanticFailure(
        'Person-detail rating buckets are not the fixed 1-10 sequence',
        `/data/ratings/global/buckets/${index}/score`,
      );
    }
  });
  if ('personal' in value.data.ratings) {
    value.data.ratings.personal.buckets.forEach((bucket, index) => {
      if (bucket.score !== index + 1) {
        semanticFailure(
          'Person-detail personal rating buckets are not the fixed 1-10 sequence',
          `/data/ratings/personal/buckets/${index}/score`,
        );
      }
    });
  }
  return value;
}

export function decodePersonDetailError(
  value: unknown,
): PersonDetailErrorEnvelopeV1 {
  if (!validateError(value)) {
    return fail('Person-detail error response', validateError.errors);
  }
  return value;
}

function deepFreeze<T>(value: T): Readonly<T> {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}

export function adaptPersonDetailSuccess(
  envelope: PersonDetailSuccessEnvelopeV1,
): PersonDetailPayload {
  const clone = structuredClone(envelope);
  const personal = 'collection' in clone.meta;
  const payload = {
    ...('collection' in clone.meta
      ? {
          collection: clone.meta.collection,
        }
      : {}),
    dataVersion: clone.meta.dataVersion,
    items: clone.data.items,
    metrics: clone.data.metrics,
    pagination: clone.meta.pagination,
    person: clone.data.person,
    ...('preference' in clone.data
      ? { preference: clone.data.preference }
      : {}),
    ratings: clone.data.ratings,
    requestId: clone.meta.requestId,
    scope: personal ? 'personal' : 'global',
    section: clone.data.section,
    summary: clone.data.summary,
    tags: clone.data.tags,
  };
  return deepFreeze(payload) as PersonDetailPayload;
}

export function decodePersonDetailPayload(
  value: unknown,
): PersonDetailPayload {
  return adaptPersonDetailSuccess(decodePersonDetailSuccess(value));
}

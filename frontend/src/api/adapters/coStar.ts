import Ajv2020, {
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import coStarErrorSchema from '../../../../contracts/schemas/co-star/result-error-envelope-v1.schema.json';
import coStarSuccessSchema from '../../../../contracts/schemas/co-star/success-envelope-v1.schema.json';
import personDetailSuccessSchema from '../../../../contracts/schemas/person-detail/success-envelope-v1.schema.json';
import sharedQuerySchema from '../../../../contracts/schemas/query/shared-query-v1.schema.json';
import rankingsErrorSchema from '../../../../contracts/schemas/rankings/result-error-envelope-v1.schema.json';
import type {
  CoStarResultErrorEnvelopeV1,
  CoStarSuccessEnvelopeV1,
  GlobalGroupDataV1,
  GlobalPairDataV1,
  PersonalGroupDataV1,
  PersonalPairDataV1,
  PreferenceV1,
  RatingDistributionV1,
} from '../generated/co-star/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export type CoStarData = DeepReadonly<
  | GlobalGroupDataV1
  | GlobalPairDataV1
  | PersonalGroupDataV1
  | PersonalPairDataV1
>;

export interface CoStarPayload {
  readonly collection?: DeepReadonly<{
    fetchedAt: string;
    stale: boolean;
    warningCodes: readonly 'COLLECTION_STALE'[];
  }>;
  readonly data: CoStarData;
  readonly dataVersion: string;
  readonly pagination: DeepReadonly<{
    page: number;
    pageSize: 5 | 10 | 20;
    total: number;
  }>;
  readonly requestId: string;
  readonly scope: 'global' | 'personal';
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
ajv.addSchema(personDetailSuccessSchema);
ajv.addSchema(rankingsErrorSchema);

const validateSuccess = ajv.compile(
  coStarSuccessSchema,
) as ValidateFunction<CoStarSuccessEnvelopeV1>;
const validateError = ajv.compile(
  coStarErrorSchema,
) as ValidateFunction<CoStarResultErrorEnvelopeV1>;

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
    `${label} does not match the co-star wire contract`,
    { issues: issues(errors) },
  );
}

function semanticFailure(message: string, path: string): never {
  throw new ApiDecodeError('schema-mismatch', message, {
    issues: [{ keyword: 'co-star-semantic', path }],
  });
}

function validateDistribution(
  distribution: RatingDistributionV1,
  path: string,
): void {
  distribution.buckets.forEach((bucket, index) => {
    if (bucket.score !== index + 1) {
      semanticFailure(
        'Co-star rating buckets are not the fixed 1-10 sequence',
        `${path}/buckets/${index}/score`,
      );
    }
  });
}

function validateSemantics(envelope: CoStarSuccessEnvelopeV1): void {
  const { data } = envelope;
  const participantIds = data.participants.map(
    (participant) => participant.person.id,
  );
  if (new Set(participantIds).size !== participantIds.length) {
    semanticFailure(
      'Co-star participants must be unique',
      '/data/participants',
    );
  }
  data.participants.forEach((participant, index) => {
    if (
      new Set(participant.positionKeys).size !==
      participant.positionKeys.length
    ) {
      semanticFailure(
        'Co-star participant identities must be unique',
        `/data/participants/${index}/positionKeys`,
      );
    }
  });

  data.ratings.datasets.forEach((dataset, index) => {
    if (
      dataset.kind === 'participant' &&
      !participantIds.includes(dataset.personId)
    ) {
      semanticFailure(
        'Co-star rating dataset references an unknown participant',
        `/data/ratings/datasets/${index}/personId`,
      );
    }
    if ('personal' in dataset) {
      validateDistribution(
        dataset.personal as RatingDistributionV1,
        `/data/ratings/datasets/${index}/personal`,
      );
    }
    validateDistribution(
      dataset.global,
      `/data/ratings/datasets/${index}/global`,
    );
  });

  const datasetKeys = data.ratings.datasets.map((dataset) =>
    dataset.kind === 'common'
      ? 'common'
      : `participant:${dataset.personId}`,
  );
  if (new Set(datasetKeys).size !== datasetKeys.length) {
    semanticFailure(
      'Co-star rating datasets must be unique',
      '/data/ratings/datasets',
    );
  }
  if (data.summary.commonWorkCount === 0) {
    const personalTags =
      'personal' in data.tags && Array.isArray(data.tags.personal)
        ? data.tags.personal
        : [];
    if (
      data.items.length !== 0 ||
      data.ratings.datasets.length !== 0 ||
      data.tags.meta.length !== 0 ||
      data.tags.community.length !== 0 ||
      personalTags.length !== 0 ||
      envelope.meta.pagination.total !== 0
    ) {
      semanticFailure(
        'Co-star empty common set must have empty items, tags, and rating datasets',
        '/data/summary/commonWorkCount',
      );
    }
    if ('preference' in data) {
      const preference = data.preference as PreferenceV1;
      if (preference.mean !== null || preference.score !== null) {
        semanticFailure(
          'Co-star empty personal common set must retain null preference evidence',
          '/data/preference',
        );
      }
    }
  } else {
    const datasets = data.ratings.datasets;
    if (
      datasets.length !== participantIds.length + 1 ||
      datasets[0]?.kind !== 'common' ||
      datasets.slice(1).some(
        (dataset, index) =>
          dataset.kind !== 'participant' ||
          dataset.personId !== participantIds[index],
      )
    ) {
      semanticFailure(
        'Co-star rating datasets must start with common and follow participant order',
        '/data/ratings/datasets',
      );
    }
  }

  data.items.forEach((item, index) => {
    if (item.kind !== data.workUnit) {
      semanticFailure(
        'Co-star work item kind does not match workUnit',
        `/data/items/${index}/kind`,
      );
    }
    const itemParticipantIds = item.participants.map(
      (participant) => participant.personId,
    );
    if (
      itemParticipantIds.length !== participantIds.length ||
      itemParticipantIds.some(
        (personId, participantIndex) =>
          personId !== participantIds[participantIndex],
      )
    ) {
      semanticFailure(
        'Co-star work item participants must follow response participant order',
        `/data/items/${index}/participants`,
      );
    }
  });

  if (data.kind !== 'group') {
    return;
  }

  const expectedPairs: string[] = [];
  participantIds.forEach((leftPersonId, leftIndex) => {
    participantIds
      .slice(leftIndex + 1)
      .forEach((rightPersonId) => {
        expectedPairs.push(`${leftPersonId}\u0000${rightPersonId}`);
      });
  });
  const actualPairs = data.matrix.pairs.map(
    (pair) => `${pair.leftPersonId}\u0000${pair.rightPersonId}`,
  );
  if (
    actualPairs.length !== expectedPairs.length ||
    actualPairs.some((pair, index) => pair !== expectedPairs[index])
  ) {
    semanticFailure(
      'Co-star matrix must follow ordered upper-triangle participant order',
      '/data/matrix/pairs',
    );
  }
}

export function decodeCoStarSuccess(
  value: unknown,
): CoStarSuccessEnvelopeV1 {
  if (!validateSuccess(value)) {
    return fail('Co-star success response', validateSuccess.errors);
  }
  validateSemantics(value);
  return value;
}

export function decodeCoStarError(
  value: unknown,
): CoStarResultErrorEnvelopeV1 {
  if (!validateError(value)) {
    return fail('Co-star error response', validateError.errors);
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

export function adaptCoStarSuccess(
  envelope: CoStarSuccessEnvelopeV1,
): CoStarPayload {
  const clone = structuredClone(envelope);
  const collection =
    'collection' in clone.meta ? clone.meta.collection : undefined;
  return deepFreeze({
    ...(collection ? { collection } : {}),
    data: clone.data,
    dataVersion: clone.meta.dataVersion,
    pagination: clone.meta.pagination,
    requestId: clone.meta.requestId,
    scope: collection ? ('personal' as const) : ('global' as const),
  }) as CoStarPayload;
}

export function decodeCoStarPayload(
  value: unknown,
  expectedScope?: 'global' | 'personal',
): CoStarPayload {
  const payload = adaptCoStarSuccess(decodeCoStarSuccess(value));
  if (expectedScope && payload.scope !== expectedScope) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Co-star response scope does not match the requested scope',
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

import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import catalogContextSchema from '../../../../contracts/schemas/query/catalog-context-v1.schema.json';
import effectiveQuerySchema from '../../../../contracts/schemas/query/effective-query-v1.schema.json';
import errorEnvelopeSchema from '../../../../contracts/schemas/query/error-envelope-v1.schema.json';
import operationComponentsSchema from '../../../../contracts/schemas/query/operation-components-v1.schema.json';
import queryDigestProjectionSchema from '../../../../contracts/schemas/query/query-digest-projection-v1.schema.json';
import sharePayloadSchema from '../../../../contracts/schemas/query/share-payload-v1.schema.json';
import sharedQuerySchema from '../../../../contracts/schemas/query/shared-query-v1.schema.json';
import { ApiDecodeError, type DecodeIssue } from '../errors';
import type {
  CandidatesInputV1,
  CandidatesViewV1,
  CatalogContextV1,
  CoStarInputV1,
  CoStarShareWorkspaceV1,
  CoStarViewV1,
  EffectiveQueryV1,
  ErrorEnvelopeV1,
  PartnersInputV1,
  PartnersViewV1,
  PersonDetailInputV1,
  PersonDetailViewV1,
  QueryDigestProjectionV1,
  RankingShareWorkspaceV1,
  RankingsViewV1,
  SharePayloadV1,
  SharedQueryV1,
} from '../generated/query-wire/types.gen';

export type SharedQueryWire = Readonly<SharedQueryV1>;
export type EffectiveQueryWire = Readonly<EffectiveQueryV1>;
export type QueryDigestProjectionWire = Readonly<QueryDigestProjectionV1>;
export type CatalogContextWire = Readonly<CatalogContextV1>;
export type ErrorEnvelopeWire = Readonly<ErrorEnvelopeV1>;
export type SharePayloadWire = Readonly<SharePayloadV1>;
export type SharePath = '/co-star' | '/ranking';

export interface ShareEnvelopeWire {
  readonly path: SharePath;
  readonly payload: SharePayloadWire;
  readonly version: 'v1';
}

const schemaIds = {
  catalog:
    'https://bangumi-staff-stats.local/schemas/query/catalog-context-v1.schema.json',
  effective:
    'https://bangumi-staff-stats.local/schemas/query/effective-query-v1.schema.json',
  error:
    'https://bangumi-staff-stats.local/schemas/query/error-envelope-v1.schema.json',
  operations:
    'https://bangumi-staff-stats.local/schemas/query/operation-components-v1.schema.json',
  projection:
    'https://bangumi-staff-stats.local/schemas/query/query-digest-projection-v1.schema.json',
  share:
    'https://bangumi-staff-stats.local/schemas/query/share-payload-v1.schema.json',
  shared:
    'https://bangumi-staff-stats.local/schemas/query/shared-query-v1.schema.json',
} as const;

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
  validateFormats: true,
});
addFormats(ajv);

for (const schema of [
  catalogContextSchema,
  effectiveQuerySchema,
  errorEnvelopeSchema,
  operationComponentsSchema,
  queryDigestProjectionSchema,
  sharePayloadSchema,
  sharedQuerySchema,
]) {
  ajv.addSchema(schema as AnySchema);
}

function validator(schemaReference: string): ValidateFunction {
  const compiled = ajv.getSchema(schemaReference);
  if (!compiled) {
    throw new Error(`Missing query wire schema: ${schemaReference}`);
  }
  return compiled;
}

function boundedIssues(
  errors: ErrorObject[] | null | undefined,
): readonly DecodeIssue[] {
  return (errors ?? []).slice(0, 8).map((error) => ({
    keyword: error.keyword,
    path: error.instancePath || '/',
  }));
}

function decoder<T>(
  label: string,
  schemaReference: string,
): (value: unknown) => T {
  const validate = validator(schemaReference);
  return (value: unknown): T => {
    if (!validate(value)) {
      throw new ApiDecodeError(
        'schema-mismatch',
        `${label} does not match the shared wire contract`,
        { issues: boundedIssues(validate.errors) },
      );
    }
    return value as T;
  };
}

export const decodeSharedQuery = decoder<SharedQueryWire>(
  'Shared query',
  schemaIds.shared,
);
export const decodeEffectiveQuery = decoder<EffectiveQueryWire>(
  'Effective query',
  schemaIds.effective,
);
export const decodeQueryDigestProjection =
  decoder<QueryDigestProjectionWire>('Query digest projection', schemaIds.projection);
export const decodeCatalogContext = decoder<CatalogContextWire>(
  'Catalog context',
  schemaIds.catalog,
);
export const decodeErrorEnvelope = decoder<ErrorEnvelopeWire>(
  'Error envelope',
  schemaIds.error,
);
export const decodeSharePayload = decoder<SharePayloadWire>(
  'Share payload',
  schemaIds.share,
);

export const decodeRankingsView = decoder<Readonly<RankingsViewV1>>(
  'Rankings view',
  `${schemaIds.operations}#/$defs/RankingsViewV1`,
);
export const decodeCandidatesInput = decoder<Readonly<CandidatesInputV1>>(
  'Candidates input',
  `${schemaIds.operations}#/$defs/CandidatesInputV1`,
);
export const decodeCandidatesView = decoder<Readonly<CandidatesViewV1>>(
  'Candidates view',
  `${schemaIds.operations}#/$defs/CandidatesViewV1`,
);
export const decodePersonDetailInput = decoder<Readonly<PersonDetailInputV1>>(
  'Person detail input',
  `${schemaIds.operations}#/$defs/PersonDetailInputV1`,
);
export const decodePersonDetailView = decoder<Readonly<PersonDetailViewV1>>(
  'Person detail view',
  `${schemaIds.operations}#/$defs/PersonDetailViewV1`,
);
export const decodePartnersInput = decoder<Readonly<PartnersInputV1>>(
  'Partners input',
  `${schemaIds.operations}#/$defs/PartnersInputV1`,
);
export const decodePartnersView = decoder<Readonly<PartnersViewV1>>(
  'Partners view',
  `${schemaIds.operations}#/$defs/PartnersViewV1`,
);
export const decodeCoStarInput = decoder<Readonly<CoStarInputV1>>(
  'Co-star input',
  `${schemaIds.operations}#/$defs/CoStarInputV1`,
);
export const decodeCoStarView = decoder<Readonly<CoStarViewV1>>(
  'Co-star view',
  `${schemaIds.operations}#/$defs/CoStarViewV1`,
);
export const decodeRankingShareWorkspace =
  decoder<Readonly<RankingShareWorkspaceV1>>(
    'Ranking share workspace',
    `${schemaIds.share}#/$defs/RankingWorkspaceV1`,
  );
export const decodeCoStarShareWorkspace =
  decoder<Readonly<CoStarShareWorkspaceV1>>(
    'Co-star share workspace',
    `${schemaIds.share}#/$defs/CoStarWorkspaceV1`,
  );

export function parseWireJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch (error) {
    throw new ApiDecodeError('invalid-json', 'Wire text is not valid JSON', {
      cause: error,
    });
  }
}

export function parseWireUtf8(bytes: Uint8Array): unknown {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ApiDecodeError('invalid-utf8', 'Wire bytes are not valid UTF-8', {
      cause: error,
    });
  }
  return parseWireJson(text);
}

const maximumShareEncodedBytes = 16_384;
const maximumShareDecodedBytes = 65_536;

function invalidShareEnvelope(
  message: string,
  cause?: unknown,
): never {
  throw new ApiDecodeError('schema-mismatch', message, { cause });
}

export function decodeShareEnvelope(
  path: SharePath,
  fragment: string,
): ShareEnvelopeWire {
  if (!fragment.startsWith('#q=')) {
    return invalidShareEnvelope('Share fragment prefix is invalid');
  }

  const envelope = fragment.slice(3);
  const separator = envelope.indexOf('.');
  if (separator < 1) {
    return invalidShareEnvelope('Share fragment version is missing');
  }

  const version = envelope.slice(0, separator);
  if (version !== 'v1') {
    return invalidShareEnvelope('Share fragment version is unsupported');
  }

  const encoded = envelope.slice(separator + 1);
  if (
    encoded.length === 0 ||
    encoded.length > maximumShareEncodedBytes ||
    encoded.length % 4 === 1 ||
    !/^[A-Za-z0-9_-]+$/.test(encoded)
  ) {
    return invalidShareEnvelope('Share fragment encoding is invalid');
  }

  let bytes: Uint8Array;
  try {
    const base64 = encoded
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(encoded.length / 4) * 4, '=');
    const binary = atob(base64);
    bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch (error) {
    return invalidShareEnvelope('Share fragment encoding is invalid', error);
  }
  if (bytes.byteLength > maximumShareDecodedBytes) {
    return invalidShareEnvelope('Share fragment payload is too large');
  }

  const payload = decodeSharePayload(parseWireUtf8(bytes));
  const expectedKind = path === '/ranking' ? 'ranking' : 'co-star';
  if (payload.workspace.kind !== expectedKind) {
    return invalidShareEnvelope('Share path and workspace do not match');
  }

  return {
    path,
    payload,
    version: 'v1',
  };
}

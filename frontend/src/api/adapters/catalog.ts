import Ajv2020, {
  type AnySchema,
  type ErrorObject,
  type ValidateFunction,
} from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import * as generatedSchemas from '../generated/catalog/schemas.gen';
import type {
  CatalogFilterCapabilityV1,
  CatalogGroupV1,
  CatalogPositionCapabilityNameV1,
  CatalogPositionV1,
  CatalogSelectionRuleV1,
  CatalogSortCapabilityV1,
  CatalogSubjectTypeKeyV1,
  CatalogSuccessEnvelopeV1,
} from '../generated/catalog/types.gen';
import { ApiDecodeError, type DecodeIssue } from '../errors';

export type SubjectType = CatalogSubjectTypeKeyV1;
export type CatalogOperation = CatalogPositionCapabilityNameV1;
export type PositionKey = string;
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

export interface CatalogSubjectType {
  readonly key: SubjectType;
  readonly label: string;
}

export interface CatalogPosition {
  readonly capabilities: readonly CatalogOperation[];
  readonly categories: readonly string[];
  readonly displayOrder: number;
  readonly exclusiveGroup?: string;
  readonly key: PositionKey;
  readonly kind: 'cast' | 'staff' | 'staffSet';
  readonly label: string;
  readonly memberKeys?: readonly PositionKey[];
  readonly names: Readonly<{
    cn: string;
    en: string | null;
    jp: string | null;
  }>;
  readonly roleScope?: 'all' | 'main';
  readonly selectable: boolean;
  readonly subjectType: SubjectType;
}

export interface CatalogGroup {
  readonly displayOrder: number;
  readonly key: string;
  readonly kind: 'bangumi' | 'custom' | 'fallback' | 'shortcut';
  readonly label: string;
  readonly positionKeys: readonly PositionKey[];
  readonly subjectType: SubjectType;
}

export interface CatalogSnapshot {
  readonly dataVersion: string;
  readonly filterCapabilities: readonly DeepReadonly<CatalogFilterCapabilityV1>[];
  readonly groups: readonly CatalogGroup[];
  readonly positions: readonly CatalogPosition[];
  readonly positionsByKey: ReadonlyMap<PositionKey, CatalogPosition>;
  readonly requestId: string;
  readonly selectionRules: readonly DeepReadonly<CatalogSelectionRuleV1>[];
  readonly sortCapabilities: readonly DeepReadonly<CatalogSortCapabilityV1>[];
  readonly subjectTypes: readonly CatalogSubjectType[];
}

const subjectOrder: readonly SubjectType[] = [
  'book',
  'anime',
  'music',
  'game',
  'real',
];
const capabilityOrder: readonly CatalogOperation[] = [
  'rankings',
  'candidates',
  'personDetail',
  'partners',
  'coStar',
];

function stripDiscriminator(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stripDiscriminator);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== 'discriminator')
        .map(([key, child]) => [
          key,
          key === '$ref' &&
          typeof child === 'string' &&
          child.startsWith('#/components/schemas/')
            ? child.replace('#/components/schemas/', '#/$defs/')
            : stripDiscriminator(child),
        ]),
    );
  }
  return value;
}

const definitions = Object.fromEntries(
  Object.entries(generatedSchemas).map(([exportName, schema]) => [
    exportName.replace(/Schema$/, ''),
    stripDiscriminator(schema),
  ]),
);

const ajv = new Ajv2020({
  allErrors: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  useDefaults: false,
});
addFormats(ajv);

const validateEnvelope: ValidateFunction = ajv.compile({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $ref: '#/$defs/CatalogSuccessEnvelopeV1',
  $defs: definitions,
} as AnySchema);

function issues(errors: ErrorObject[] | null | undefined): readonly DecodeIssue[] {
  return (errors ?? []).slice(0, 8).map((error) => ({
    keyword: error.keyword,
    path: error.instancePath || '/',
  }));
}

function fail(message: string, path = '/data'): never {
  throw new ApiDecodeError('schema-mismatch', message, {
    issues: [{ keyword: 'catalog-semantic', path }],
  });
}

function assertUnique(values: readonly string[], path: string): void {
  if (new Set(values).size !== values.length) {
    fail('Catalog contains duplicate identities', path);
  }
}

function compareEntityOrder(
  left: { displayOrder: number; key: string; subjectType: SubjectType },
  right: { displayOrder: number; key: string; subjectType: SubjectType },
): number {
  return (
    subjectOrder.indexOf(left.subjectType) -
      subjectOrder.indexOf(right.subjectType) ||
    left.displayOrder - right.displayOrder ||
    left.key.localeCompare(right.key, 'en', { sensitivity: 'variant' })
  );
}

function assertCanonicalOrder<T>(
  values: readonly T[],
  compare: (left: T, right: T) => number,
  path: string,
): void {
  const sorted = [...values].sort(compare);
  if (values.some((value, index) => value !== sorted[index])) {
    fail('Catalog order is not canonical', path);
  }
}

function assertPosition(
  position: CatalogPositionV1,
  positionsByKey: ReadonlyMap<string, CatalogPositionV1>,
  index: number,
): void {
  const path = `/data/positions/${index}`;
  if (position.status === 'hidden' && position.capabilities.length > 0) {
    fail('Hidden positions must not expose capabilities', `${path}/capabilities`);
  }
  const canonicalCapabilities = capabilityOrder.filter((capability) =>
    position.capabilities.includes(capability),
  );
  if (
    canonicalCapabilities.length !== position.capabilities.length ||
    canonicalCapabilities.some(
      (capability, capabilityIndex) =>
        capability !== position.capabilities[capabilityIndex],
    )
  ) {
    fail('Position capabilities are not canonical', `${path}/capabilities`);
  }
  if (new Set(position.categories).size !== position.categories.length) {
    fail('Position categories contain duplicates', `${path}/categories`);
  }

  if (position.kind !== 'staffSet') {
    return;
  }

  const sortedMembers = [...position.memberKeys].sort();
  if (
    new Set(position.memberKeys).size !== position.memberKeys.length ||
    sortedMembers.some((member, memberIndex) => member !== position.memberKeys[memberIndex])
  ) {
    fail('Staff-set members are not canonical', `${path}/memberKeys`);
  }
  for (const memberKey of position.memberKeys) {
    const member = positionsByKey.get(memberKey);
    if (
      !member ||
      member.kind !== 'staff' ||
      member.subjectType !== position.subjectType
    ) {
      fail('Staff-set member is missing or incompatible', `${path}/memberKeys`);
    }
  }
}

function assertCatalogSemantics(envelope: CatalogSuccessEnvelopeV1): void {
  const { data } = envelope;
  if (
    data.subjectTypes.some(
      (subjectType, index) => subjectType.key !== subjectOrder[index],
    )
  ) {
    fail('Subject types are not in canonical order', '/data/subjectTypes');
  }

  assertCanonicalOrder(data.positions, compareEntityOrder, '/data/positions');
  assertCanonicalOrder(data.groups, compareEntityOrder, '/data/groups');
  assertUnique(
    data.positions.map((position) => position.key),
    '/data/positions',
  );
  assertUnique(
    data.groups.map((group) => group.key),
    '/data/groups',
  );
  assertUnique(
    data.selectionRules.map((rule) => rule.key),
    '/data/selectionRules',
  );

  const positionsByKey = new Map(
    data.positions.map((position) => [position.key, position]),
  );
  data.positions.forEach((position, index) =>
    assertPosition(position, positionsByKey, index),
  );

  for (const [index, group] of data.groups.entries()) {
    assertUnique(group.positionKeys, `/data/groups/${index}/positionKeys`);
    for (const key of group.positionKeys) {
      const position = positionsByKey.get(key);
      if (
        !position ||
        position.subjectType !== group.subjectType ||
        position.status !== 'selectable'
      ) {
        fail(
          'Catalog group references a missing, hidden, or incompatible position',
          `/data/groups/${index}/positionKeys`,
        );
      }
    }
  }

  const positionIndex = new Map(
    data.positions.map((position, index) => [position.key, index]),
  );
  let previousRulePosition = -1;
  for (const [index, rule] of data.selectionRules.entries()) {
    const position = positionsByKey.get(rule.positionKey);
    const currentPosition = positionIndex.get(rule.positionKey);
    if (!position || currentPosition === undefined) {
      fail('Selection rule references a missing position', `/data/selectionRules/${index}`);
    }
    if (currentPosition < previousRulePosition) {
      fail('Selection rules are not in canonical order', '/data/selectionRules');
    }
    previousRulePosition = currentPosition;
    const expectedKind = {
      exactCast: 'cast',
      exactStaff: 'staff',
      staffSetUnion: 'staffSet',
    }[rule.kind];
    if (position.kind !== expectedKind) {
      fail('Selection rule kind is incompatible', `/data/selectionRules/${index}`);
    }
    if (
      rule.kind === 'staffSetUnion' &&
      position.kind === 'staffSet' &&
      rule.value !== position.memberKeys.join('|')
    ) {
      fail('Staff-set union is inconsistent', `/data/selectionRules/${index}/value`);
    }
  }
}

function freezeArray<T>(values: readonly T[]): readonly T[] {
  return Object.freeze([...values]);
}

function mapPosition(position: CatalogPositionV1): CatalogPosition {
  return Object.freeze({
    capabilities: freezeArray(position.capabilities),
    categories: freezeArray(position.categories),
    displayOrder: position.displayOrder,
    ...(position.kind === 'cast'
      ? {
          exclusiveGroup: position.exclusiveGroup,
          roleScope: position.roleScope,
        }
      : {}),
    key: position.key,
    kind: position.kind,
    label: position.label,
    ...(position.kind === 'staffSet'
      ? { memberKeys: freezeArray(position.memberKeys) }
      : {}),
    names: Object.freeze({ ...position.names }),
    selectable: position.status === 'selectable',
    subjectType: position.subjectType,
  });
}

export function decodeCatalogEnvelope(value: unknown): CatalogSnapshot {
  if (!validateEnvelope(value)) {
    throw new ApiDecodeError(
      'schema-mismatch',
      'Catalog response does not match the catalog wire contract',
      { issues: issues(validateEnvelope.errors) },
    );
  }

  const envelope = value as CatalogSuccessEnvelopeV1;
  assertCatalogSemantics(envelope);

  const positions = freezeArray(envelope.data.positions.map(mapPosition));
  const positionsByKey = new Map(
    positions.map((position) => [position.key, position]),
  );
  const groups = freezeArray(
    envelope.data.groups.map((group) =>
      Object.freeze({
        displayOrder: group.displayOrder,
        key: group.key,
        kind: group.kind,
        label: group.label,
        positionKeys: freezeArray(group.positionKeys),
        subjectType: group.subjectType,
      }),
    ),
  );

  return Object.freeze({
    dataVersion: envelope.meta.dataVersion,
    filterCapabilities: freezeArray(
      envelope.data.filterCapabilities.map((capability) =>
        Object.freeze(structuredClone(capability)),
      ),
    ),
    groups,
    positions,
    positionsByKey,
    requestId: envelope.meta.requestId,
    selectionRules: freezeArray(
      envelope.data.selectionRules.map((rule) => Object.freeze({ ...rule })),
    ),
    sortCapabilities: freezeArray(
      envelope.data.sortCapabilities.map((capability) =>
        Object.freeze(structuredClone(capability)),
      ),
    ),
    subjectTypes: freezeArray(
      envelope.data.subjectTypes.map((subjectType) =>
        Object.freeze({ ...subjectType }),
      ),
    ),
  });
}

import type {
  CollectionStatusV1,
  EffectiveQueryV1,
  SharedQueryV1,
  SubjectTypeV1,
} from '../../api/generated/query-wire/types.gen';
import {
  decodeEffectiveQuery,
  decodeSharedQuery,
} from '../../api/adapters/queryWire';
import type {
  CatalogOperation,
  CatalogSnapshot,
  PositionKey,
  SubjectType,
} from '../../api/adapters/catalog';
import {
  assignedRanges15_1,
  caseFold15_1,
} from './unicode15_1.generated';

export type QueryScope = 'global' | 'personal';
export type QueryMode = 'co-star' | 'ranking';
export type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;
export type AppliedQuery = DeepReadonly<EffectiveQueryV1>;

export interface DraftRange {
  enabled: boolean;
  max: string;
  min: string;
}

export interface QueryDraft {
  collectionStatuses: CollectionStatusV1[];
  collectionUpdatedAt: DraftRange;
  globalScore: DraftRange;
  includeNSFW: boolean;
  mergeSeries: boolean;
  negativeTags: {
    enabled: boolean;
    values: string[];
  };
  personalScore: DraftRange;
  positionKeys: PositionKey[];
  positiveTags: {
    enabled: boolean;
    values: string[];
  };
  ratingCount: DraftRange;
  scope: QueryScope;
  scoreDifference: DraftRange;
  subjectDate: DraftRange;
  subjectType: SubjectType;
  uid: string;
}

export type QueryField =
  | 'collectionStatuses'
  | 'collectionUpdatedAt'
  | 'globalScore'
  | 'mergeSeries'
  | 'personalScore'
  | 'positionKeys'
  | 'ratingCount'
  | 'scoreDifference'
  | 'subjectDate'
  | 'subjectType'
  | 'tags'
  | 'uid';

export type QueryFieldErrors = Readonly<Partial<Record<QueryField, string>>>;

export interface QueryValidationResult {
  readonly errors: QueryFieldErrors;
  readonly query: AppliedQuery | null;
}

const emptyRange = (): DraftRange => ({
  enabled: false,
  max: '',
  min: '',
});

export function createDefaultDraft(uid = ''): QueryDraft {
  return {
    collectionStatuses: ['completed', 'in_progress'],
    collectionUpdatedAt: emptyRange(),
    globalScore: emptyRange(),
    includeNSFW: false,
    mergeSeries: false,
    negativeTags: {
      enabled: false,
      values: [],
    },
    personalScore: emptyRange(),
    positionKeys: [],
    positiveTags: {
      enabled: false,
      values: [],
    },
    ratingCount: emptyRange(),
    scope: 'personal',
    scoreDifference: emptyRange(),
    subjectDate: emptyRange(),
    subjectType: 'anime',
    uid,
  };
}

export function cloneDraft(draft: QueryDraft): QueryDraft {
  return structuredClone(draft);
}

const collectionStatusOrder: readonly CollectionStatusV1[] = [
  'completed',
  'in_progress',
  'on_hold',
  'dropped',
];
const textEncoder = new TextEncoder();

function scalarCompare(left: string, right: string): number {
  const leftScalars = [...left].map((value) => value.codePointAt(0)!);
  const rightScalars = [...right].map((value) => value.codePointAt(0)!);
  for (
    let index = 0;
    index < Math.min(leftScalars.length, rightScalars.length);
    index += 1
  ) {
    const difference = leftScalars[index]! - rightScalars[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return leftScalars.length - rightScalars.length;
}

function sequenceCompare(left: readonly string[], right: readonly string[]): number {
  for (
    let index = 0;
    index < Math.min(left.length, right.length);
    index += 1
  ) {
    const difference = scalarCompare(left[index]!, right[index]!);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

function trimV1(value: string): string {
  const scalars = [...value];
  const isBoundaryWhitespace = (scalar: string): boolean => {
    const codePoint = scalar.codePointAt(0)!;
    return (
      (codePoint >= 0x0009 && codePoint <= 0x000d) ||
      codePoint === 0x0020 ||
      codePoint === 0x0085 ||
      codePoint === 0x00a0 ||
      codePoint === 0x1680 ||
      (codePoint >= 0x2000 && codePoint <= 0x200a) ||
      codePoint === 0x2028 ||
      codePoint === 0x2029 ||
      codePoint === 0x202f ||
      codePoint === 0x205f ||
      codePoint === 0x3000
    );
  };
  let start = 0;
  let end = scalars.length;
  while (start < end && isBoundaryWhitespace(scalars[start]!)) {
    start += 1;
  }
  while (end > start && isBoundaryWhitespace(scalars[end - 1]!)) {
    end -= 1;
  }
  return scalars.slice(start, end).join('');
}

function hasLoneSurrogate(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        return true;
      }
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function isAssigned15_1(codePoint: number): boolean {
  let low = 0;
  let high = assignedRanges15_1.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = assignedRanges15_1[middle]!;
    if (codePoint < range[0]) {
      high = middle - 1;
    } else if (codePoint > range[1]) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

function fullCaseFold15_1(value: string): string {
  return [...value]
    .map((scalar) => caseFold15_1.get(scalar.codePointAt(0)!) ?? scalar)
    .join('');
}

function normalizeTagToken(value: string): string | null {
  if (hasLoneSurrogate(value) || [...value].length > 256) {
    return null;
  }
  const trimmed = trimV1(value);
  if (
    trimmed.length === 0 ||
    [...trimmed].some((scalar) => !isAssigned15_1(scalar.codePointAt(0)!))
  ) {
    return null;
  }
  const normalized = fullCaseFold15_1(trimmed.normalize('NFKC'));
  if (
    normalized.length === 0 ||
    [...normalized].length > 256 ||
    textEncoder.encode(normalized).byteLength > 256
  ) {
    return null;
  }
  return normalized;
}

export function normalizeQueryTagV1(value: string): string | null {
  return normalizeTagToken(value);
}

export function trimQueryTextV1(value: string): string {
  return trimV1(value);
}

interface NormalizedTagGroups {
  readonly error: string | null;
  readonly groups: readonly string[][];
  readonly tokenCount: number;
}

function normalizeTagGroups(
  values: readonly string[],
  separator: '/' | '+',
): NormalizedTagGroups {
  if (values.length === 0 || values.length > 32) {
    return {
      error: '标签组数量必须在 1 到 32 之间',
      groups: [],
      tokenCount: 0,
    };
  }
  const groups: string[][] = [];
  let tokenCount = 0;
  for (const value of values) {
    const rawTokens = value.split(separator);
    if (rawTokens.length === 0 || rawTokens.length > 16) {
      return {
        error: '每个标签组必须包含 1 到 16 个标签',
        groups: [],
        tokenCount: 0,
      };
    }
    const tokens: string[] = [];
    const seenTokens = new Set<string>();
    for (const rawToken of rawTokens) {
      const token = normalizeTagToken(rawToken);
      if (token === null) {
        return {
          error: '标签包含空值、无效字符或超过 256 字节',
          groups: [],
          tokenCount: 0,
        };
      }
      if (!seenTokens.has(token)) {
        seenTokens.add(token);
        tokens.push(token);
      }
    }
    tokens.sort(scalarCompare);
    tokenCount += tokens.length;
    groups.push(tokens);
  }
  groups.sort(sequenceCompare);
  const uniqueGroups = groups.filter(
    (group, index) =>
      index === 0 || sequenceCompare(groups[index - 1]!, group) !== 0,
  );
  return {
    error: null,
    groups: uniqueGroups,
    tokenCount,
  };
}

function normalizeUid(value: string): string | null {
  const uid = trimV1(value);
  if (
    uid.length === 0 ||
    hasLoneSurrogate(uid) ||
    [...uid].length > 256 ||
    textEncoder.encode(uid).byteLength > 256
  ) {
    return null;
  }
  for (const scalar of uid) {
    const codePoint = scalar.codePointAt(0)!;
    if (
      codePoint === 0 ||
      codePoint <= 0x1f ||
      (codePoint >= 0x7f && codePoint <= 0x9f)
    ) {
      return null;
    }
  }
  return uid;
}

function normalizedCollectionStatuses(
  values: readonly CollectionStatusV1[],
): CollectionStatusV1[] | null {
  if (
    values.length === 0 ||
    values.length > 16 ||
    values.some((value) => !collectionStatusOrder.includes(value))
  ) {
    return null;
  }
  const selected = new Set(values);
  return collectionStatusOrder.filter((status) => selected.has(status));
}

function range(
  value: DraftRange,
  options: {
    integer?: boolean;
    maximum: number;
    minimum: number;
  },
  field: QueryField,
  errors: Partial<Record<QueryField, string>>,
): { max?: number; min?: number } | undefined {
  if (!value.enabled) {
    return undefined;
  }
  const result: { max?: number; min?: number } = {};
  for (const bound of ['min', 'max'] as const) {
    const raw = value[bound].trim();
    if (raw.length === 0) {
      continue;
    }
    const number = Number(raw);
    if (
      !Number.isFinite(number) ||
      number < options.minimum ||
      number > options.maximum ||
      (options.integer === true && !Number.isSafeInteger(number))
    ) {
      errors[field] = '范围数值无效';
      return undefined;
    }
    result[bound] = number;
  }
  if (Object.keys(result).length === 0) {
    errors[field] = '已启用的范围需要至少填写一个边界';
    return undefined;
  }
  if (
    result.min !== undefined &&
    result.max !== undefined &&
    result.min > result.max
  ) {
    errors[field] = '最低值不能高于最高值';
    return undefined;
  }
  return result;
}

function monthRange(
  value: DraftRange,
  field: QueryField,
  errors: Partial<Record<QueryField, string>>,
): { max?: string; min?: string } | undefined {
  if (!value.enabled) {
    return undefined;
  }
  const pattern = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
  const result: { max?: string; min?: string } = {};
  for (const bound of ['min', 'max'] as const) {
    const raw = value[bound].trim();
    if (raw.length === 0) {
      continue;
    }
    if (!pattern.test(raw)) {
      errors[field] = '月份格式应为 YYYY-MM';
      return undefined;
    }
    result[bound] = raw;
  }
  if (Object.keys(result).length === 0) {
    errors[field] = '已启用的范围需要至少填写一个边界';
    return undefined;
  }
  if (
    result.min !== undefined &&
    result.max !== undefined &&
    result.min > result.max
  ) {
    errors[field] = '起始月份不能晚于结束月份';
    return undefined;
  }
  return result;
}

function orderedPositionKeys(values: readonly PositionKey[]): PositionKey[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function catalogOperation(mode: QueryMode): CatalogOperation {
  return mode === 'ranking' ? 'rankings' : 'candidates';
}

export function validateDraft(
  draft: QueryDraft,
  mode: QueryMode,
  catalog: CatalogSnapshot | null,
): QueryValidationResult {
  const errors: Partial<Record<QueryField, string>> = {};
  const positionKeys = orderedPositionKeys(draft.positionKeys);
  const uid = draft.scope === 'personal' ? normalizeUid(draft.uid) : null;
  const collectionStatuses =
    draft.scope === 'personal'
      ? normalizedCollectionStatuses(draft.collectionStatuses)
      : null;

  if (draft.scope === 'personal' && uid === null) {
    errors.uid = 'UID 不能为空、包含控制字符或超过 256 字节';
  }
  if (draft.scope === 'personal' && collectionStatuses === null) {
    errors.collectionStatuses = '至少选择一种有效收藏类型';
  }
  if (positionKeys.length === 0) {
    errors.positionKeys = '至少选择一个职位';
  } else if (!catalog) {
    errors.positionKeys = '职位目录尚未就绪';
  } else {
    const exclusiveGroups = new Set<string>();
    for (const key of positionKeys) {
      const position = catalog.positionsByKey.get(key);
      if (
        !position ||
        !position.selectable ||
        position.subjectType !== draft.subjectType ||
        !position.capabilities.includes(catalogOperation(mode))
      ) {
        errors.positionKeys = '所选职位不适用于当前查询';
        break;
      }
      if (
        position.exclusiveGroup &&
        exclusiveGroups.has(position.exclusiveGroup)
      ) {
        errors.positionKeys = '互斥职位不能同时选择';
        break;
      }
      if (position.exclusiveGroup) {
        exclusiveGroups.add(position.exclusiveGroup);
      }
    }
  }
  const operation = catalogOperation(mode);
  const mergeSeriesSupported =
    draft.subjectType === 'anime' &&
    catalog?.filterCapabilities.some(
      (capability) =>
        capability.field === 'mergeSeries' &&
        capability.scopes.includes(draft.scope) &&
        capability.subjectTypes.includes(draft.subjectType) &&
        capability.applications.some(
          (application) => application.operation === operation,
        ),
    ) === true;
  if (draft.mergeSeries && !mergeSeriesSupported) {
    errors.mergeSeries = '当前条目类型或查询模式不支持合并续作';
  }

  const subjectDate = monthRange(draft.subjectDate, 'subjectDate', errors);
  const globalScore = range(
    draft.globalScore,
    { maximum: 10, minimum: 0 },
    'globalScore',
    errors,
  );
  const ratingCount = range(
    draft.ratingCount,
    { integer: true, maximum: Number.MAX_SAFE_INTEGER, minimum: 0 },
    'ratingCount',
    errors,
  );
  const collectionUpdatedAt =
    draft.scope === 'personal'
      ? monthRange(
          draft.collectionUpdatedAt,
          'collectionUpdatedAt',
          errors,
        )
      : undefined;
  const personalScore =
    draft.scope === 'personal'
      ? range(
          draft.personalScore,
          { maximum: 10, minimum: 0 },
          'personalScore',
          errors,
        )
      : undefined;
  const scoreDifference =
    draft.scope === 'personal'
      ? range(
          draft.scoreDifference,
          { maximum: 10, minimum: -10 },
          'scoreDifference',
          errors,
        )
      : undefined;
  const positiveTags = draft.positiveTags.enabled
    ? normalizeTagGroups(draft.positiveTags.values, '/')
    : { error: null, groups: [], tokenCount: 0 };
  const negativeTags = draft.negativeTags.enabled
    ? normalizeTagGroups(draft.negativeTags.values, '+')
    : { error: null, groups: [], tokenCount: 0 };
  if (positiveTags.error) {
    errors.tags = positiveTags.error;
  }
  if (negativeTags.error) {
    errors.tags = negativeTags.error;
  }
  if (positiveTags.tokenCount + negativeTags.tokenCount > 256) {
    errors.tags = '标准化后的标签总数不能超过 256 个';
  }

  if (Object.keys(errors).length > 0) {
    return {
      errors: Object.freeze(errors),
      query: null,
    };
  }

  const tags =
    positiveTags.groups.length > 0 || negativeTags.groups.length > 0
      ? {
          ...(positiveTags.groups.length > 0
            ? {
                include: positiveTags.groups.map((tokens) => ({
                  anyOf: [...tokens],
                })),
              }
            : {}),
          ...(negativeTags.groups.length > 0
            ? {
                exclude: negativeTags.groups.map((tokens) => ({
                  allOf: [...tokens],
                })),
              }
            : {}),
        }
      : undefined;
  const commonFilters = {
    ...(subjectDate ? { subjectDate } : {}),
    ...(globalScore ? { globalScore } : {}),
    ...(ratingCount ? { ratingCount } : {}),
    ...(tags ? { tags } : {}),
  };
  const filters =
    draft.scope === 'personal'
      ? {
          ...commonFilters,
          ...(collectionUpdatedAt ? { collectionUpdatedAt } : {}),
          ...(personalScore ? { personalScore } : {}),
          ...(scoreDifference ? { scoreDifference } : {}),
        }
      : commonFilters;
  const shared: SharedQueryV1 =
    draft.scope === 'personal'
      ? {
          scope: 'personal',
          uid: uid!,
          collectionStatuses: collectionStatuses!,
          subjectType: draft.subjectType as SubjectTypeV1,
          positionKeys,
          includeNSFW: draft.includeNSFW,
          mergeSeries: draft.mergeSeries,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        }
      : {
          scope: 'global',
          subjectType: draft.subjectType as SubjectTypeV1,
          positionKeys,
          includeNSFW: draft.includeNSFW,
          mergeSeries: draft.mergeSeries,
          ...(Object.keys(filters).length > 0 ? { filters } : {}),
        };

  decodeSharedQuery(shared);
  const effective = decodeEffectiveQuery(structuredClone(shared));
  return {
    errors: Object.freeze({}),
    query: Object.freeze(structuredClone(effective)),
  };
}

export function querySignature(query: AppliedQuery): string {
  return JSON.stringify(query);
}

function isCanonicalTokenGroups(
  groups: readonly (readonly string[])[] | undefined,
): { canonical: boolean; tokenCount: number } {
  if (!groups) {
    return { canonical: true, tokenCount: 0 };
  }
  if (groups.length === 0 || groups.length > 32) {
    return { canonical: false, tokenCount: 0 };
  }
  let tokenCount = 0;
  for (const [groupIndex, group] of groups.entries()) {
    if (group.length === 0 || group.length > 16) {
      return { canonical: false, tokenCount: 0 };
    }
    tokenCount += group.length;
    for (const [tokenIndex, token] of group.entries()) {
      if (
        normalizeTagToken(token) !== token ||
        (tokenIndex > 0 &&
          scalarCompare(group[tokenIndex - 1]!, token) >= 0)
      ) {
        return { canonical: false, tokenCount: 0 };
      }
    }
    if (
      groupIndex > 0 &&
      sequenceCompare(groups[groupIndex - 1]!, group) >= 0
    ) {
      return { canonical: false, tokenCount: 0 };
    }
  }
  return { canonical: true, tokenCount };
}

export function isCanonicalAppliedQuery(query: AppliedQuery): boolean {
  if (
    new Set(query.positionKeys).size !== query.positionKeys.length ||
    (query.mergeSeries && query.subjectType !== 'anime')
  ) {
    return false;
  }
  if (query.scope === 'personal') {
    if (
      normalizeUid(query.uid) !== query.uid ||
      JSON.stringify(normalizedCollectionStatuses(query.collectionStatuses)) !==
        JSON.stringify(query.collectionStatuses)
    ) {
      return false;
    }
  }
  const include = isCanonicalTokenGroups(
    query.filters?.tags?.include?.map((group) => group.anyOf),
  );
  const exclude = isCanonicalTokenGroups(
    query.filters?.tags?.exclude?.map((group) => group.allOf),
  );
  return (
    include.canonical &&
    exclude.canonical &&
    include.tokenCount + exclude.tokenCount <= 256
  );
}

export function draftSemanticSignature(draft: QueryDraft): string {
  const canonicalNumeric = (value: string): string => {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return '';
    }
    const number = Number(trimmed);
    return Number.isFinite(number) ? String(number) : trimmed;
  };
  const numericRangeProjection = (value: DraftRange) =>
    value.enabled
      ? {
          min: canonicalNumeric(value.min),
          max: canonicalNumeric(value.max),
        }
      : null;
  const common = {
    scope: draft.scope,
    subjectType: draft.subjectType,
    positionKeys: orderedPositionKeys(draft.positionKeys),
    includeNSFW: draft.includeNSFW,
    mergeSeries: draft.mergeSeries,
    subjectDate: draft.subjectDate.enabled
      ? {
          min: draft.subjectDate.min.trim(),
          max: draft.subjectDate.max.trim(),
        }
      : null,
    globalScore: numericRangeProjection(draft.globalScore),
    ratingCount: numericRangeProjection(draft.ratingCount),
    positiveTags: draft.positiveTags.enabled
      ? normalizeTagGroups(draft.positiveTags.values, '/').groups
      : null,
    negativeTags: draft.negativeTags.enabled
      ? normalizeTagGroups(draft.negativeTags.values, '+').groups
      : null,
  };
  return JSON.stringify(
    draft.scope === 'global'
      ? common
      : {
          ...common,
          uid: normalizeUid(draft.uid) ?? trimV1(draft.uid),
          collectionStatuses:
            normalizedCollectionStatuses(draft.collectionStatuses) ??
            [...draft.collectionStatuses],
          collectionUpdatedAt: draft.collectionUpdatedAt.enabled
            ? {
                min: draft.collectionUpdatedAt.min.trim(),
                max: draft.collectionUpdatedAt.max.trim(),
              }
            : null,
          personalScore: numericRangeProjection(draft.personalScore),
          scoreDifference: numericRangeProjection(draft.scoreDifference),
        },
  );
}

export function draftFromEffective(
  query: AppliedQuery,
): QueryDraft {
  const draft = createDefaultDraft(query.scope === 'personal' ? query.uid : '');
  draft.scope = query.scope;
  draft.subjectType = query.subjectType;
  draft.positionKeys = [...query.positionKeys] as string[];
  draft.includeNSFW = query.includeNSFW;
  draft.mergeSeries = query.mergeSeries;
  if (query.scope === 'personal') {
    draft.collectionStatuses = [...query.collectionStatuses];
  }
  const filters = query.filters;
  if (!filters) {
    return draft;
  }
  const assignRange = (
    target: DraftRange,
    value: { max?: number | string; min?: number | string } | undefined,
  ) => {
    if (!value) {
      return;
    }
    target.enabled = true;
    target.min = value.min === undefined ? '' : String(value.min);
    target.max = value.max === undefined ? '' : String(value.max);
  };
  assignRange(draft.subjectDate, filters.subjectDate);
  assignRange(draft.globalScore, filters.globalScore);
  assignRange(draft.ratingCount, filters.ratingCount);
  if (query.scope === 'personal') {
    const personalFilters = query.filters;
    assignRange(
      draft.collectionUpdatedAt,
      personalFilters?.collectionUpdatedAt,
    );
    assignRange(draft.personalScore, personalFilters?.personalScore);
    assignRange(draft.scoreDifference, personalFilters?.scoreDifference);
  }
  if (filters.tags?.include) {
    draft.positiveTags.enabled = true;
    draft.positiveTags.values = filters.tags.include.map((group) =>
      group.anyOf.join('/'),
    );
  }
  if (filters.tags?.exclude) {
    draft.negativeTags.enabled = true;
    draft.negativeTags.values = filters.tags.exclude.map((group) =>
      group.allOf.join('+'),
    );
  }
  return draft;
}

export function summarizeQuery(
  query: AppliedQuery,
  catalog: CatalogSnapshot | null,
): readonly string[] {
  const positions = query.positionKeys.map(
    (key) => catalog?.positionsByKey.get(String(key))?.label ?? String(key),
  );
  const subjectLabel =
    catalog?.subjectTypes.find((subject) => subject.key === query.subjectType)
      ?.label ?? query.subjectType;
  const parts = [
    positions.join(' + ') || '未选择职位',
    query.scope === 'personal' ? query.uid : '全站数据',
    subjectLabel,
  ];
  if (query.scope === 'personal') {
    parts.push(
      query.collectionStatuses
        .map(
          (status) =>
            ({
              completed: '已完成',
              dropped: '抛弃',
              in_progress: '进行中',
              on_hold: '搁置',
            })[status],
        )
        .join(' + '),
    );
  }
  if (query.includeNSFW) {
    parts.push('含 NSFW');
  }
  if (query.mergeSeries) {
    parts.push('合并续作');
  }
  const summarizeRange = (
    label: string,
    value: { max?: number | string; min?: number | string },
  ) => {
    const bounds =
      value.min !== undefined && value.max !== undefined
        ? `${value.min}–${value.max}`
        : value.min !== undefined
          ? `≥ ${value.min}`
          : `≤ ${String(value.max)}`;
    return `${label} ${bounds}`;
  };
  const filters = query.filters;
  if (filters?.subjectDate) {
    parts.push(summarizeRange('播出时间', filters.subjectDate));
  }
  if (query.scope === 'personal') {
    const personalFilters = query.filters;
    if (personalFilters?.collectionUpdatedAt) {
      parts.push(
        summarizeRange('收藏时间', personalFilters.collectionUpdatedAt),
      );
    }
    if (personalFilters?.personalScore) {
      parts.push(summarizeRange('我的评分', personalFilters.personalScore));
    }
    if (personalFilters?.scoreDifference) {
      parts.push(
        summarizeRange(
          '我的评分与全站评分差',
          personalFilters.scoreDifference,
        ),
      );
    }
  }
  if (filters?.globalScore) {
    parts.push(
      summarizeRange(
        query.scope === 'global' ? '评分' : '全站评分',
        filters.globalScore,
      ),
    );
  }
  if (filters?.ratingCount) {
    parts.push(summarizeRange('评分人数', filters.ratingCount));
  }
  if (filters?.tags?.include) {
    parts.push(
      `正向标签 ${filters.tags.include
        .map((group) => group.anyOf.join('/'))
        .join('、')}`,
    );
  }
  if (filters?.tags?.exclude) {
    parts.push(
      `反向标签 ${filters.tags.exclude
        .map((group) => group.allOf.join('+'))
        .join('、')}`,
    );
  }
  return Object.freeze(parts);
}

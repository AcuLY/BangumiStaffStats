import { toPublicApiReference } from '../navigation/basePath';

export type BangumiImageResource = 'characters' | 'persons' | 'subjects';
export type BangumiImageType =
  | 'common'
  | 'grid'
  | 'large'
  | 'medium'
  | 'small';

const smallSourceWidth = 100;
const mediumSourceWidth = 400;

function positiveEntityId(value: number): number | null {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function proxyReference(
  resource: BangumiImageResource,
  entityId: number,
  type: BangumiImageType,
): string {
  return toPublicApiReference(
    `/api/v1/images/bangumi/${resource}/${entityId}?type=${type}`,
  );
}

function imageCandidates(
  resource: BangumiImageResource,
  entityReference: number,
  cssWidth: number,
  devicePixelRatio = 1,
): readonly string[] {
  const entityId = positiveEntityId(entityReference);
  if (entityId === null || !Number.isFinite(cssWidth) || cssWidth <= 0) {
    return Object.freeze([]);
  }

  const targetWidth = cssWidth * Math.max(1, devicePixelRatio);
  const types: readonly BangumiImageType[] =
    targetWidth <= smallSourceWidth
      ? ['small', 'medium', 'large']
      : targetWidth <= mediumSourceWidth
        ? ['medium', 'large', 'small']
        : ['large', 'medium', 'small'];

  return Object.freeze(
    types.map((type) => proxyReference(resource, entityId, type)),
  );
}

/**
 * Image sizes are selected from the upstream's fixed 100px and 400px resize
 * variants. The original image is only the final fallback.
 */
export function personImageCandidates(
  personId: number,
  cssWidth: number,
  devicePixelRatio = 1,
): readonly string[] {
  return imageCandidates('persons', personId, cssWidth, devicePixelRatio);
}

export function subjectImageCandidates(
  subjectId: number,
  cssWidth: number,
  devicePixelRatio = 1,
): readonly string[] {
  return imageCandidates('subjects', subjectId, cssWidth, devicePixelRatio);
}

export function characterImageCandidates(
  characterId: number | undefined,
  cssWidth: number,
  devicePixelRatio = 1,
): readonly string[] {
  return imageCandidates(
    'characters',
    characterId ?? 0,
    cssWidth,
    devicePixelRatio,
  );
}

import type {
  CoStarShareWorkspaceV1,
  RankingShareWorkspaceV1,
  SharePayloadV1,
} from '../../api/generated/query-wire/types.gen';
import {
  decodeShareEnvelope,
  decodeSharePayload,
  type SharePath,
} from '../../api/adapters/queryWire';
import {
  isCanonicalAppliedQuery,
  type AppliedQuery,
} from './model';

export type ShareWorkspace =
  | Readonly<CoStarShareWorkspaceV1>
  | Readonly<RankingShareWorkspaceV1>;
export type SharePayload = Readonly<SharePayloadV1>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Share payload contains a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .filter((key) => object[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  throw new TypeError('Share payload contains an unsupported value');
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

function containsLoneSurrogate(value: unknown): boolean {
  if (typeof value === 'string') {
    return hasLoneSurrogate(value);
  }
  if (Array.isArray(value)) {
    return value.some(containsLoneSurrogate);
  }
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).some(
      ([key, child]) => hasLoneSurrogate(key) || containsLoneSurrogate(child),
    );
  }
  return false;
}

function validIdentity(
  positionKeys: readonly unknown[],
  queryKeys: ReadonlySet<unknown>,
): boolean {
  return (
    positionKeys.length > 0 &&
    new Set(positionKeys).size === positionKeys.length &&
    positionKeys.every((key) => queryKeys.has(key))
  );
}

function assertShareSemantics(payload: SharePayload): void {
  if (
    containsLoneSurrogate(payload) ||
    !isCanonicalAppliedQuery(payload.query)
  ) {
    throw new Error('Share payload is not canonical');
  }
  const queryKeys = new Set(payload.query.positionKeys);
  if (payload.workspace.kind === 'ranking') {
    const detailSection =
      payload.workspace.detail?.view.section ?? 'works';
    const detailSort =
      payload.workspace.detail?.view.sort ??
      (detailSection === 'characters' ? 'role' : 'globalScore');
    const detailSortIsValid =
      payload.workspace.detail === undefined ||
      (detailSection === 'characters'
        ? ['role', 'workCount', 'name'].includes(detailSort)
        : detailSort === 'globalScore' ||
          (payload.query.scope === 'personal' &&
            (detailSort === 'personalScore' ||
              detailSort === 'collectionUpdatedAt')) ||
          (payload.query.mergeSeries === true &&
            detailSort === 'seriesSize'));
    if (
      (payload.query.scope === 'global' &&
        payload.workspace.rankingsView.sort === 'preference') ||
      !detailSortIsValid
    ) {
      throw new Error('Ranking view is incompatible with the applied query');
    }
    return;
  }
  const workspace = payload.workspace;
  if (!queryKeys.has(workspace.candidates.input.positionKey)) {
    throw new Error('Candidate position is outside the applied query');
  }
  if (
    payload.query.scope === 'global' &&
    workspace.candidates.view.sort === 'globalAverage'
  ) {
    throw new Error('Candidate view is incompatible with the applied query');
  }
  if (workspace.state === 'partners') {
    if (
      workspace.partners.input.source.positionKeys.length > 20 ||
      !validIdentity(
        workspace.partners.input.source.positionKeys,
        queryKeys,
      ) ||
      (workspace.partners.input.candidatePositionKey !== undefined &&
        !queryKeys.has(workspace.partners.input.candidatePositionKey))
    ) {
      throw new Error('Partner identity is outside the applied query');
    }
    if (
      payload.query.scope === 'global' &&
      workspace.partners.view.sort === 'preference'
    ) {
      throw new Error('Partners view is incompatible with the applied query');
    }
    return;
  }
  if (workspace.state === 'analysis') {
    const people = new Set<number>();
    let identityCount = 0;
    for (const participant of workspace.coStar.input.participants) {
      if (
        people.has(participant.personId) ||
        !validIdentity(participant.positionKeys, queryKeys)
      ) {
        throw new Error('Co-star identity is invalid');
      }
      people.add(participant.personId);
      identityCount += participant.positionKeys.length;
    }
    if (
      workspace.coStar.input.participants.length < 2 ||
      workspace.coStar.input.participants.length > 10 ||
      identityCount > 20
    ) {
      throw new Error('Co-star identity limit is exceeded');
    }
    if (
      (payload.query.scope === 'global' &&
        (workspace.coStar.view.sort === 'personalScore' ||
          workspace.coStar.view.sort === 'collectionUpdatedAt')) ||
      (payload.query.mergeSeries !== true &&
        workspace.coStar.view.sort === 'seriesSize')
    ) {
      throw new Error('Co-star view is incompatible with the applied query');
    }
  }
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function createShareFragment(
  path: SharePath,
  query: AppliedQuery,
  workspace: ShareWorkspace,
): string {
  const payload = decodeSharePayload(
    structuredClone({
      query,
      workspace,
    }),
  );
  assertShareSemantics(payload);
  const expectedKind = path === '/ranking' ? 'ranking' : 'co-star';
  if (payload.workspace.kind !== expectedKind) {
    throw new Error('Share workspace does not match its route');
  }
  const bytes = new TextEncoder().encode(canonicalJson(payload));
  return `#q=v1.${encodeBase64Url(bytes)}`;
}

export function createShareUrl(
  current: URL,
  path: SharePath,
  query: AppliedQuery,
  workspace: ShareWorkspace,
): string {
  const url = new URL(current);
  url.pathname = path;
  url.hash = createShareFragment(path, query, workspace);
  return url.toString();
}

export function readShare(
  path: SharePath,
  fragment: string,
): SharePayload {
  const payload = decodeShareEnvelope(path, fragment).payload;
  assertShareSemantics(payload);
  if (createShareFragment(path, payload.query, payload.workspace) !== fragment) {
    throw new Error('Share payload is not encoded canonically');
  }
  return payload;
}

export async function copyShareUrl(
  value: string,
  clipboard: Pick<Clipboard, 'writeText'> | undefined,
): Promise<'copied' | 'fallback'> {
  if (!clipboard) {
    return 'fallback';
  }
  try {
    await clipboard.writeText(value);
    return 'copied';
  } catch {
    return 'fallback';
  }
}

import type {
  CandidatesInputV1, CandidatesViewV1, CoStarInputV1, CoStarViewV1,
  PartnersInputV1, PartnersViewV1, PersonDetailInputV1, PersonDetailViewV1,
  RankingsViewV1,
} from '../../api/generated/query-wire/types.gen';
import {
  decodeEffectiveQueryForOperation, decodeRankingsView, decodeCandidatesInput,
  decodeCandidatesView, decodePartnersInput, decodePartnersView,
  decodeCoStarInput, decodeCoStarView, decodePersonDetailInput,
  decodePersonDetailView,
} from '../../api/adapters/queryWire';
import { isCanonicalAppliedQuery, type AppliedQuery } from './model';

export type RecoveryPath = '/ranking' | '/co-star';
type OperationState<I, V> = Readonly<{ input: Readonly<I>; view: Readonly<V> }>;
type CandidatesState = OperationState<CandidatesInputV1, CandidatesViewV1>;
export type RecoveryWorkspace =
  | Readonly<{ kind: 'ranking'; rankingsView: Readonly<RankingsViewV1>;
      detail?: OperationState<PersonDetailInputV1, PersonDetailViewV1> }>
  | Readonly<{ kind: 'co-star'; state: 'empty'; candidates: CandidatesState }>
  | Readonly<{ kind: 'co-star'; state: 'partners'; candidates: CandidatesState;
      partners: OperationState<PartnersInputV1, PartnersViewV1> }>
  | Readonly<{ kind: 'co-star'; state: 'analysis'; candidates: CandidatesState;
      coStar: OperationState<CoStarInputV1, CoStarViewV1> }>;
export type RecoveryPayload = Readonly<{ query: AppliedQuery; workspace: RecoveryWorkspace }>;

function record(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('Recovery state must be an object');
  }
  const result = value as Record<string, unknown>;
  if (required.some((key) => !Object.hasOwn(result, key)) ||
      Object.keys(result).some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new TypeError('Recovery state has an unsupported shape');
  }
  return result;
}

function operation<I,V>(value: unknown, input: (value: unknown) => I, view: (value: unknown) => V): Readonly<{input:I;view:V}> {
  const state = record(value, ['input', 'view']);
  return { input: input(state.input), view: view(state.view) };
}

// This is a local browser storage format, composed from existing operation contracts.
export function decodeRecoveryPayload(path: RecoveryPath, value: unknown): RecoveryPayload {
  const payload = record(value, ['query', 'workspace']);
  const base = record(payload.workspace, ['kind'], ['rankingsView', 'detail', 'state', 'candidates', 'partners', 'coStar']);
  let workspace: RecoveryWorkspace;
  if (base.kind === 'ranking' && path === '/ranking') {
    const state = record(base, ['kind', 'rankingsView'], ['detail']);
    workspace = {
      kind: 'ranking', rankingsView: decodeRankingsView(state.rankingsView),
      ...(state.detail !== undefined ? { detail: operation(state.detail, decodePersonDetailInput, decodePersonDetailView) } : {}),
    };
  } else if (base.kind === 'co-star' && path === '/co-star') {
    const field = base.state === 'empty' ? null : base.state === 'partners' ? 'partners' : base.state === 'analysis' ? 'coStar' : undefined;
    if (field === undefined) throw new TypeError('Unknown recovery topology');
    const state = record(base, ['kind', 'state', 'candidates', ...(field ? [field] : [])]);
    const candidates = operation(state.candidates, decodeCandidatesInput, decodeCandidatesView);
    if (base.state === 'empty') workspace = { kind: 'co-star', state: 'empty', candidates };
    else if (base.state === 'partners') workspace = { kind: 'co-star', state: 'partners', candidates,
      partners: operation(state.partners, decodePartnersInput, decodePartnersView) };
    else workspace = { kind: 'co-star', state: 'analysis', candidates,
      coStar: operation(state.coStar, decodeCoStarInput, decodeCoStarView) };
  } else throw new TypeError('Recovery workspace does not match its route');
  const query = decodeEffectiveQueryForOperation(
    payload.query,
    workspace.kind === 'co-star' ? workspace.candidates.input.positionScope : 'query',
  );
  const result = { query, workspace };
  assertRecoverySemantics(result);
  return result;
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
  operationScope?: 'query' | 'all',
  queryPositionScope?: 'all',
): boolean {
  // Recovery preserves intent; the coordinator revalidates current facts.
  return (
    positionKeys.length > 0 &&
    new Set(positionKeys).size === positionKeys.length &&
    positionKeys.every((key) => queryPositionScope === 'all' || operationScope === 'all' || queryKeys.has(key))
  );
}

function assertRecoverySemantics(payload: RecoveryPayload): void {
  if (
    containsLoneSurrogate(payload) ||
    !isCanonicalAppliedQuery(payload.query,
      payload.workspace.kind === 'co-star'
        ? payload.workspace.candidates.input.positionScope
        : 'query')
  ) {
    throw new Error('Recovery state is not canonical');
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
  const candidatePeople = new Set<number>();
  let candidateIdentityCount = 0;
  for (const participant of workspace.candidates.input.participants ?? []) {
    if (candidatePeople.has(participant.personId) || !validIdentity(participant.positionKeys, queryKeys, workspace.candidates.input.positionScope, payload.query.positionScope)) {
      throw new Error('Candidate participant identity is invalid');
    }
    candidatePeople.add(participant.personId);
    candidateIdentityCount += participant.positionKeys.length;
  }
  if (candidatePeople.size > 10 || candidateIdentityCount > 20) {
    throw new Error('Candidate participant identity limit is exceeded');
  }
  if (payload.query.positionScope !== 'all' && workspace.candidates.input.positionScope !== 'all' && workspace.candidates.input.positionKey !== null && !queryKeys.has(workspace.candidates.input.positionKey)) {
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
        workspace.partners.input.positionScope,
        payload.query.positionScope,
      ) ||
      (payload.query.positionScope !== 'all' && workspace.partners.input.positionScope !== 'all' && workspace.partners.input.candidatePositionKey !== undefined &&
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
        !validIdentity(participant.positionKeys, queryKeys, workspace.coStar.input.positionScope, payload.query.positionScope)
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

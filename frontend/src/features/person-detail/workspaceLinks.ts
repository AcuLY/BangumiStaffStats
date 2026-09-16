import { ref, shallowReactive, shallowRef } from 'vue';

import type { CandidatePayload } from '../../api/adapters/candidates';
import type { CoStarPayload } from '../../api/adapters/coStar';
import type { PartnersPayload } from '../../api/adapters/partners';
import type { PersonDetailPayload } from '../../api/adapters/personDetail';
import { decodePersonDetailInput, decodePositionKey } from '../../api/adapters/queryWire';
import { candidateErrorMessage, CandidatesApiError } from '../../api/candidates';
import type { RankingPayload } from '../../api/adapters/rankings';
import { personDetailErrorMessage, PersonDetailApiError } from '../../api/personDetail';
import { rankingErrorMessage, RankingsApiError } from '../../api/rankings';
import { operationPositionAllowed } from '../query/coordinator';
import type { CatalogSnapshot } from '../../api/adapters/catalog';
import type { OperationResource, QueryDrivers, RankingsViewState } from '../query/coordinator';
import { querySignature, type AppliedQuery } from '../query/model';
import { defaultPersonDetailView, type PersonDetailView } from './model';

export interface LinkedPerson {
  readonly id: number;
  readonly name: string;
  readonly nameCN: string | null;
}

type Drivers = QueryDrivers<RankingPayload, CandidatePayload, PersonDetailPayload, PartnersPayload, CoStarPayload>;
type PersonDetailInput = Parameters<NonNullable<Drivers['personDetail']>['execute']>[0]['input'];
type Location = NonNullable<RankingPayload['location']>;

/** Transient detail/lookup intents share API drivers, but never overwrite ranking resources. */
export function createPersonWorkspaceLinks(options: {
  drivers: Drivers;
  query: () => AppliedQuery | null;
  revision: () => number;
  snapshot: () => string | null;
  rankingView: () => Readonly<RankingsViewState>;
  getCatalog?: () => CatalogSnapshot | null;
}) {
  const person = shallowRef<LinkedPerson | null>(null);
  const positionKeys = shallowRef<readonly string[]>([]);
  const detail = shallowReactive<OperationResource<PersonDetailPayload, PersonDetailInput, PersonDetailView>>({
    acceptedQuery: null, error: null, feedback: null, input: { personId: 0 },
    payload: null, phase: 'idle', requestId: null, revision: 0,
    staleCollection: false, view: defaultPersonDetailView, viewPending: false,
  });
  const location = shallowRef<Location | null>(null);
  const rankPending = ref(false);
  const rankError = ref<string | null>(null);
  const rankingView = shallowRef<Readonly<RankingsViewState>>(options.rankingView());
  let generation = 0;
  let detailSequence = 0;
  let rankSequence = 0;
  let detailController: AbortController | null = null;
  let rankController: AbortController | null = null;
  const candidateLookupPending = ref(false);
  const candidateLookupError = ref<string | null>(null);
  let candidateController: AbortController | null = null;
  let candidateGeneration = 0;
  let candidateSequence = 0;

  function close(): void {
    cancelCandidateLookup();
    generation += 1;
    detailController?.abort();
    rankController?.abort();
    person.value = null;
    rankPending.value = false;
  }

  function admission(controller: AbortController, token: number, query: AppliedQuery, revision: number): boolean {
    return !controller.signal.aborted && generation === token && options.revision() === revision
      && options.query() !== null && querySignature(options.query()!) === querySignature(query);
  }

  function checkSnapshot(payload: PersonDetailPayload | RankingPayload, expected: string | null): void {
    if (options.snapshot() !== expected) throw new Error('查询结果已更新，重新打开人物详情后可查看');
    if (expected && !expected.startsWith('request:')
      && JSON.stringify([payload.dataVersion, payload.collection?.fetchedAt ?? null]) !== expected) {
      throw new Error('数据已更新，重新应用查询后可查看');
    }
  }

  async function loadDetail(view: Readonly<PersonDetailView> = defaultPersonDetailView): Promise<boolean> {
    const query = options.query();
    if (!query || !person.value) return false;
    detailController?.abort();
    const controller = new AbortController();
    detailController = controller;
    const token = generation;
    const revision = options.revision();
    const snapshot = options.snapshot();
    const sequence = ++detailSequence;
    const transactionId = `linked-detail-${sequence}`;
    const input = { positionScope: 'all' as const, personId: person.value.id, positionKeys: [...positionKeys.value] };
    const oldView = detail.view;
    const viewOnly = detail.phase === 'ready' && detail.payload?.person.id === input.personId;
    detail.error = null;
    detail.view = view;
    detail.viewPending = viewOnly;
    if (!viewOnly) detail.phase = 'pending';
    detail.input = input;
    detail.acceptedQuery = query;
    detail.revision = revision;
    try {
      if (!options.drivers.personDetail) throw new Error('人物详情服务不可用');
      const response = await options.drivers.personDetail.execute({ query, input, view, sequence, transactionId, signal: controller.signal });
      if (!admission(controller, token, query, revision) || detailController !== controller) return false;
      if (response.transactionId !== transactionId) throw new Error('人物详情响应不匹配');
      checkSnapshot(response.payload, snapshot);
      if (response.payload.person.id !== input.personId) throw new Error('人物详情响应不匹配');
      detail.payload = response.payload;
      detail.acceptedInput = input;
      detail.acceptedView = view;
      detail.requestId = response.requestId;
      detail.phase = 'ready';
      detail.staleCollection = response.staleCollection === true;
      detail.feedback = detail.staleCollection ? '当前显示最近一次可用收藏数据' : null;
      return true;
    } catch (error) {
      if (!admission(controller, token, query, revision) || detailController !== controller) return false;
      detail.error = error instanceof PersonDetailApiError ? personDetailErrorMessage(error.code)
        : error instanceof Error ? error.message : '人物详情暂时无法完成';
      detail.view = oldView;
      detail.phase = detail.payload ? 'ready' : 'error';
      return false;
    } finally {
      if (detailController === controller) detail.viewPending = false;
    }
  }

  async function loadRank(): Promise<boolean> {
    const query = options.query();
    if (!query || !person.value) return false;
    rankController?.abort();
    if (query.positionKeys.length === 0 && query.positionScope !== 'all') {
      rankController = null;
      rankPending.value = false;
      rankError.value = '选择排行职位后可定位人物';
      location.value = null;
      return false;
    }
    const controller = new AbortController();
    rankController = controller;
    const token = generation;
    const revision = options.revision();
    const snapshot = options.snapshot();
    const personId = person.value.id;
    const sequence = ++rankSequence;
    const transactionId = `linked-ranking-${sequence}`;
    rankPending.value = true;
    rankError.value = null;
    location.value = null;
    rankingView.value = { ...options.rankingView(), search: '', page: 1 };
    try {
      const response = await options.drivers.rankings.execute({
        query, input: {}, view: { ...rankingView.value, locatePersonId: personId },
        sequence, transactionId, signal: controller.signal,
      });
      if (!admission(controller, token, query, revision) || rankController !== controller) return false;
      if (response.transactionId !== transactionId) throw new Error('排行响应不匹配');
      checkSnapshot(response.payload, snapshot);
      if (response.payload.location?.personId !== personId) throw new Error('排行定位响应不匹配');
      location.value = response.payload.location;
      return true;
    } catch (error) {
      if (!admission(controller, token, query, revision) || rankController !== controller) return false;
      rankError.value = error instanceof RankingsApiError ? rankingErrorMessage(error.code)
        : error instanceof Error ? error.message : '排名暂时无法查询';
      return false;
    } finally {
      if (rankController === controller) rankPending.value = false;
    }
  }

  /** Call immediately on primary start, target/selection/mode change and unmount. */
  function cancelCandidateLookup(): void {
    candidateGeneration += 1;
    candidateController?.abort();
    candidateController = null;
    candidateLookupPending.value = false;
    candidateLookupError.value = null;
  }

  /**
   * Resolve one complete backend row, not a visible candidate view or an identity cache.
   * The caller supplies the current detail's numeric ID and full original name, and an
   * ownership predicate covering primary-start/target/selection/mode generations. The
   * caller must also cancel immediately on invalidation; this method never commits UI state.
   */
  async function lookupCandidateIdentities(
    target: LinkedPerson,
    isCurrent: () => boolean,
  ): Promise<readonly string[] | null> {
    cancelCandidateLookup();
    const query = options.query();
    if (!query || query.positionScope !== 'all' || query.positionKeys.length !== 0) return null;
    const controller = new AbortController();
    candidateController = controller;
    const token = candidateGeneration;
    const detailToken = generation;
    const signature = querySignature(query);
    const revision = options.revision();
    const snapshot = options.snapshot();
    const personId = target.id;
    const name = target.name;
    const ownsLookup = () => candidateController === controller && !controller.signal.aborted
      && candidateGeneration === token && generation === detailToken
      && options.revision() === revision && options.snapshot() === snapshot
      && options.query() !== null && querySignature(options.query()!) === signature
      && target.id === personId && target.name === name && isCurrent();
    try {
      if (!ownsLookup()) return null;
      decodePersonDetailInput({ personId });
      if (typeof name !== 'string') throw new Error('人物资料不完整，请重新打开详情');
      // Null and request-only fallback snapshots cannot establish response authority.
      const parts: unknown = snapshot === null ? null : JSON.parse(snapshot);
      if (!Array.isArray(parts) || parts.length !== 2 || typeof parts[0] !== 'string' || !parts[0]
        || (query.scope === 'global' ? parts[1] !== null : typeof parts[1] !== 'string' || !parts[1])) {
        throw new Error('查询快照不可用，请重新应用查询后重试');
      }
      const search = [...name].length <= 256 ? name : '';
      const seenPeople = new Set<number>();
      let total: number | null = null;
      candidateLookupPending.value = true;
      for (let page = 1; ; page += 1) {
        if (!ownsLookup()) return null;
        const sequence = ++candidateSequence;
        const transactionId = `linked-candidates-${sequence}`;
        const response = await options.drivers.candidates.execute({
          query, input: { positionKey: null, positionScope: 'query' },
          view: { search, sort: 'count', order: 'desc', page, pageSize: 20 },
          sequence, transactionId, signal: controller.signal,
        });
        if (!ownsLookup()) return null;
        const payload = response.payload;
        if (response.transactionId !== transactionId || payload.scope !== query.scope
          || payload.positionKey !== null || payload.workUnit !== (query.mergeSeries ? 'series' : 'subject')
          || JSON.stringify([payload.dataVersion, payload.collection?.fetchedAt ?? null]) !== snapshot) {
          throw new Error('候选人物响应与当前查询不匹配，请重新应用查询后重试');
        }
        const pagination = payload.pagination;
        if (pagination.page !== page || pagination.pageSize !== 20
          || !Number.isSafeInteger(pagination.total) || pagination.total < 0
          || (total !== null && pagination.total !== total)) {
          throw new Error('候选人物分页不一致，请重试');
        }
        total = pagination.total;
        if (!Array.isArray(payload.items) || payload.items.length !== Math.min(20, total - seenPeople.size)) {
          throw new Error('候选人物分页不完整，请重试');
        }
        const items: CandidatePayload['items'] = payload.items;
        // Validate the WHOLE page before considering a match, including later duplicates.
        for (const item of items) {
          decodePersonDetailInput({ personId: item.person.id });
          if (seenPeople.has(item.person.id)) throw new Error('候选人物重复，请重试');
          seenPeople.add(item.person.id);
          if (!Array.isArray(item.positionKeys) || item.positionKeys.length === 0
            || new Set(item.positionKeys).size !== item.positionKeys.length) {
            throw new Error('候选人物身份不完整，请重试');
          }
          for (const key of item.positionKeys) decodePositionKey(key);
        }
        const match = items.find((item) => item.person.id === personId);
        if (match) {
          if (match.positionKeys.length > 20) throw new Error('该人物的完整身份超过 20 个，无法查看共演');
          // Validate the exact identity array; never repair or truncate it.
          decodePersonDetailInput({ personId, positionKeys: match.positionKeys, positionScope: 'all' });
          if (match.positionKeys.some((key) => !operationPositionAllowed(
            query, 'query', key, options.getCatalog?.() ?? null, 'candidates',
          ))) throw new Error('候选人物身份不受当前查询支持，请重新应用查询后重试');
          return ownsLookup() ? [...match.positionKeys] : null;
        }
        if (seenPeople.size === total) throw new Error('当前查询中未找到该人物的完整身份，请重试');
      }
    } catch (error) {
      if (!ownsLookup()) return null;
      candidateLookupError.value = error instanceof CandidatesApiError ? candidateErrorMessage(error.code)
        : error instanceof Error && !(error instanceof SyntaxError) ? error.message
          : '查询快照不可用，请重新应用查询后重试';
      return null;
    } finally {
      if (ownsLookup()) {
        candidateLookupPending.value = false;
        candidateController = null;
      } else if (candidateController === controller) {
        // Release only this obsolete request; never a newer lookup's pending/error state.
        cancelCandidateLookup();
      }
    }
  }

  function inspect(nextPerson: LinkedPerson, identities: readonly string[]): void {
    close();
    const query = options.query();
    if (!query || !Number.isSafeInteger(nextPerson.id) || nextPerson.id < 1
      || identities.length === 0 || identities.length > 20 || new Set(identities).size !== identities.length
      || identities.some((key) => !operationPositionAllowed(query, 'all', key, options.getCatalog?.() ?? null, 'personDetail'))) return;
    person.value = nextPerson;
    positionKeys.value = [...identities];
    detail.payload = null;
    detail.phase = 'idle';
    detail.view = defaultPersonDetailView;
    location.value = null;
    void loadDetail();
    void loadRank();
  }

  return { person, positionKeys, detail, location, rankPending, rankError, rankingView, inspect, close, loadDetail, loadRank,
    lookupCandidateIdentities, cancelCandidateLookup, candidateLookupPending, candidateLookupError };
}

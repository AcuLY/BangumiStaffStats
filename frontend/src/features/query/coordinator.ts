import { readonly, ref, shallowReactive, type Ref } from 'vue';

import type {
  CandidatesInputV1,
  CandidatesViewV1,
  PersonDetailInputV1,
  PersonDetailViewV1,
  RankingsViewV1,
} from '../../api/generated/query-wire/types.gen';
import { CandidatesApiError } from '../../api/candidates';
import { RankingsApiError } from '../../api/rankings';
import { PersonDetailApiError } from '../../api/personDetail';
import type { CatalogSnapshot } from '../../api/adapters/catalog';
import {
  type AppliedQuery,
  querySignature,
  validateDraft,
  type QueryMode,
} from './model';
import type { useQueryStore } from './store';

export type QueryOperation = 'candidates' | 'person-detail' | 'rankings';
type PrimaryQueryOperation = Exclude<QueryOperation, 'person-detail'>;
export type ResourcePhase = 'error' | 'idle' | 'pending' | 'ready';
export type RankingsViewState = Required<RankingsViewV1>;
export type CandidatesViewState = Required<CandidatesViewV1>;
export type PersonDetailViewState = Required<PersonDetailViewV1>;

export interface OperationFeedback {
  readonly kind: 'error' | 'status' | 'warning';
  readonly message: string;
  readonly operation: QueryOperation;
}

export interface OperationResponse<Payload> {
  readonly payload: Payload;
  readonly requestId: string;
  readonly staleCollection?: boolean;
  readonly warningCodes?: readonly string[];
  readonly transactionId: string;
}

export interface OperationRequest<Input, View> {
  readonly input: Input;
  readonly query: AppliedQuery;
  readonly refreshCollection: boolean;
  readonly transactionId: string;
  readonly sequence: number;
  readonly signal: AbortSignal;
  readonly view: View;
}

export interface OperationDriver<Input, View, Payload> {
  execute(
    request: OperationRequest<Input, View>,
  ): Promise<OperationResponse<Payload>>;
}

export interface QueryDrivers<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload = unknown,
> {
  readonly candidates: OperationDriver<
    Readonly<CandidatesInputV1>,
    Readonly<CandidatesViewV1>,
    CandidatePayload
  >;
  readonly rankings: OperationDriver<
    Readonly<Record<string, never>>,
    Readonly<RankingsViewV1>,
    RankingPayload
  >;
  readonly personDetail?: OperationDriver<
    Readonly<PersonDetailInputV1>,
    Readonly<PersonDetailViewV1>,
    PersonDetailPayload
  >;
}

export interface OperationResource<Payload, Input, View> {
  acceptedQuery: AppliedQuery | null;
  error: string | null;
  feedback: string | null;
  input: Readonly<Input>;
  payload: Payload | null;
  phase: ResourcePhase;
  requestId: string | null;
  revision: number;
  staleCollection: boolean;
  view: Readonly<View>;
  viewPending: boolean;
}

interface ResourceSnapshot {
  readonly acceptedQuery: AppliedQuery | null;
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: unknown;
  readonly payload: unknown;
  readonly phase: ResourcePhase;
  readonly requestId: string | null;
  readonly revision: number;
  readonly staleCollection: boolean;
  readonly view: unknown;
  readonly viewPending: boolean;
}

interface OperationTransaction {
  readonly controller: AbortController;
  readonly sequence: number;
  readonly snapshot: ResourceSnapshot;
}

export class QueryCapabilityUnavailableError extends Error {
  constructor() {
    super('该结果能力尚未接入');
    this.name = 'QueryCapabilityUnavailableError';
  }
}

export function unavailableQueryDrivers(): QueryDrivers<never, never, never> {
  const unavailable = {
    async execute(): Promise<never> {
      throw new QueryCapabilityUnavailableError();
    },
  };
  return {
    candidates: unavailable,
    personDetail: unavailable,
    rankings: unavailable,
  };
}

function resourceError(error: unknown): string {
  if (error instanceof QueryCapabilityUnavailableError) {
    return error.message;
  }
  if (error instanceof RankingsApiError) {
    return error.message;
  }
  if (error instanceof CandidatesApiError) {
    return error.message;
  }
  if (error instanceof PersonDetailApiError) {
    return error.message;
  }
  return '查询暂时无法完成，请稍后重试';
}

function transactionId(operation: QueryOperation, sequence: number): string {
  return `${operation}-${sequence.toString(36)}`;
}

function serverRequestId(error: unknown): string | null {
  return error instanceof RankingsApiError ||
    error instanceof CandidatesApiError ||
    error instanceof PersonDetailApiError
    ? error.requestId
    : null;
}

function candidateViewEquals(
  left: Readonly<CandidatesViewState>,
  right: Readonly<CandidatesViewState>,
): boolean {
  return (
    left.search === right.search &&
    left.sort === right.sort &&
    left.order === right.order &&
    left.page === right.page &&
    left.pageSize === right.pageSize
  );
}

function validCandidateView(
  query: AppliedQuery,
  view: Readonly<CandidatesViewState>,
): boolean {
  return (
    [...view.search].length <= 256 &&
    ['count', 'average', 'globalAverage'].includes(view.sort) &&
    !(query.scope === 'global' && view.sort === 'globalAverage') &&
    ['asc', 'desc'].includes(view.order) &&
    Number.isSafeInteger(view.page) &&
    view.page >= 1 &&
    [5, 10, 20].includes(view.pageSize)
  );
}

function defaultPersonDetailView(
  _query: AppliedQuery,
): PersonDetailViewState {
  return Object.freeze({
    order: 'desc',
    page: 1,
    pageSize: 10,
    search: '',
    section: 'works',
    sort: 'globalScore',
  });
}

function personDetailViewEquals(
  left: Readonly<PersonDetailViewState>,
  right: Readonly<PersonDetailViewState>,
): boolean {
  return (
    left.section === right.section &&
    left.search === right.search &&
    left.sort === right.sort &&
    left.order === right.order &&
    left.page === right.page &&
    left.pageSize === right.pageSize
  );
}

function validPersonDetailView(
  view: Readonly<PersonDetailViewState>,
): boolean {
  return (
    ['works', 'characters'].includes(view.section) &&
    [...view.search].length <= 256 &&
    [
      'globalScore',
      'personalScore',
      'collectionUpdatedAt',
      'seriesSize',
      'role',
      'workCount',
      'name',
    ].includes(view.sort) &&
    ['asc', 'desc'].includes(view.order) &&
    Number.isSafeInteger(view.page) &&
    view.page >= 1 &&
    [5, 10, 20].includes(view.pageSize)
  );
}

type QueryStore = ReturnType<typeof useQueryStore>;

export interface QueryCoordinator<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload = unknown,
> {
  readonly candidates: OperationResource<
    CandidatePayload,
    CandidatesInputV1,
    CandidatesViewV1
  >;
  cancel(mode: QueryMode): void;
  cancelPending(): void;
  execute(options: {
    candidateInput?: Readonly<CandidatesInputV1>;
    catalog: CatalogSnapshot | null;
    mode: QueryMode;
    refreshCollection?: boolean;
  }): Promise<boolean>;
  executeCandidateView(
    input: Readonly<CandidatesInputV1>,
    view: Readonly<CandidatesViewState>,
  ): Promise<boolean>;
  executeRankingView(view: Readonly<RankingsViewState>): Promise<boolean>;
  executePersonDetail(
    personId: number,
    view?: Readonly<PersonDetailViewState>,
  ): Promise<boolean>;
  executePersonDetailView(
    view: Readonly<PersonDetailViewState>,
  ): Promise<boolean>;
  clearPersonDetail(): void;
  cancelPersonDetail(feedback?: string): void;
  readonly lastOperationFeedback: Readonly<Ref<OperationFeedback | null>>;
  readonly pending: Readonly<Ref<boolean>>;
  readonly pendingOperation: Readonly<Ref<QueryOperation | null>>;
  readonly rankings: OperationResource<
    RankingPayload,
    Record<string, never>,
    RankingsViewState
  >;
  readonly personDetail: OperationResource<
    PersonDetailPayload,
    PersonDetailInputV1,
    PersonDetailViewState
  >;
}

export function createQueryCoordinator<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload = unknown,
>(
  store: QueryStore,
  drivers: QueryDrivers<
    RankingPayload,
    CandidatePayload,
    PersonDetailPayload
  >,
  onSuccessfulQuery?: (query: AppliedQuery) => void,
): QueryCoordinator<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload
> {
  const lastOperationFeedback = ref<OperationFeedback | null>(null);
  const pending = ref(false);
  const pendingOperation = ref<QueryOperation | null>(null);
  const sequences: Record<QueryOperation, number> = {
    candidates: 0,
    'person-detail': 0,
    rankings: 0,
  };
  const controllers: Partial<Record<QueryOperation, AbortController>> = {};
  const transactions: Partial<Record<QueryOperation, OperationTransaction>> =
    {};

  const rankings = shallowReactive<
    OperationResource<
      RankingPayload,
      Record<string, never>,
      RankingsViewState
    >
  >({
    acceptedQuery: null,
    error: null,
    feedback: null,
    input: Object.freeze({}),
    payload: null,
    phase: 'idle',
    requestId: null,
    revision: 0,
    staleCollection: false,
    view: Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'count',
    }),
    viewPending: false,
  });
  const candidates = shallowReactive<
    OperationResource<CandidatePayload, CandidatesInputV1, CandidatesViewV1>
  >({
    acceptedQuery: null,
    error: null,
    feedback: null,
    input: Object.freeze({ positionKey: '' as never }),
    payload: null,
    phase: 'idle',
    requestId: null,
    revision: 0,
    staleCollection: false,
    view: Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'count',
    }),
    viewPending: false,
  });
  const personDetail = shallowReactive<
    OperationResource<
      PersonDetailPayload,
      PersonDetailInputV1,
      PersonDetailViewState
    >
  >({
    acceptedQuery: null,
    error: null,
    feedback: null,
    input: Object.freeze({ personId: 0 }),
    payload: null,
    phase: 'idle',
    requestId: null,
    revision: 0,
    staleCollection: false,
    view: Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      section: 'works',
      sort: 'globalScore',
    }),
    viewPending: false,
  });

  function operationFor(mode: QueryMode): PrimaryQueryOperation {
    return mode === 'ranking' ? 'rankings' : 'candidates';
  }

  function captureResource(
    resource: OperationResource<unknown, unknown, unknown>,
  ): ResourceSnapshot {
    return {
      acceptedQuery: resource.acceptedQuery,
      error: resource.error,
      feedback: resource.feedback,
      input: resource.input,
      payload: resource.payload,
      phase: resource.phase,
      requestId: resource.requestId,
      revision: resource.revision,
      staleCollection: resource.staleCollection,
      view: resource.view,
      viewPending: resource.viewPending,
    };
  }

  function restoreResource(
    resource:
      | typeof rankings
      | typeof candidates
      | typeof personDetail,
    snapshot: ResourceSnapshot,
  ): void {
    resource.acceptedQuery = snapshot.acceptedQuery;
    resource.error = snapshot.error;
    resource.feedback = snapshot.feedback;
    resource.input = snapshot.input as never;
    resource.payload = snapshot.payload as never;
    resource.phase = snapshot.phase;
    resource.requestId = snapshot.requestId;
    resource.revision = snapshot.revision;
    resource.staleCollection = snapshot.staleCollection;
    resource.view = snapshot.view as never;
    resource.viewPending = snapshot.viewPending;
  }

  function syncPendingState(): void {
    pendingOperation.value = transactions.rankings
      ? 'rankings'
      : transactions.candidates
        ? 'candidates'
        : null;
    pending.value = pendingOperation.value !== null;
  }

  function publishFeedback(
    operation: QueryOperation,
    message: string,
    kind: OperationFeedback['kind'],
  ): void {
    lastOperationFeedback.value = Object.freeze({
      kind,
      message,
      operation,
    });
  }

  function cancelOperation(
    operation: QueryOperation,
    feedback = '查询已取消',
  ): void {
    const transaction = transactions[operation];
    if (!transaction) {
      return;
    }
    sequences[operation] += 1;
    transaction.controller.abort();
    controllers[operation]?.abort();
    controllers[operation] = undefined;
    transactions[operation] = undefined;
    const resource =
      operation === 'rankings'
        ? rankings
        : operation === 'candidates'
          ? candidates
          : personDetail;
    restoreResource(resource, transaction.snapshot);
    resource.feedback = feedback || null;
    if (feedback) {
      publishFeedback(operation, feedback, 'status');
    }
    syncPendingState();
  }

  function cancel(mode: QueryMode): void {
    cancelOperation(operationFor(mode));
  }

  function cancelPending(): void {
    if (pendingOperation.value) {
      cancelOperation(pendingOperation.value);
    }
  }

  function clearPersonDetail(): void {
    const transaction = transactions['person-detail'];
    if (transaction) {
      sequences['person-detail'] += 1;
      transaction.controller.abort();
    }
    controllers['person-detail']?.abort();
    controllers['person-detail'] = undefined;
    transactions['person-detail'] = undefined;
    personDetail.acceptedQuery = null;
    personDetail.error = null;
    personDetail.feedback = null;
    personDetail.input = Object.freeze({ personId: 0 });
    personDetail.payload = null;
    personDetail.phase = 'idle';
    personDetail.requestId = null;
    personDetail.revision = 0;
    personDetail.staleCollection = false;
    personDetail.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'person-detail') {
      lastOperationFeedback.value = null;
    }
  }

  function cancelPersonDetail(feedback = ''): void {
    cancelOperation('person-detail', feedback);
  }

  async function execute(options: {
    candidateInput?: Readonly<CandidatesInputV1>;
    catalog: CatalogSnapshot | null;
    mode: QueryMode;
    refreshCollection?: boolean;
  }): Promise<boolean> {
    const validation = validateDraft(
      store.draft,
      options.mode,
      options.catalog,
    );
    if (!validation.query) {
      store.setErrors(validation.errors);
      return false;
    }

    const query = validation.query;
    const operation = operationFor(options.mode);
    const otherOperation: PrimaryQueryOperation =
      operation === 'rankings' ? 'candidates' : 'rankings';
    cancelOperation(otherOperation, '查询已由其他模式替代');
    const resource = operation === 'rankings' ? rankings : candidates;
    let nextCandidateInput: Readonly<CandidatesInputV1> | null = null;
    if (operation === 'candidates') {
      const requestedPosition =
        options.candidateInput?.positionKey ?? query.positionKeys[0];
      const candidatePosition = options.catalog?.positionsByKey.get(
        String(requestedPosition),
      );
      if (
        !query.positionKeys.includes(requestedPosition) ||
        !candidatePosition ||
        !candidatePosition.selectable ||
        candidatePosition.subjectType !== query.subjectType ||
        !candidatePosition.capabilities.includes('candidates')
      ) {
        candidates.error = '查询暂时无法完成，请稍后重试';
        publishFeedback('candidates', candidates.error, 'error');
        return false;
      }
      nextCandidateInput = Object.freeze({
        positionKey: requestedPosition,
      }) as Readonly<CandidatesInputV1>;
    }
    const sameQuery =
      store.applied !== null &&
      querySignature(store.applied) === querySignature(query);
    let nextCandidateView: Readonly<CandidatesViewState> | null = null;
    if (operation === 'candidates') {
      const priorScope = candidates.acceptedQuery?.scope;
      const currentCandidateView: CandidatesViewState = {
        order: candidates.view.order ?? 'desc',
        page: candidates.view.page ?? 1,
        pageSize: candidates.view.pageSize ?? 10,
        search: candidates.view.search ?? '',
        sort: candidates.view.sort ?? 'count',
      };
      const nextSort =
        query.scope === 'global' &&
        currentCandidateView.sort === 'globalAverage'
          ? 'average'
          : query.scope === 'personal' &&
              priorScope === 'global' &&
              currentCandidateView.sort === 'average'
            ? 'globalAverage'
            : currentCandidateView.sort;
      const candidateView = Object.freeze({
        ...currentCandidateView,
        ...(!sameQuery ? { page: 1, search: '' } : {}),
        sort: nextSort,
      });
      if (!validCandidateView(query, candidateView)) {
        candidates.error = '候选人物视图参数无效';
        publishFeedback('candidates', candidates.error, 'error');
        return false;
      }
      nextCandidateView = candidateView;
    }
    if (
      sameQuery &&
      resource.revision === store.revision &&
      resource.phase === 'ready' &&
      (operation !== 'candidates' ||
        candidates.input.positionKey === nextCandidateInput?.positionKey) &&
      options.refreshCollection !== true
    ) {
      resource.feedback = '查询条件没有变化';
      publishFeedback(operation, resource.feedback, 'status');
      return true;
    }

    clearPersonDetail();
    const existingTransaction = transactions[operation];
    controllers[operation]?.abort();
    const controller = new AbortController();
    controllers[operation] = controller;
    const sequence = ++sequences[operation];
    const transaction = transactionId(operation, sequence);
    const snapshot =
      existingTransaction?.snapshot ??
      captureResource(resource as OperationResource<unknown, unknown, unknown>);
    transactions[operation] = { controller, sequence, snapshot };

    resource.phase = 'pending';
    resource.viewPending = false;
    resource.error = null;
    resource.feedback = null;
    if (nextCandidateInput) {
      candidates.input = nextCandidateInput;
    }
    if (nextCandidateView) {
      candidates.view = nextCandidateView;
    }
    lastOperationFeedback.value = null;
    syncPendingState();

    const refreshCollection =
      options.refreshCollection === true && query.scope === 'personal';
    const nextRevision = sameQuery ? store.revision : store.revision + 1;
    try {
      if (operation === 'rankings') {
        if (query.scope === 'global' && rankings.view.sort === 'preference') {
          rankings.view = Object.freeze({
            ...rankings.view,
            page: 1,
            sort: 'count',
          });
        }
        const response = await drivers.rankings.execute({
          input: rankings.input,
          query,
          refreshCollection,
          sequence,
          signal: controller.signal,
          transactionId: transaction,
          view: rankings.view,
        });
        if (
          sequence !== sequences.rankings ||
          controller.signal.aborted ||
          controllers.rankings !== controller
        ) {
          return false;
        }
        if (response.transactionId !== transaction) {
          throw new Error('Response transaction ID does not match the request');
        }
        rankings.payload = response.payload;
        rankings.requestId = response.requestId;
        rankings.acceptedQuery = query;
        rankings.revision = nextRevision;
        rankings.staleCollection =
          response.staleCollection === true ||
          response.warningCodes?.includes('COLLECTION_STALE') === true;
        rankings.feedback = rankings.staleCollection
          ? '收藏刷新未完成，当前显示最近一次可用数据'
          : null;
        rankings.phase = 'ready';
        rankings.viewPending = false;
      } else {
        const input = nextCandidateInput!;
        const response = await drivers.candidates.execute({
          input,
          query,
          refreshCollection,
          sequence,
          signal: controller.signal,
          transactionId: transaction,
          view: candidates.view,
        });
        if (
          sequence !== sequences.candidates ||
          controller.signal.aborted ||
          controllers.candidates !== controller
        ) {
          return false;
        }
        if (response.transactionId !== transaction) {
          throw new Error('Response transaction ID does not match the request');
        }
        candidates.input = input;
        candidates.payload = response.payload;
        candidates.requestId = response.requestId;
        candidates.acceptedQuery = query;
        candidates.revision = nextRevision;
        candidates.staleCollection =
          response.staleCollection === true ||
          response.warningCodes?.includes('COLLECTION_STALE') === true;
        candidates.feedback = candidates.staleCollection
          ? '收藏刷新未完成，当前显示最近一次可用数据'
          : null;
        candidates.phase = 'ready';
      }
      store.commit(query, nextRevision);
      try {
        onSuccessfulQuery?.(query);
      } catch {
        resource.feedback =
          resource.feedback ?? '查询已应用，但地址栏同步未完成';
      }
      if (resource.feedback) {
        publishFeedback(
          operation,
          resource.feedback,
          resource.staleCollection ? 'warning' : 'status',
        );
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences[operation] ||
        controllers[operation] !== controller
      ) {
        return false;
      }
      restoreResource(resource, snapshot);
      resource.error = controller.signal.aborted
        ? '查询已取消'
        : resourceError(error);
      resource.requestId = serverRequestId(error) ?? resource.requestId;
      publishFeedback(operation, resource.error, 'error');
      return false;
    } finally {
      if (controllers[operation] === controller) {
        controllers[operation] = undefined;
        transactions[operation] = undefined;
      }
      syncPendingState();
    }
  }

  function readyCandidateQuery(): AppliedQuery | null {
    if (
      !store.applied ||
      !candidates.acceptedQuery ||
      candidates.payload === null ||
      candidates.phase !== 'ready' ||
      candidates.revision !== store.revision ||
      querySignature(candidates.acceptedQuery) !== querySignature(store.applied)
    ) {
      return null;
    }
    return candidates.acceptedQuery;
  }

  async function executeCandidateView(
    input: Readonly<CandidatesInputV1>,
    view: Readonly<CandidatesViewState>,
  ): Promise<boolean> {
    const query = readyCandidateQuery();
    if (!query) {
      candidates.error = '请先完成一次共演分析查询';
      publishFeedback('candidates', candidates.error, 'error');
      return false;
    }
    if (
      !query.positionKeys.map(String).includes(String(input.positionKey))
    ) {
      candidates.error = '候选职位不在已应用查询中';
      publishFeedback('candidates', candidates.error, 'error');
      return false;
    }
    if (!validCandidateView(query, view)) {
      candidates.error = '候选人物视图参数无效';
      publishFeedback('candidates', candidates.error, 'error');
      return false;
    }
    if (
      !candidates.viewPending &&
      String(candidates.input.positionKey) === String(input.positionKey) &&
      candidateViewEquals(
        candidates.view as Readonly<CandidatesViewState>,
        view,
      )
    ) {
      return true;
    }

    if (transactions.candidates) {
      cancelOperation('candidates', '');
    }
    const controller = new AbortController();
    controllers.candidates = controller;
    const sequence = ++sequences.candidates;
    const transaction = transactionId('candidates', sequence);
    const snapshot = captureResource(candidates);
    transactions.candidates = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);
    const nextInput = Object.freeze(
      structuredClone(input),
    ) as Readonly<CandidatesInputV1>;
    const nextView = Object.freeze(
      structuredClone(view),
    ) as Readonly<CandidatesViewState>;

    candidates.error = null;
    candidates.feedback = null;
    candidates.input = nextInput;
    candidates.view = nextView;
    candidates.viewPending = true;
    if (lastOperationFeedback.value?.operation === 'candidates') {
      lastOperationFeedback.value = null;
    }
    syncPendingState();

    try {
      const response = await drivers.candidates.execute({
        input: nextInput,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view: nextView,
      });
      if (
        sequence !== sequences.candidates ||
        controller.signal.aborted ||
        controllers.candidates !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      candidates.payload = response.payload;
      candidates.requestId = response.requestId;
      candidates.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      candidates.feedback = candidates.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      candidates.error = null;
      candidates.phase = 'ready';
      candidates.viewPending = false;
      if (candidates.feedback) {
        publishFeedback('candidates', candidates.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences.candidates ||
        controllers.candidates !== controller
      ) {
        return false;
      }
      restoreResource(candidates, snapshot);
      candidates.error = controller.signal.aborted
        ? '候选人物加载已取消'
        : resourceError(error);
      candidates.requestId =
        serverRequestId(error) ?? candidates.requestId;
      publishFeedback('candidates', candidates.error, 'error');
      return false;
    } finally {
      if (controllers.candidates === controller) {
        controllers.candidates = undefined;
        transactions.candidates = undefined;
        candidates.viewPending = false;
      }
      syncPendingState();
    }
  }

  async function executeRankingView(
    view: Readonly<RankingsViewState>,
  ): Promise<boolean> {
    if (
      !store.applied ||
      !rankings.acceptedQuery ||
      rankings.payload === null ||
      rankings.phase !== 'ready' ||
      rankings.revision !== store.revision ||
      querySignature(rankings.acceptedQuery) !== querySignature(store.applied)
    ) {
      rankings.error = '请先完成一次人物排行查询';
      publishFeedback('rankings', rankings.error, 'error');
      return false;
    }
    if (store.applied.scope === 'global' && view.sort === 'preference') {
      rankings.error = '全站排行不支持相对偏好排序';
      publishFeedback('rankings', rankings.error, 'error');
      return false;
    }
    if (
      !Number.isSafeInteger(view.page) ||
      view.page < 1 ||
      ![5, 10, 20].includes(view.pageSize) ||
      !['count', 'average', 'overall', 'preference'].includes(view.sort) ||
      !['asc', 'desc'].includes(view.order) ||
      [...view.search].length > 256
    ) {
      rankings.error = '排行视图参数无效';
      publishFeedback('rankings', rankings.error, 'error');
      return false;
    }
    if (
      !rankings.viewPending &&
      rankings.view.search === view.search &&
      rankings.view.sort === view.sort &&
      rankings.view.order === view.order &&
      rankings.view.page === view.page &&
      rankings.view.pageSize === view.pageSize
    ) {
      return true;
    }

    if (transactions.rankings) {
      cancelOperation('rankings', '');
    }
    const controller = new AbortController();
    controllers.rankings = controller;
    const sequence = ++sequences.rankings;
    const transaction = transactionId('rankings', sequence);
    const snapshot = captureResource(rankings);
    transactions.rankings = { controller, sequence, snapshot };

    rankings.error = null;
    rankings.feedback = null;
    rankings.view = Object.freeze(structuredClone(view));
    rankings.viewPending = true;
    lastOperationFeedback.value = null;
    syncPendingState();

    try {
      const response = await drivers.rankings.execute({
        input: rankings.input,
        query: rankings.acceptedQuery,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view: rankings.view,
      });
      if (
        sequence !== sequences.rankings ||
        controller.signal.aborted ||
        controllers.rankings !== controller
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      rankings.payload = response.payload;
      rankings.requestId = response.requestId;
      rankings.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      rankings.feedback = rankings.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      rankings.error = null;
      rankings.phase = 'ready';
      rankings.viewPending = false;
      if (rankings.feedback) {
        publishFeedback('rankings', rankings.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences.rankings ||
        controllers.rankings !== controller
      ) {
        return false;
      }
      restoreResource(rankings, snapshot);
      rankings.error = controller.signal.aborted
        ? '查询已取消'
        : resourceError(error);
      rankings.requestId = serverRequestId(error) ?? rankings.requestId;
      publishFeedback('rankings', rankings.error, 'error');
      return false;
    } finally {
      if (controllers.rankings === controller) {
        controllers.rankings = undefined;
        transactions.rankings = undefined;
        rankings.viewPending = false;
      }
      syncPendingState();
    }
  }

  function readyRankingQuery(): AppliedQuery | null {
    if (
      !store.applied ||
      !rankings.acceptedQuery ||
      rankings.payload === null ||
      rankings.phase !== 'ready' ||
      rankings.revision !== store.revision ||
      querySignature(rankings.acceptedQuery) !== querySignature(store.applied)
    ) {
      return null;
    }
    return rankings.acceptedQuery;
  }

  async function executePersonDetail(
    personId: number,
    requestedView?: Readonly<PersonDetailViewState>,
  ): Promise<boolean> {
    const query = readyRankingQuery();
    if (!query) {
      personDetail.error = '请先完成一次人物排行查询';
      personDetail.phase = 'error';
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    }
    if (!Number.isSafeInteger(personId) || personId < 1) {
      personDetail.error = '人物标识无效';
      personDetail.phase = 'error';
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    }
    const view = Object.freeze(
      structuredClone(requestedView ?? defaultPersonDetailView(query)),
    );
    if (!validPersonDetailView(view)) {
      personDetail.error = '人物详情视图参数无效';
      personDetail.phase = 'error';
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    }
    if (
      personDetail.phase === 'ready' &&
      personDetail.payload !== null &&
      personDetail.input.personId === personId &&
      personDetail.revision === store.revision
    ) {
      return personDetailViewEquals(personDetail.view, view)
        ? true
        : executePersonDetailView(view);
    }

    const priorTransaction = transactions['person-detail'];
    priorTransaction?.controller.abort();
    controllers['person-detail']?.abort();
    const controller = new AbortController();
    controllers['person-detail'] = controller;
    const sequence = ++sequences['person-detail'];
    const transaction = transactionId('person-detail', sequence);
    const snapshot = captureResource(personDetail);
    transactions['person-detail'] = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);

    personDetail.acceptedQuery = query;
    personDetail.error = null;
    personDetail.feedback = null;
    personDetail.input = Object.freeze({ personId });
    personDetail.payload = null;
    personDetail.phase = 'pending';
    personDetail.requestId = null;
    personDetail.revision = capturedRevision;
    personDetail.staleCollection = false;
    personDetail.view = view;
    personDetail.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'person-detail') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.personDetail) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.personDetail.execute({
        input: personDetail.input,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view,
      });
      if (
        sequence !== sequences['person-detail'] ||
        controller.signal.aborted ||
        controllers['person-detail'] !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }
      personDetail.payload = response.payload;
      personDetail.requestId = response.requestId;
      personDetail.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      personDetail.feedback = personDetail.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      personDetail.phase = 'ready';
      if (personDetail.feedback) {
        publishFeedback('person-detail', personDetail.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences['person-detail'] ||
        controllers['person-detail'] !== controller
      ) {
        return false;
      }
      personDetail.payload = null;
      personDetail.error = controller.signal.aborted
        ? '人物详情加载已取消'
        : resourceError(error);
      personDetail.requestId =
        serverRequestId(error) ?? personDetail.requestId;
      personDetail.phase = 'error';
      personDetail.viewPending = false;
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    } finally {
      if (controllers['person-detail'] === controller) {
        controllers['person-detail'] = undefined;
        transactions['person-detail'] = undefined;
      }
    }
  }

  async function executePersonDetailView(
    view: Readonly<PersonDetailViewState>,
  ): Promise<boolean> {
    const query = readyRankingQuery();
    if (
      !query ||
      !personDetail.acceptedQuery ||
      personDetail.payload === null ||
      personDetail.phase !== 'ready' ||
      personDetail.revision !== store.revision ||
      querySignature(personDetail.acceptedQuery) !== querySignature(query)
    ) {
      personDetail.error = '请先选择排行中的人物';
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    }
    if (!validPersonDetailView(view)) {
      personDetail.error = '人物详情视图参数无效';
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    }
    if (
      !personDetail.viewPending &&
      personDetailViewEquals(personDetail.view, view)
    ) {
      return true;
    }

    if (transactions['person-detail']) {
      cancelOperation('person-detail', '');
    }
    const controller = new AbortController();
    controllers['person-detail'] = controller;
    const sequence = ++sequences['person-detail'];
    const transaction = transactionId('person-detail', sequence);
    const snapshot = captureResource(personDetail);
    transactions['person-detail'] = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);
    const nextView = Object.freeze(structuredClone(view));

    personDetail.error = null;
    personDetail.feedback = null;
    personDetail.view = nextView;
    personDetail.viewPending = true;
    if (lastOperationFeedback.value?.operation === 'person-detail') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.personDetail) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.personDetail.execute({
        input: personDetail.input,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view: nextView,
      });
      if (
        sequence !== sequences['person-detail'] ||
        controller.signal.aborted ||
        controllers['person-detail'] !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }
      personDetail.payload = response.payload;
      personDetail.requestId = response.requestId;
      personDetail.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      personDetail.feedback = personDetail.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      personDetail.error = null;
      personDetail.phase = 'ready';
      personDetail.viewPending = false;
      if (personDetail.feedback) {
        publishFeedback('person-detail', personDetail.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences['person-detail'] ||
        controllers['person-detail'] !== controller
      ) {
        return false;
      }
      restoreResource(personDetail, snapshot);
      personDetail.error = controller.signal.aborted
        ? '人物详情加载已取消'
        : resourceError(error);
      personDetail.requestId =
        serverRequestId(error) ?? personDetail.requestId;
      publishFeedback('person-detail', personDetail.error, 'error');
      return false;
    } finally {
      if (controllers['person-detail'] === controller) {
        controllers['person-detail'] = undefined;
        transactions['person-detail'] = undefined;
        personDetail.viewPending = false;
      }
    }
  }

  return {
    cancel,
    cancelPersonDetail,
    cancelPending,
    candidates,
    clearPersonDetail,
    execute,
    executeCandidateView,
    executePersonDetail,
    executePersonDetailView,
    executeRankingView,
    lastOperationFeedback: readonly(lastOperationFeedback),
    pending: readonly(pending),
    pendingOperation: readonly(pendingOperation),
    personDetail,
    rankings,
  };
}

import { readonly, ref, shallowReactive, type Ref } from 'vue';

import type {
  CandidatesInputV1,
  CandidatesViewV1,
  RankingsViewV1,
} from '../../api/generated/query-wire/types.gen';
import type { CatalogSnapshot } from '../../api/adapters/catalog';
import {
  type AppliedQuery,
  querySignature,
  validateDraft,
  type QueryMode,
} from './model';
import type { useQueryStore } from './store';

export type QueryOperation = 'candidates' | 'rankings';
export type ResourcePhase = 'error' | 'idle' | 'pending' | 'ready';

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
}

export interface OperationRequest<Input, View> {
  readonly input: Input;
  readonly query: AppliedQuery;
  readonly refreshCollection: boolean;
  readonly requestId: string;
  readonly sequence: number;
  readonly signal: AbortSignal;
  readonly view: View;
}

export interface OperationDriver<Input, View, Payload> {
  execute(
    request: OperationRequest<Input, View>,
  ): Promise<OperationResponse<Payload>>;
}

export interface QueryDrivers<RankingPayload, CandidatePayload> {
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
}

interface ResourceSnapshot {
  readonly acceptedQuery: AppliedQuery | null;
  readonly error: string | null;
  readonly feedback: string | null;
  readonly payload: unknown;
  readonly phase: ResourcePhase;
  readonly requestId: string | null;
  readonly revision: number;
  readonly staleCollection: boolean;
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

export function unavailableQueryDrivers(): QueryDrivers<never, never> {
  const unavailable = {
    async execute(): Promise<never> {
      throw new QueryCapabilityUnavailableError();
    },
  };
  return {
    candidates: unavailable,
    rankings: unavailable,
  };
}

function resourceError(error: unknown): string {
  if (error instanceof QueryCapabilityUnavailableError) {
    return error.message;
  }
  return '查询暂时无法完成，请稍后重试';
}

function requestId(operation: QueryOperation, sequence: number): string {
  return `${operation}-${sequence.toString(36)}`;
}

type QueryStore = ReturnType<typeof useQueryStore>;

export interface QueryCoordinator<RankingPayload, CandidatePayload> {
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
  readonly lastOperationFeedback: Readonly<Ref<OperationFeedback | null>>;
  readonly pending: Readonly<Ref<boolean>>;
  readonly pendingOperation: Readonly<Ref<QueryOperation | null>>;
  readonly rankings: OperationResource<
    RankingPayload,
    Record<string, never>,
    RankingsViewV1
  >;
}

export function createQueryCoordinator<RankingPayload, CandidatePayload>(
  store: QueryStore,
  drivers: QueryDrivers<RankingPayload, CandidatePayload>,
  onSuccessfulQuery?: (query: AppliedQuery) => void,
): QueryCoordinator<RankingPayload, CandidatePayload> {
  const lastOperationFeedback = ref<OperationFeedback | null>(null);
  const pending = ref(false);
  const pendingOperation = ref<QueryOperation | null>(null);
  const sequences: Record<QueryOperation, number> = {
    candidates: 0,
    rankings: 0,
  };
  const controllers: Partial<Record<QueryOperation, AbortController>> = {};
  const transactions: Partial<Record<QueryOperation, OperationTransaction>> =
    {};

  const rankings = shallowReactive<
    OperationResource<
      RankingPayload,
      Record<string, never>,
      RankingsViewV1
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
  });

  function operationFor(mode: QueryMode): QueryOperation {
    return mode === 'ranking' ? 'rankings' : 'candidates';
  }

  function captureResource(
    resource: OperationResource<unknown, unknown, unknown>,
  ): ResourceSnapshot {
    return {
      acceptedQuery: resource.acceptedQuery,
      error: resource.error,
      feedback: resource.feedback,
      payload: resource.payload,
      phase: resource.phase,
      requestId: resource.requestId,
      revision: resource.revision,
      staleCollection: resource.staleCollection,
    };
  }

  function restoreResource(
    resource:
      | typeof rankings
      | typeof candidates,
    snapshot: ResourceSnapshot,
  ): void {
    resource.acceptedQuery = snapshot.acceptedQuery;
    resource.error = snapshot.error;
    resource.feedback = snapshot.feedback;
    resource.payload = snapshot.payload as never;
    resource.phase = snapshot.phase;
    resource.requestId = snapshot.requestId;
    resource.revision = snapshot.revision;
    resource.staleCollection = snapshot.staleCollection;
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
    const resource = operation === 'rankings' ? rankings : candidates;
    restoreResource(resource, transaction.snapshot);
    resource.feedback = feedback;
    publishFeedback(operation, feedback, 'status');
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
    const otherOperation: QueryOperation =
      operation === 'rankings' ? 'candidates' : 'rankings';
    cancelOperation(otherOperation, '查询已由其他模式替代');
    const resource = operation === 'rankings' ? rankings : candidates;
    const sameQuery =
      store.applied !== null &&
      querySignature(store.applied) === querySignature(query);
    if (
      sameQuery &&
      resource.revision === store.revision &&
      resource.phase === 'ready' &&
      options.refreshCollection !== true
    ) {
      resource.feedback = '查询条件没有变化';
      publishFeedback(operation, resource.feedback, 'status');
      return true;
    }

    const existingTransaction = transactions[operation];
    controllers[operation]?.abort();
    const controller = new AbortController();
    controllers[operation] = controller;
    const sequence = ++sequences[operation];
    const id = requestId(operation, sequence);
    const snapshot =
      existingTransaction?.snapshot ??
      captureResource(resource as OperationResource<unknown, unknown, unknown>);
    transactions[operation] = { controller, sequence, snapshot };

    resource.phase = 'pending';
    resource.error = null;
    resource.feedback = null;
    resource.requestId = id;
    lastOperationFeedback.value = null;
    syncPendingState();

    const refreshCollection =
      options.refreshCollection === true && query.scope === 'personal';
    const nextRevision = sameQuery ? store.revision : store.revision + 1;
    try {
      if (operation === 'rankings') {
        const response = await drivers.rankings.execute({
          input: rankings.input,
          query,
          refreshCollection,
          requestId: id,
          sequence,
          signal: controller.signal,
          view: rankings.view,
        });
        if (
          sequence !== sequences.rankings ||
          controller.signal.aborted ||
          controllers.rankings !== controller
        ) {
          return false;
        }
        if (response.requestId !== id) {
          throw new Error('Response request ID does not match the request');
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
      } else {
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
          throw new Error(
            'Candidate input is outside the applied query or unavailable',
          );
        }
        const input = Object.freeze({
          positionKey: requestedPosition,
        }) as Readonly<CandidatesInputV1>;
        const response = await drivers.candidates.execute({
          input,
          query,
          refreshCollection,
          requestId: id,
          sequence,
          signal: controller.signal,
          view: candidates.view,
        });
        if (
          sequence !== sequences.candidates ||
          controller.signal.aborted ||
          controllers.candidates !== controller
        ) {
          return false;
        }
        if (response.requestId !== id) {
          throw new Error('Response request ID does not match the request');
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

  return {
    cancel,
    cancelPending,
    candidates,
    execute,
    lastOperationFeedback: readonly(lastOperationFeedback),
    pending: readonly(pending),
    pendingOperation: readonly(pendingOperation),
    rankings,
  };
}

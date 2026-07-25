import { readonly, ref, shallowReactive, type Ref } from 'vue';

import type {
  CandidatesInputV1,
  CandidatesViewV1,
  CoStarInputV1,
  CoStarViewV1,
  PartnersInputV1,
  PartnersViewV1,
  PersonDetailInputV1,
  PersonDetailViewV1,
  RankingsViewV1,
} from '../../api/generated/query-wire/types.gen';
import { CandidatesApiError } from '../../api/candidates';
import { CoStarApiError } from '../../api/coStar';
import { PartnersApiError } from '../../api/partners';
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

export type QueryOperation =
  | 'candidates'
  | 'co-star'
  | 'partners'
  | 'person-detail'
  | 'rankings';
type PrimaryQueryOperation = 'candidates' | 'rankings';
export type ResourcePhase = 'error' | 'idle' | 'pending' | 'ready';
export type RankingsViewState = Required<RankingsViewV1>;
export type CandidatesViewState = Required<CandidatesViewV1>;
export type CoStarViewState = Required<CoStarViewV1>;
export type PersonDetailViewState = Required<PersonDetailViewV1>;
export type PartnersViewState = Required<PartnersViewV1>;

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
  PartnersPayload = unknown,
  CoStarPayload = unknown,
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
  readonly partners?: OperationDriver<
    Readonly<PartnersInputV1>,
    Readonly<PartnersViewV1>,
    PartnersPayload
  >;
  readonly coStar?: OperationDriver<
    Readonly<CoStarInputV1>,
    Readonly<CoStarViewV1>,
    CoStarPayload
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

export function unavailableQueryDrivers(): QueryDrivers<
  never,
  never,
  never,
  never,
  never
> {
  const unavailable = {
    async execute(): Promise<never> {
      throw new QueryCapabilityUnavailableError();
    },
  };
  return {
    candidates: unavailable,
    coStar: unavailable,
    partners: unavailable,
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
  if (error instanceof CoStarApiError) {
    return error.message;
  }
  if (error instanceof PartnersApiError) {
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
    error instanceof CoStarApiError ||
    error instanceof PartnersApiError ||
    error instanceof PersonDetailApiError
    ? error.requestId
    : null;
}

function coStarViewEquals(
  left: Readonly<CoStarViewState>,
  right: Readonly<CoStarViewState>,
): boolean {
  return (
    left.search === right.search &&
    left.sort === right.sort &&
    left.order === right.order &&
    left.page === right.page &&
    left.pageSize === right.pageSize
  );
}

function validCoStarView(
  query: AppliedQuery,
  view: Readonly<CoStarViewState>,
): boolean {
  return (
    [...view.search].length <= 256 &&
    [
      'collectionUpdatedAt',
      'globalScore',
      'personalScore',
      'seriesSize',
    ].includes(view.sort) &&
    !(
      query.scope === 'global' &&
      (view.sort === 'personalScore' ||
        view.sort === 'collectionUpdatedAt')
    ) &&
    !(query.mergeSeries !== true && view.sort === 'seriesSize') &&
    ['asc', 'desc'].includes(view.order) &&
    Number.isSafeInteger(view.page) &&
    view.page >= 1 &&
    [5, 10, 20].includes(view.pageSize)
  );
}

function defaultCoStarView(query: AppliedQuery): CoStarViewState {
  return Object.freeze({
    order: 'desc',
    page: 1,
    pageSize: 10,
    search: '',
    sort: query.scope === 'personal' ? 'personalScore' : 'globalScore',
  });
}

function canonicalCoStarInput(
  query: AppliedQuery,
  input: Readonly<CoStarInputV1>,
): Readonly<CoStarInputV1> | null {
  const queryPositions = new Set(query.positionKeys.map(String));
  if (
    input.participants.length < 2 ||
    input.participants.length > 10
  ) {
    return null;
  }
  const people = new Set<number>();
  let identityCount = 0;
  const participants = input.participants.map((participant) => {
    const personId = participant.personId;
    const positionKeys = participant.positionKeys.map(String);
    identityCount += positionKeys.length;
    if (
      !Number.isSafeInteger(personId) ||
      personId < 1 ||
      people.has(personId) ||
      positionKeys.length === 0 ||
      new Set(positionKeys).size !== positionKeys.length ||
      positionKeys.some((positionKey) => !queryPositions.has(positionKey))
    ) {
      return null;
    }
    people.add(personId);
    return Object.freeze({
      personId,
      positionKeys: Object.freeze([...positionKeys]),
    });
  });
  if (identityCount > 20 || participants.some((item) => item === null)) {
    return null;
  }
  return Object.freeze({
    participants: Object.freeze([...participants]),
  }) as Readonly<CoStarInputV1>;
}

function coStarInputEquals(
  left: Readonly<CoStarInputV1>,
  right: Readonly<CoStarInputV1>,
): boolean {
  return (
    left.participants.length === right.participants.length &&
    left.participants.every((participant, index) => {
      const compared = right.participants[index];
      const keys = participant.positionKeys.map(String);
      const comparedKeys = compared?.positionKeys.map(String) ?? [];
      return (
        participant.personId === compared?.personId &&
        keys.length === comparedKeys.length &&
        keys.every(
          (positionKey, positionIndex) =>
            positionKey === comparedKeys[positionIndex],
        )
      );
    })
  );
}

function partnersViewEquals(
  left: Readonly<PartnersViewState>,
  right: Readonly<PartnersViewState>,
): boolean {
  return (
    left.search === right.search &&
    left.sort === right.sort &&
    left.order === right.order &&
    left.page === right.page &&
    left.pageSize === right.pageSize
  );
}

function validPartnersView(
  query: AppliedQuery,
  view: Readonly<PartnersViewState>,
): boolean {
  return (
    [...view.search].length <= 256 &&
    ['count', 'average', 'overall', 'preference'].includes(view.sort) &&
    !(query.scope === 'global' && view.sort === 'preference') &&
    ['asc', 'desc'].includes(view.order) &&
    Number.isSafeInteger(view.page) &&
    view.page >= 1 &&
    [5, 10, 20].includes(view.pageSize)
  );
}

function canonicalPartnersInput(
  query: AppliedQuery,
  input: Readonly<PartnersInputV1>,
): Readonly<PartnersInputV1> | null {
  const personId = input.source.personId;
  const positionKeys = input.source.positionKeys.map(String);
  const queryPositions = new Set(query.positionKeys.map(String));
  const candidatePositionKey =
    input.candidatePositionKey === undefined
      ? undefined
      : String(input.candidatePositionKey);
  if (
    !Number.isSafeInteger(personId) ||
    personId < 1 ||
    positionKeys.length === 0 ||
    new Set(positionKeys).size !== positionKeys.length ||
    positionKeys.some((positionKey) => !queryPositions.has(positionKey)) ||
    (candidatePositionKey !== undefined &&
      !queryPositions.has(candidatePositionKey))
  ) {
    return null;
  }
  return Object.freeze({
    source: Object.freeze({
      personId,
      positionKeys: Object.freeze([...positionKeys]),
    }),
    ...(candidatePositionKey === undefined
      ? {}
      : { candidatePositionKey }),
  }) as Readonly<PartnersInputV1>;
}

function partnersInputEquals(
  left: Readonly<PartnersInputV1>,
  right: Readonly<PartnersInputV1>,
): boolean {
  const leftKeys = left.source.positionKeys.map(String);
  const rightKeys = right.source.positionKeys.map(String);
  return (
    left.source.personId === right.source.personId &&
    String(left.candidatePositionKey ?? '') ===
      String(right.candidatePositionKey ?? '') &&
    leftKeys.length === rightKeys.length &&
    leftKeys.every((positionKey, index) => positionKey === rightKeys[index])
  );
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
  PartnersPayload = unknown,
  CoStarPayload = unknown,
> {
  readonly candidates: OperationResource<
    CandidatePayload,
    CandidatesInputV1,
    CandidatesViewV1
  >;
  cancel(mode: QueryMode): void;
  cancelCoStar(feedback?: string): void;
  cancelPending(): void;
  cancelPartners(feedback?: string): void;
  clearCoStar(): void;
  clearPartners(): void;
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
  executeCoStar(
    input: Readonly<CoStarInputV1>,
    view?: Readonly<CoStarViewState>,
  ): Promise<boolean>;
  executeCoStarView(
    view: Readonly<CoStarViewState>,
  ): Promise<boolean>;
  executeRankingView(view: Readonly<RankingsViewState>): Promise<boolean>;
  executePersonDetail(
    personId: number,
    view?: Readonly<PersonDetailViewState>,
  ): Promise<boolean>;
  executePersonDetailView(
    view: Readonly<PersonDetailViewState>,
  ): Promise<boolean>;
  executePartners(
    input: Readonly<PartnersInputV1>,
    view?: Readonly<PartnersViewState>,
  ): Promise<boolean>;
  executePartnersView(
    view: Readonly<PartnersViewState>,
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
  readonly coStar: OperationResource<
    CoStarPayload,
    CoStarInputV1,
    CoStarViewState
  >;
  readonly personDetail: OperationResource<
    PersonDetailPayload,
    PersonDetailInputV1,
    PersonDetailViewState
  >;
  readonly partners: OperationResource<
    PartnersPayload,
    PartnersInputV1,
    PartnersViewState
  >;
}

export function createQueryCoordinator<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload = unknown,
  PartnersPayload = unknown,
  CoStarPayload = unknown,
>(
  store: QueryStore,
  drivers: QueryDrivers<
    RankingPayload,
    CandidatePayload,
    PersonDetailPayload,
    PartnersPayload,
    CoStarPayload
  >,
  onSuccessfulQuery?: (query: AppliedQuery) => void,
): QueryCoordinator<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload,
  PartnersPayload,
  CoStarPayload
> {
  const lastOperationFeedback = ref<OperationFeedback | null>(null);
  const pending = ref(false);
  const pendingOperation = ref<QueryOperation | null>(null);
  const sequences: Record<QueryOperation, number> = {
    candidates: 0,
    'co-star': 0,
    partners: 0,
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
  const coStar = shallowReactive<
    OperationResource<CoStarPayload, CoStarInputV1, CoStarViewState>
  >({
    acceptedQuery: null,
    error: null,
    feedback: null,
    input: Object.freeze({
      participants: Object.freeze([]),
    }) as unknown as Readonly<CoStarInputV1>,
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
      sort: 'globalScore',
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
  const partners = shallowReactive<
    OperationResource<PartnersPayload, PartnersInputV1, PartnersViewState>
  >({
    acceptedQuery: null,
    error: null,
    feedback: null,
    input: Object.freeze({
      source: Object.freeze({
        personId: 0,
        positionKeys: Object.freeze([]),
      }),
    }) as unknown as Readonly<PartnersInputV1>,
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
      | typeof coStar
      | typeof partners
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
          : operation === 'co-star'
            ? coStar
          : operation === 'partners'
            ? partners
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

  function clearCoStar(): void {
    const transaction = transactions['co-star'];
    if (transaction) {
      sequences['co-star'] += 1;
      transaction.controller.abort();
    }
    controllers['co-star']?.abort();
    controllers['co-star'] = undefined;
    transactions['co-star'] = undefined;
    coStar.acceptedQuery = null;
    coStar.error = null;
    coStar.feedback = null;
    coStar.input = Object.freeze({
      participants: Object.freeze([]),
    }) as unknown as Readonly<CoStarInputV1>;
    coStar.payload = null;
    coStar.phase = 'idle';
    coStar.requestId = null;
    coStar.revision = 0;
    coStar.staleCollection = false;
    coStar.view = Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'globalScore',
    });
    coStar.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'co-star') {
      lastOperationFeedback.value = null;
    }
  }

  function cancelCoStar(feedback = ''): void {
    cancelOperation('co-star', feedback);
  }

  function clearPartners(): void {
    const transaction = transactions.partners;
    if (transaction) {
      sequences.partners += 1;
      transaction.controller.abort();
    }
    controllers.partners?.abort();
    controllers.partners = undefined;
    transactions.partners = undefined;
    partners.acceptedQuery = null;
    partners.error = null;
    partners.feedback = null;
    partners.input = Object.freeze({
      source: Object.freeze({
        personId: 0,
        positionKeys: Object.freeze([]),
      }),
    }) as unknown as Readonly<PartnersInputV1>;
    partners.payload = null;
    partners.phase = 'idle';
    partners.requestId = null;
    partners.revision = 0;
    partners.staleCollection = false;
    partners.view = Object.freeze({
      order: 'desc',
      page: 1,
      pageSize: 10,
      search: '',
      sort: 'count',
    });
    partners.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'partners') {
      lastOperationFeedback.value = null;
    }
  }

  function cancelPartners(feedback = ''): void {
    cancelOperation('partners', feedback);
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
      if (!sameQuery) {
        clearCoStar();
        clearPartners();
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

  function readyCoStarQuery(): AppliedQuery | null {
    const query = readyCandidateQuery();
    if (
      !query ||
      !coStar.acceptedQuery ||
      coStar.payload === null ||
      coStar.phase !== 'ready' ||
      coStar.revision !== store.revision ||
      querySignature(coStar.acceptedQuery) !== querySignature(query)
    ) {
      return null;
    }
    return query;
  }

  async function executeCoStar(
    requestedInput: Readonly<CoStarInputV1>,
    requestedView?: Readonly<CoStarViewState>,
  ): Promise<boolean> {
    const query = readyCandidateQuery();
    if (!query) {
      coStar.error = '请先完成一次共演分析查询';
      coStar.phase = coStar.payload ? coStar.phase : 'error';
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    }
    const input = canonicalCoStarInput(query, requestedInput);
    if (!input) {
      coStar.error = '共演人物身份无效';
      coStar.phase = coStar.payload ? coStar.phase : 'error';
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    }

    const sameParticipants = coStarInputEquals(coStar.input, input);
    const reusableView =
      coStar.acceptedQuery !== null &&
      querySignature(coStar.acceptedQuery) === querySignature(query) &&
      validCoStarView(query, coStar.view)
        ? coStar.view
        : defaultCoStarView(query);
    const view = Object.freeze({
      order: requestedView?.order ?? reusableView.order,
      page: requestedView?.page ?? reusableView.page,
      pageSize: requestedView?.pageSize ?? reusableView.pageSize,
      search: requestedView?.search ?? reusableView.search,
      sort: requestedView?.sort ?? reusableView.sort,
      ...(!sameParticipants && !requestedView
        ? { page: 1, search: '' }
        : {}),
    }) as Readonly<CoStarViewState>;
    if (!validCoStarView(query, view)) {
      coStar.error = '共同作品视图参数无效';
      coStar.phase = coStar.payload ? coStar.phase : 'error';
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    }
    if (
      coStar.phase === 'ready' &&
      coStar.revision === store.revision &&
      coStarInputEquals(coStar.input, input) &&
      coStarViewEquals(coStar.view, view)
    ) {
      return true;
    }

    const existingTransaction = transactions['co-star'];
    controllers['co-star']?.abort();
    const controller = new AbortController();
    controllers['co-star'] = controller;
    const sequence = ++sequences['co-star'];
    const transaction = transactionId('co-star', sequence);
    const snapshot =
      existingTransaction?.snapshot ?? captureResource(coStar);
    transactions['co-star'] = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);

    coStar.acceptedQuery = query;
    coStar.error = null;
    coStar.feedback = null;
    coStar.input = input;
    coStar.phase = 'pending';
    coStar.revision = capturedRevision;
    coStar.view = view;
    coStar.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'co-star') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.coStar) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.coStar.execute({
        input,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view,
      });
      if (
        sequence !== sequences['co-star'] ||
        controller.signal.aborted ||
        controllers['co-star'] !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature ||
        !coStarInputEquals(coStar.input, input)
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      coStar.acceptedQuery = query;
      coStar.input = input;
      coStar.payload = response.payload;
      coStar.requestId = response.requestId;
      coStar.revision = capturedRevision;
      coStar.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      coStar.feedback = coStar.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      coStar.error = null;
      coStar.phase = 'ready';
      coStar.view = view;
      coStar.viewPending = false;
      if (coStar.feedback) {
        publishFeedback('co-star', coStar.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences['co-star'] ||
        controllers['co-star'] !== controller
      ) {
        return false;
      }
      restoreResource(coStar, snapshot);
      coStar.error = controller.signal.aborted
        ? '共演分析加载已取消'
        : resourceError(error);
      if (!coStar.requestId) {
        coStar.requestId = serverRequestId(error);
      }
      if (coStar.payload === null) {
        coStar.acceptedQuery = query;
        coStar.input = input;
        coStar.phase = 'error';
        coStar.revision = capturedRevision;
        coStar.view = view;
      }
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    } finally {
      if (controllers['co-star'] === controller) {
        controllers['co-star'] = undefined;
        transactions['co-star'] = undefined;
        coStar.viewPending = false;
      }
    }
  }

  async function executeCoStarView(
    requestedView: Readonly<CoStarViewState>,
  ): Promise<boolean> {
    const query = readyCoStarQuery();
    if (!query) {
      coStar.error = '请先选择至少两位人物进行共演分析';
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    }
    const view = Object.freeze(structuredClone(requestedView));
    if (!validCoStarView(query, view)) {
      coStar.error = '共同作品视图参数无效';
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    }
    if (!coStar.viewPending && coStarViewEquals(coStar.view, view)) {
      return true;
    }

    if (transactions['co-star']) {
      cancelOperation('co-star', '');
    }
    const controller = new AbortController();
    controllers['co-star'] = controller;
    const sequence = ++sequences['co-star'];
    const transaction = transactionId('co-star', sequence);
    const snapshot = captureResource(coStar);
    transactions['co-star'] = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);
    const capturedInput = coStar.input;

    coStar.error = null;
    coStar.feedback = null;
    coStar.view = view;
    coStar.viewPending = true;
    if (lastOperationFeedback.value?.operation === 'co-star') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.coStar) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.coStar.execute({
        input: capturedInput,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view,
      });
      if (
        sequence !== sequences['co-star'] ||
        controller.signal.aborted ||
        controllers['co-star'] !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature ||
        !coStarInputEquals(coStar.input, capturedInput)
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      coStar.payload = response.payload;
      coStar.requestId = response.requestId;
      coStar.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      coStar.feedback = coStar.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      coStar.error = null;
      coStar.phase = 'ready';
      coStar.view = view;
      coStar.viewPending = false;
      if (coStar.feedback) {
        publishFeedback('co-star', coStar.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences['co-star'] ||
        controllers['co-star'] !== controller
      ) {
        return false;
      }
      restoreResource(coStar, snapshot);
      coStar.error = controller.signal.aborted
        ? '共同作品加载已取消'
        : resourceError(error);
      publishFeedback('co-star', coStar.error, 'error');
      return false;
    } finally {
      if (controllers['co-star'] === controller) {
        controllers['co-star'] = undefined;
        transactions['co-star'] = undefined;
        coStar.viewPending = false;
      }
    }
  }

  function readyPartnersQuery(): AppliedQuery | null {
    const query = readyCandidateQuery();
    if (
      !query ||
      !partners.acceptedQuery ||
      partners.payload === null ||
      partners.phase !== 'ready' ||
      partners.revision !== store.revision ||
      querySignature(partners.acceptedQuery) !== querySignature(query)
    ) {
      return null;
    }
    return query;
  }

  async function executePartners(
    requestedInput: Readonly<PartnersInputV1>,
    requestedView?: Readonly<PartnersViewState>,
  ): Promise<boolean> {
    const query = readyCandidateQuery();
    if (!query) {
      partners.error = '请先完成一次共演分析查询';
      partners.phase = partners.payload ? partners.phase : 'error';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }
    const input = canonicalPartnersInput(query, requestedInput);
    if (!input) {
      partners.error = '合作人物来源身份无效';
      partners.phase = partners.payload ? partners.phase : 'error';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }
    if (
      requestedView &&
      query.scope === 'global' &&
      requestedView.sort === 'preference'
    ) {
      partners.error = '合作人物视图参数无效';
      partners.phase = partners.payload ? partners.phase : 'error';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }

    const priorInput = partners.input;
    const sameSource =
      priorInput.source.personId === input.source.personId &&
      priorInput.source.positionKeys.length ===
        input.source.positionKeys.length &&
      priorInput.source.positionKeys
        .map(String)
        .every(
          (positionKey, index) =>
            positionKey === String(input.source.positionKeys[index]),
        );
    const baseView: PartnersViewState = {
      order: requestedView?.order ?? partners.view.order ?? 'desc',
      page: requestedView?.page ?? partners.view.page ?? 1,
      pageSize: requestedView?.pageSize ?? partners.view.pageSize ?? 10,
      search: requestedView?.search ?? partners.view.search ?? '',
      sort: requestedView?.sort ?? partners.view.sort ?? 'count',
    };
    const view = Object.freeze({
      ...baseView,
      ...(!sameSource && !requestedView ? { page: 1, search: '' } : {}),
      ...(String(priorInput.candidatePositionKey ?? '') !==
        String(input.candidatePositionKey ?? '') &&
        !requestedView
        ? { page: 1 }
        : {}),
    }) as Readonly<PartnersViewState>;
    if (!validPartnersView(query, view)) {
      partners.error = '合作人物视图参数无效';
      partners.phase = partners.payload ? partners.phase : 'error';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }
    if (
      partners.phase === 'ready' &&
      partners.revision === store.revision &&
      partnersInputEquals(partners.input, input) &&
      partnersViewEquals(partners.view, view)
    ) {
      return true;
    }

    const existingTransaction = transactions.partners;
    controllers.partners?.abort();
    const controller = new AbortController();
    controllers.partners = controller;
    const sequence = ++sequences.partners;
    const transaction = transactionId('partners', sequence);
    const snapshot =
      existingTransaction?.snapshot ?? captureResource(partners);
    transactions.partners = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);

    partners.acceptedQuery = query;
    partners.error = null;
    partners.feedback = null;
    partners.input = input;
    partners.phase = 'pending';
    partners.revision = capturedRevision;
    partners.view = view;
    partners.viewPending = false;
    if (lastOperationFeedback.value?.operation === 'partners') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.partners) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.partners.execute({
        input,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view,
      });
      if (
        sequence !== sequences.partners ||
        controller.signal.aborted ||
        controllers.partners !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature ||
        !partnersInputEquals(partners.input, input)
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      partners.acceptedQuery = query;
      partners.input = input;
      partners.payload = response.payload;
      partners.requestId = response.requestId;
      partners.revision = capturedRevision;
      partners.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      partners.feedback = partners.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      partners.error = null;
      partners.phase = 'ready';
      partners.view = view;
      partners.viewPending = false;
      if (partners.feedback) {
        publishFeedback('partners', partners.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences.partners ||
        controllers.partners !== controller
      ) {
        return false;
      }
      restoreResource(partners, snapshot);
      partners.error = controller.signal.aborted
        ? '合作人物加载已取消'
        : resourceError(error);
      if (!partners.requestId) {
        partners.requestId = serverRequestId(error);
      }
      if (partners.payload === null) {
        partners.acceptedQuery = query;
        partners.input = input;
        partners.phase = 'error';
        partners.revision = capturedRevision;
        partners.view = view;
      }
      publishFeedback('partners', partners.error, 'error');
      return false;
    } finally {
      if (controllers.partners === controller) {
        controllers.partners = undefined;
        transactions.partners = undefined;
        partners.viewPending = false;
      }
    }
  }

  async function executePartnersView(
    requestedView: Readonly<PartnersViewState>,
  ): Promise<boolean> {
    const query = readyPartnersQuery();
    if (!query) {
      partners.error = '请先选择一位人物查看合作人物';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }
    const view = Object.freeze(structuredClone(requestedView));
    if (!validPartnersView(query, view)) {
      partners.error = '合作人物视图参数无效';
      publishFeedback('partners', partners.error, 'error');
      return false;
    }
    if (!partners.viewPending && partnersViewEquals(partners.view, view)) {
      return true;
    }

    if (transactions.partners) {
      cancelOperation('partners', '');
    }
    const controller = new AbortController();
    controllers.partners = controller;
    const sequence = ++sequences.partners;
    const transaction = transactionId('partners', sequence);
    const snapshot = captureResource(partners);
    transactions.partners = { controller, sequence, snapshot };
    const capturedRevision = store.revision;
    const capturedSignature = querySignature(query);
    const capturedInput = partners.input;

    partners.error = null;
    partners.feedback = null;
    partners.view = view;
    partners.viewPending = true;
    if (lastOperationFeedback.value?.operation === 'partners') {
      lastOperationFeedback.value = null;
    }

    try {
      if (!drivers.partners) {
        throw new QueryCapabilityUnavailableError();
      }
      const response = await drivers.partners.execute({
        input: capturedInput,
        query,
        refreshCollection: false,
        sequence,
        signal: controller.signal,
        transactionId: transaction,
        view,
      });
      if (
        sequence !== sequences.partners ||
        controller.signal.aborted ||
        controllers.partners !== controller ||
        store.revision !== capturedRevision ||
        !store.applied ||
        querySignature(store.applied) !== capturedSignature ||
        !partnersInputEquals(partners.input, capturedInput)
      ) {
        return false;
      }
      if (response.transactionId !== transaction) {
        throw new Error('Response transaction ID does not match the request');
      }

      partners.payload = response.payload;
      partners.requestId = response.requestId;
      partners.staleCollection =
        response.staleCollection === true ||
        response.warningCodes?.includes('COLLECTION_STALE') === true;
      partners.feedback = partners.staleCollection
        ? '收藏刷新未完成，当前显示最近一次可用数据'
        : null;
      partners.error = null;
      partners.phase = 'ready';
      partners.view = view;
      partners.viewPending = false;
      if (partners.feedback) {
        publishFeedback('partners', partners.feedback, 'warning');
      }
      return true;
    } catch (error) {
      if (
        sequence !== sequences.partners ||
        controllers.partners !== controller
      ) {
        return false;
      }
      restoreResource(partners, snapshot);
      partners.error = controller.signal.aborted
        ? '合作人物加载已取消'
        : resourceError(error);
      publishFeedback('partners', partners.error, 'error');
      return false;
    } finally {
      if (controllers.partners === controller) {
        controllers.partners = undefined;
        transactions.partners = undefined;
        partners.viewPending = false;
      }
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
    cancelCoStar,
    cancelPersonDetail,
    cancelPending,
    cancelPartners,
    candidates,
    clearCoStar,
    clearPersonDetail,
    clearPartners,
    execute,
    executeCandidateView,
    executeCoStar,
    executeCoStarView,
    executePartners,
    executePartnersView,
    executePersonDetail,
    executePersonDetailView,
    executeRankingView,
    coStar,
    lastOperationFeedback: readonly(lastOperationFeedback),
    pending: readonly(pending),
    pendingOperation: readonly(pendingOperation),
    partners,
    personDetail,
    rankings,
  };
}

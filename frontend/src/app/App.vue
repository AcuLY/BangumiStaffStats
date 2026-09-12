<!--
THESIS: 查询是正式应用的唯一入口，拒绝用假数据或结果卡片掩盖尚未接入的垂直能力。
OWN-WORLD: Bangumi 粉色、冷灰单层表面、固定 Header 与正文内高密度两阶段查询编辑器。
STORY: 用户选择数据范围与动态职位，清楚地应用、取消、恢复最后一次成功查询。
FIRST VIEWPORT: 品牌与双模式操作在 Header，完整查询 disclosure 位于正文首位，结果区保留可信空态。
FORM: 已建立的 Operate 世界；所有视口均使用正文内可折叠查询面板。
-->
<script setup lang="ts">
import AppViewport from './AppViewport.vue';
import { NButton } from 'naive-ui';
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
  type Component,
  type Ref,
  type ShallowRef,
} from 'vue';

import type { CandidatePayload } from '../api/adapters/candidates';
import type { CoStarPayload } from '../api/adapters/coStar';
import type { PartnersPayload } from '../api/adapters/partners';
import type { PersonDetailPayload } from '../api/adapters/personDetail';
import type { RankingPayload } from '../api/adapters/rankings';
import { createCandidatesDriver } from '../api/candidates';
import { createCatalogApi, type CatalogApi } from '../api/catalog';
import { createApiClient } from '../api/client';
import { createCoStarDriver } from '../api/coStar';
import { createPartnersDriver } from '../api/partners';
import { createPersonDetailDriver } from '../api/personDetail';
import { createRankingsDriver } from '../api/rankings';
import { useCatalogStore } from '../features/catalog/store';
import {
  coStarInputMatchesSelection,
  defaultCoStarView,
  type CoStarInput,
  type CoStarResource,
  type CoStarView,
} from '../features/co-star/coStar';
import type {
  CandidateInput,
  CandidateResource,
  CandidateView,
  SelectedIdentity,
} from '../features/co-star/model';
import { candidateParticipantsSignature, defaultCandidateView } from '../features/co-star/model';
import {
  defaultPartnersView,
  partnersInputMatchesSelection,
  type PartnersInput,
  type PartnersResource,
  type PartnersView,
} from '../features/co-star/partners';
import {
  createCoStarSelection,
  MAX_SELECTED_IDENTITIES,
  type CoStarSelection,
} from '../features/co-star/selection';
import MobileCandidateEntry from '../features/co-star/components/MobileCandidateEntry.vue';
import CandidateWorkspaceSkeleton from '../features/co-star/components/CandidateWorkspaceSkeleton.vue';
import RankingResultsSkeleton from '../features/ranking/components/RankingResultsSkeleton.vue';
import {
  defaultPersonDetailView,
  type PersonDetailView,
  type PersonPositionDisplay,
} from '../features/person-detail/model';
import PersonDetailSkeleton from '../features/person-detail/components/PersonDetailSkeleton.vue';
import { createPersonWorkspaceLinks, type LinkedPerson } from '../features/person-detail/workspaceLinks';
import AppHeader from '../features/query/components/AppHeader.vue';
import QueryIcon from '../features/query/components/QueryIcon.vue';
import QueryWorkspace from '../features/query/components/QueryWorkspace.vue';
import { useCompactLayout } from '../shared/composables/useCompactLayout';
import {
  createQueryCoordinator,
  type QueryDrivers,
} from '../features/query/coordinator';
import {
  draftFromEffective,
  querySignature,
  type AppliedQuery,
} from '../features/query/model';
import type {
  RecoveryPayload,
  RecoveryWorkspace,
} from '../features/query/recovery';
import { createQuerySessionOwner } from '../features/query/session';
import { useQueryStore } from '../features/query/store';
import AppIcon from '../shared/components/AppIcon.vue';
import DeferredSurfaceState from '../shared/components/DeferredSurfaceState.vue';
import AppProviders from './AppProviders.vue';
import { createRouteOwner } from './routes';
import { useRuntimeStore } from './store/runtime';
import { createThemeOwner } from './theme';

// These analysis layouts are only needed in co-star mode, after candidate loading.
const loadPartnersSkeleton = () => import('../features/co-star/components/PartnersSkeleton.vue');
const loadCoStarSkeleton = () => import('../features/co-star/components/CoStarAnalysisSkeleton.vue');
const PartnersSkeleton = defineAsyncComponent(loadPartnersSkeleton);
const CoStarAnalysisSkeleton = defineAsyncComponent(loadCoStarSkeleton);

type SurfaceModule = Readonly<{ default: Component }>;
type SurfaceLoader = () => Promise<SurfaceModule>;
const defaultRankingSurfaceModule = import(
  '../features/ranking/components/RankingResults.vue'
);

interface AppSurfaceLoaders {
  readonly coStar: SurfaceLoader;
  readonly coStarWorkspace: SurfaceLoader;
  readonly partners: SurfaceLoader;
  readonly personDetail: SurfaceLoader;
  readonly ranking: SurfaceLoader;
}

const defaultSurfaceLoaders: AppSurfaceLoaders = {
  coStar: () => import('../features/co-star/components/CoStarSurface.vue'),
  coStarWorkspace: () =>
    import('../features/co-star/components/CoStarWorkspace.vue'),
  partners: () =>
    import('../features/co-star/components/PartnersSurface.vue'),
  personDetail: () =>
    import(
      '../features/person-detail/components/PersonDetailSurface.vue'
    ),
  ranking: () => defaultRankingSurfaceModule,
};

function createDeferredSurface(
  loader: SurfaceLoader,
  recover?: () => boolean | Promise<boolean>,
): {
  readonly component: ShallowRef<Component | null>;
  readonly failed: Ref<boolean>;
  readonly load: () => Promise<boolean>;
} {
  const component: ShallowRef<Component | null> = shallowRef(null);
  const failed = ref(false);
  let pending: Promise<boolean> | null = null;

  function load(): Promise<boolean> {
    if (component.value) {
      return Promise.resolve(true);
    }
    if (pending) {
      return pending;
    }
    if (failed.value && recover) {
      const recovery = Promise.resolve()
        .then(recover)
        .catch(() => false)
        .finally(() => {
          if (pending === recovery) {
            pending = null;
          }
        });
      pending = recovery;
      return recovery;
    }
    failed.value = false;
    const request = Promise.resolve()
      .then(loader)
      .then((module) => {
        if (!module.default) {
          throw new TypeError('Deferred surface module has no default export');
        }
        component.value = module.default;
        return true;
      })
      .catch(() => {
        failed.value = true;
        return false;
      })
      .finally(() => {
        if (pending === request) {
          pending = null;
        }
      });
    pending = request;
    return request;
  }

  return { component, failed, load };
}

interface CoStarWorkspaceHandle {
  closePicker(): void;
  openPicker(trigger: HTMLElement): Promise<void>;
  revealAnalysis(): Promise<void>;
}

interface AppServices {
  readonly catalogApi: CatalogApi;
  readonly drivers: QueryDrivers<RankingPayload, unknown, unknown>;
  readonly surfaceLoaders: Partial<AppSurfaceLoaders>;
  readonly targetWindow: Window;
}

const props = defineProps<{
  services?: Partial<AppServices>;
}>();

const targetWindow = props.services?.targetWindow ?? window;
const surfaceLoaders: AppSurfaceLoaders = {
  ...defaultSurfaceLoaders,
  ...props.services?.surfaceLoaders,
};
const {
  component: CoStarWorkspaceComponent,
  failed: coStarWorkspaceLoadFailed,
  load: loadCoStarWorkspace,
} = createDeferredSurface(
  surfaceLoaders.coStarWorkspace,
  props.services?.surfaceLoaders?.coStarWorkspace
    ? undefined
    : recoverDeferredSurface,
);
const {
  component: PartnersSurfaceComponent,
  failed: partnersSurfaceLoadFailed,
  load: loadPartnersSurface,
} = createDeferredSurface(
  surfaceLoaders.partners,
  props.services?.surfaceLoaders?.partners
    ? undefined
    : recoverDeferredSurface,
);
const {
  component: CoStarSurfaceComponent,
  failed: coStarSurfaceLoadFailed,
  load: loadCoStarSurface,
} = createDeferredSurface(
  surfaceLoaders.coStar,
  props.services?.surfaceLoaders?.coStar
    ? undefined
    : recoverDeferredSurface,
);
const {
  component: PersonDetailSurfaceComponent,
  failed: personDetailSurfaceLoadFailed,
  load: loadPersonDetailSurface,
} = createDeferredSurface(
  surfaceLoaders.personDetail,
  props.services?.surfaceLoaders?.personDetail
    ? undefined
    : recoverDeferredSurface,
);
const {
  component: RankingResultsComponent,
  failed: rankingSurfaceLoadFailed,
  load: loadRankingSurface,
} = createDeferredSurface(
  surfaceLoaders.ranking,
  props.services?.surfaceLoaders?.ranking
    ? undefined
    : recoverDeferredSurface,
);
void loadRankingSurface();
const runtime = useRuntimeStore();
const catalogStore = useCatalogStore();
const queryStore = useQueryStore();
const route = createRouteOwner(targetWindow);
watch(() => route.mode.value, (mode) => {
  if (mode === 'co-star') {
    // Warm the small analysis layouts while the catalog/candidate requests run.
    // Actual surface loaders retain their existing error and retry ownership.
    void loadPartnersSkeleton().catch(() => {});
    void loadCoStarSkeleton().catch(() => {});
  }
}, { immediate: true });
const querySession = createQuerySessionOwner(targetWindow);
const themeOwner = createThemeOwner(targetWindow.document);
const routeError = ref<string | null>(null);
const querySessionReady = ref(false);
let initializationFinished = false;
let querySessionWriteBlocked = false;
const queryWorkspace = ref<InstanceType<typeof QueryWorkspace> | null>(null);
const queryEditing = ref(queryStore.applied === null);
const coStarWorkspaceHandle = ref<CoStarWorkspaceHandle | null>(null);
const coStarPickerExpanded = ref(false);
const selection: CoStarSelection = createCoStarSelection();
const candidateExpansionRequested = ref(-1);
let expandedCandidateRevision = -1;
const selectedPersonId = ref<number | null>(null);
const partnersIntent = shallowRef<Readonly<{
  input: Readonly<PartnersInput>;
  view: Readonly<PartnersView>;
}> | null>(null);
const coStarIntent = shallowRef<Readonly<{
  input: Readonly<CoStarInput>;
  view: Readonly<CoStarView>;
}> | null>(null);
const personDetailIntent = shallowRef<Readonly<{
  personId: number;
  view?: Readonly<PersonDetailView>;
}> | null>(null);
let replayingRankingWorkspace = false;
let replayingCoStarWorkspace = false;
const drawerOpen = ref(false);
const compact = useCompactLayout(targetWindow);
const detailDrawerLayout = useCompactLayout(targetWindow, 960);
const expandedPersonId = computed(() =>
  selectedPersonId.value !== null &&
  (!detailDrawerLayout.value || drawerOpen.value)
    ? selectedPersonId.value
    : null,
);

function revealQueryEditor(): void {
  void queryWorkspace.value?.openEditor({ reveal: true });
}

const fetchImplementation =
  targetWindow.fetch?.bind(targetWindow) ??
  globalThis.fetch?.bind(globalThis) ??
  (async () => {
    throw new TypeError('Fetch is unavailable');
  });
const apiClient = createApiClient(fetchImplementation);
const catalogApi =
  props.services?.catalogApi ??
  createCatalogApi(apiClient);
const partnersDriver = createPartnersDriver(apiClient);
const coStarDriver = createCoStarDriver(apiClient);
const drivers: QueryDrivers<
  RankingPayload,
  CandidatePayload,
  PersonDetailPayload,
  PartnersPayload,
  CoStarPayload
> =
  (props.services?.drivers as
    | QueryDrivers<
        RankingPayload,
        CandidatePayload,
        PersonDetailPayload,
        PartnersPayload,
        CoStarPayload
      >
    | undefined) ?? {
    candidates: createCandidatesDriver(apiClient),
    coStar: coStarDriver,
    partners: partnersDriver,
    personDetail: createPersonDetailDriver(apiClient),
    rankings: createRankingsDriver(apiClient),
  };
// Capture the actual request input so later Draft edits cannot relabel its loading view.
const pendingRankingsQuery = shallowRef<AppliedQuery | null>(null);
const pendingCandidatesQuery = shallowRef<AppliedQuery | null>(null);
const presentationDrivers: typeof drivers = {
  ...drivers,
  rankings: {
    execute(request) {
      pendingRankingsQuery.value = request.query;
      return drivers.rankings.execute(request);
    },
  },
  candidates: {
    execute(request) {
      pendingCandidatesQuery.value = request.query;
      return drivers.candidates.execute(request);
    },
  },
};
const coordinator = createQueryCoordinator(
  queryStore,
  presentationDrivers,
  (query, context) => {
    if (context.changed) {
      selection.clear();
      resetPersonDetailSelection();
      partnersIntent.value = null;
      coStarIntent.value = null;
      personDetailIntent.value = null;
    } else {
      rerunCurrentChild(context.operation);
    }
    if (
      context.operation === 'rankings' &&
      !replayingRankingWorkspace &&
      selectedPersonId.value === null
    ) {
      activateFirstRankingPerson();
    }
    if (
      context.operation === 'candidates' &&
      !replayingCoStarWorkspace &&
      selection.personCount.value === 0
    ) {
      activateDefaultCandidates();
    }
    if (context.operation === 'candidates' && !replayingCoStarWorkspace) {
      candidateExpansionRequested.value = queryStore.revision;
    }
    route.updateSuccessfulQuery(query);
    routeError.value = null;
    if (initializationFinished && querySessionWriteBlocked) {
      querySessionWriteBlocked = false;
      querySessionReady.value = true;
    }
  },
  { getCatalog: () => catalogStore.snapshot },
);

const personLinks = createPersonWorkspaceLinks({
  getCatalog: () => catalogStore.snapshot,
  drivers,
  query: () => queryStore.applied,
  revision: () => queryStore.revision,
  snapshot: () => coordinator.snapshotIdentity.value,
  rankingView: () => coordinator.rankings.view,
});
const inspectedPerson = personLinks.person;
const linkedRank = personLinks.location;
const linkedRankPending = personLinks.rankPending;
const linkedRankError = personLinks.rankError;
const linkError = ref<string | null>(null);
const linkNavigationPending = ref(false);
type ScrollPosition = { element: HTMLElement; top: number; left: number };
let detailOriginScroll: ScrollPosition[] = [];
let detailOriginTrigger: HTMLElement | null = null;
let navigationSequence = 0;
let navigationExpectedMode: 'ranking' | 'co-star' | null = null;

function captureScroll(trigger: HTMLElement): ScrollPosition[] {
  const positions: ScrollPosition[] = [];
  for (let element: HTMLElement | null = trigger; element; element = element.parentElement) {
    if (element.scrollHeight > element.clientHeight || element.scrollWidth > element.clientWidth) {
      positions.push({ element, top: element.scrollTop, left: element.scrollLeft });
    }
  }
  return positions;
}

async function restoreScroll(positions: ScrollPosition[], trigger?: HTMLElement | null): Promise<void> {
  await nextTick();
  for (const { element, top, left } of positions) {
    if (element.isConnected) { element.scrollTop = top; element.scrollLeft = left; }
  }
  if (trigger?.isConnected && !trigger.closest('[hidden], [inert]')) trigger.focus({ preventScroll: true });
}

async function inspectCoStarPerson(person: LinkedPerson, identities: readonly string[], trigger: HTMLElement): Promise<void> {
  if (!queryStore.applied || route.mode.value !== 'co-star') return;
  detailOriginScroll = captureScroll(trigger);
  detailOriginTrigger = trigger;
  linkError.value = null;
  personLinks.inspect(person, identities);
  await loadPersonDetailSurface();
  await nextTick();
  if (inspectedPerson.value && !detailDrawerLayout.value) {
    const panel = targetWindow.document.getElementById('co-star-person-detail-panel');
    panel?.scrollIntoView({ block: 'start' });
    panel?.querySelector<HTMLElement>('button')?.focus({ preventScroll: true });
  }
}

function closeCoStarPerson(restore = true): void {
  const wasOpen = inspectedPerson.value !== null;
  personLinks.close();
  if (wasOpen && restore) void restoreScroll(detailOriginScroll, detailOriginTrigger);
}

async function followRankingPerson(): Promise<void> {
  const payload = coordinator.personDetail.payload;
  const query = queryStore.applied;
  if (!query || !payload || linkNavigationPending.value) return;
  const next = selectedIdentities(payload.person, query.positionKeys.map(String));
  if (next.length > MAX_SELECTED_IDENTITIES) { linkError.value = `最多选择 ${MAX_SELECTED_IDENTITIES} 个身份`; return; }
  coordinator.cancelPartners();
  coordinator.cancelCoStar();
  const result = selection.replace(next);
  if (!result.ok) { linkError.value = result.message; return; }
  queryStore.setCoStarPositionScope('all', true);
  candidateExpansionRequested.value = queryStore.revision;
  drawerOpen.value = false;
  route.navigate('co-star');
  await nextTick();
  await revealCoStarAnalysis();
}

async function locateInspectedPerson(): Promise<void> {
  const person = inspectedPerson.value;
  const location = linkedRank.value;
  const query = queryStore.applied;
  if (!person || !location?.page || !query || linkNavigationPending.value) return;
  const view = { ...personLinks.rankingView.value, page: location.page, search: '' };
  const revision = queryStore.revision;
  const sequence = ++navigationSequence;
  linkNavigationPending.value = true;
  navigationExpectedMode = 'ranking';
  linkError.value = null;
  closeCoStarPerson(false);
  selectedPersonId.value = person.id;
  route.navigate('ranking');
  try {
    const ready = await coordinator.executeApplied({ catalog: catalogStore.snapshot, mode: 'ranking' });
    if (!ready || sequence !== navigationSequence || revision !== queryStore.revision || route.mode.value !== 'ranking') return;
    const loaded = await coordinator.executeRankingView(view);
    if (!loaded || sequence !== navigationSequence || revision !== queryStore.revision || route.mode.value !== 'ranking') return;
    const trigger = targetWindow.document.querySelector<HTMLElement>(`#mode-panel-ranking [data-person-id="${person.id}"]`);
    activatePerson(person.id, trigger ?? targetWindow.document.body);
    await nextTick();
    trigger?.scrollIntoView({ block: 'nearest' });
    if (!detailDrawerLayout.value) trigger?.focus({ preventScroll: true });
  } finally {
    if (sequence === navigationSequence) {
      linkNavigationPending.value = false;
      navigationExpectedMode = null;
    }
  }
}

const linkedDetailHasCharacters = computed(() => personLinks.positionKeys.value.some(
  (key) => catalogStore.snapshot?.positionsByKey.get(key)?.kind === 'cast',
));
watch(() => selection.identities.value, () => closeCoStarPerson(), { flush: 'sync' });
watch(() => queryStore.revision, () => {
  closeCoStarPerson(false);
  navigationSequence += 1;
  linkNavigationPending.value = false;
  navigationExpectedMode = null;
});

const desktopRankingCompanionPending = computed(
  () =>
    !detailDrawerLayout.value &&
    ((coordinator.rankings.phase === 'pending' &&
      (selectedPersonId.value === null || queryStore.dirty)) ||
      (selectedPersonId.value !== null &&
        coordinator.personDetail.phase === 'pending')),
);

const editorOwnedPrimaryFeedback = computed<Readonly<{
  message: string;
  operation: 'candidates' | 'rankings';
}> | null>(() => {
  if (!queryEditing.value) {
    return null;
  }
  const pendingPrimaryOperation = coordinator.pendingOperation.value;
  const localOperation =
    pendingPrimaryOperation === 'rankings' ||
    pendingPrimaryOperation === 'candidates'
      ? pendingPrimaryOperation
      : route.mode.value === 'ranking'
        ? 'rankings'
        : 'candidates';
  const localResource =
    localOperation === 'rankings'
      ? coordinator.rankings
      : coordinator.candidates;
  const localMessage = localResource.error ?? localResource.feedback;
  return localMessage
    ? Object.freeze({ message: localMessage, operation: localOperation })
    : null;
});
const editorOwnsRankingError = computed(
  () =>
    editorOwnedPrimaryFeedback.value?.operation === 'rankings' &&
    editorOwnedPrimaryFeedback.value.message === coordinator.rankings.error,
);
const editorOwnsCandidateError = computed(
  () =>
    editorOwnedPrimaryFeedback.value?.operation === 'candidates' &&
    editorOwnedPrimaryFeedback.value.message === coordinator.candidates.error,
);
const operationFeedback = computed(() => {
  const feedback = coordinator.lastOperationFeedback.value;
  const editorOwner = editorOwnedPrimaryFeedback.value;
  return feedback &&
    editorOwner?.operation === feedback.operation &&
    editorOwner.message === feedback.message
    ? null
    : feedback;
});
const coStarWorkspaceReady = computed(
  () =>
    queryStore.applied !== null &&
    coordinator.candidates.acceptedQuery !== null &&
    coordinator.candidates.revision === queryStore.revision &&
    querySignature(coordinator.candidates.acceptedQuery) ===
      querySignature(queryStore.applied) &&
    (coordinator.candidates.payload !== null ||
      coordinator.candidates.phase === 'pending' ||
      coordinator.candidates.error !== null),
);
const compactCandidateEntryVisible = computed(
  () =>
    route.mode.value === 'co-star' &&
    coStarWorkspaceReady.value,
);
const coStarScope = computed(
  () =>
    (coordinator.candidates.phase === 'pending' && !coordinator.candidates.viewPending
      ? pendingCandidatesQuery.value?.scope
      : coordinator.candidates.payload?.scope) ??
    queryStore.applied?.scope ??
    'global',
);
const coStarWorkUnit = computed(
  () =>
    (coordinator.candidates.phase === 'pending' && !coordinator.candidates.viewPending
      ? (pendingCandidatesQuery.value?.mergeSeries ? 'series' : 'subject')
      : coordinator.candidates.payload?.workUnit) ??
    (queryStore.applied?.mergeSeries ? 'series' : 'subject'),
);
const cooperationPositionKeys = computed(() => {
  const query = queryStore.applied;
  if (!query) return [];
  return (catalogStore.snapshot?.positions ?? [])
    .filter((position) => position.subjectType === query.subjectType && position.selectable
      && position.capabilities.includes('partners'))
    .map((position) => position.key);
});
const candidatesCorePending = computed(
  () => coordinator.candidates.phase === 'pending' && !coordinator.candidates.viewPending,
);
const pendingCoStarAnalysis = computed(() => {
  const shared = {
    scope: coStarScope.value,
    workUnit: coStarWorkUnit.value,
    positionLabel,
  };
  return selection.personCount.value === 1
    ? {
        component: PartnersSkeleton,
        props: {
          ...shared,
          source: selection.people.value[0]!,
          positionKeys: cooperationPositionKeys.value,
          pageSize: coordinator.partners.view.pageSize,
        },
      }
    : {
        component: CoStarAnalysisSkeleton,
        props: {
          ...shared,
          people: selection.people.value,
          pageSize: coordinator.coStar.view.pageSize,
        },
      };
});
const selectedCandidateParticipants = computed(() => selection.people.value.map((person) => ({
  personId: person.person.id,
  positionKeys: person.identities.map((identity) => identity.positionKey),
})));
const candidateSelectionMatches = computed(() =>
  candidateParticipantsSignature(coordinator.candidates.acceptedInput ?? {}) ===
  candidateParticipantsSignature({ participants: selectedCandidateParticipants.value }),
);
const candidateResource = computed<CandidateResource>(() => ({
  membershipValid: candidateSelectionMatches.value,
  error: coordinator.candidates.error,
  feedback: coordinator.candidates.feedback,
  input: Object.freeze({
    positionKey: coordinator.candidates.input.positionKey,
    positionScope: coordinator.candidates.input.positionScope,
  }),
  payload: coordinator.candidates.payload,
  phase: coordinator.candidates.phase,
  view: coordinator.candidates.view,
  viewPending: coordinator.candidates.viewPending || (
    !candidateSelectionMatches.value && !coordinator.candidates.error && !coordinator.candidates.feedback
  ),
}));
watch(
  () => [candidateExpansionRequested.value, route.mode.value,
    candidateParticipantsSignature({ participants: selectedCandidateParticipants.value })] as const,
  () => {
    const revision = queryStore.revision;
    if (route.mode.value !== 'co-star' || replayingCoStarWorkspace
      || coordinator.candidates.phase !== 'ready') return;
    const expand = expandedCandidateRevision !== revision && selection.personCount.value > 0;
    if (!expand && candidateSelectionMatches.value && !coordinator.candidates.viewPending) return;
    const input = {
      positionKey: expand ? null : coordinator.candidates.input.positionKey,
      positionScope: 'all' as const,
      participants: selectedCandidateParticipants.value,
    };
    if (coordinator.candidates.viewPending &&
      candidateParticipantsSignature(coordinator.candidates.input) === candidateParticipantsSignature(input)) return;
    expandedCandidateRevision = revision;
    const draftScopeAtStart = queryStore.coStarScopeDirty ? undefined : queryStore.coStarPositionScope;
    void executeCandidateView(input, { ...defaultCandidateView, ...coordinator.candidates.view, page: 1 })
      .then((accepted) => {
        if (accepted && queryStore.revision === revision) {
          queryStore.acceptCoStarPositionScope('all', draftScopeAtStart);
        }
      });
  },
  // The validity computed above hides old rows synchronously. Wait for the
  // primary query transaction to finish before starting the default refresh.
  { flush: 'post' },
);
const partnersResource = computed<PartnersResource>(() => ({
  error: coordinator.partners.error,
  feedback: coordinator.partners.feedback,
  input: Object.freeze({
    positionScope: coordinator.partners.input.positionScope,
    ...(typeof coordinator.partners.input.candidatePositionKey === 'string'
      ? {
          candidatePositionKey:
            coordinator.partners.input.candidatePositionKey,
        }
      : {}),
    source: Object.freeze({
      personId: coordinator.partners.input.source.personId,
      positionKeys: Object.freeze(
        coordinator.partners.input.source.positionKeys.map(String),
      ),
    }),
  }),
  payload: coordinator.partners.payload,
  phase: coordinator.partners.phase,
  requestId: coordinator.partners.requestId,
  view: coordinator.partners.view,
  viewPending: coordinator.partners.viewPending,
}));
const coStarResource = computed<CoStarResource>(() => ({
  error: coordinator.coStar.error,
  feedback: coordinator.coStar.feedback,
  input: Object.freeze({
    positionScope: coordinator.coStar.input.positionScope,
    participants: Object.freeze(
      coordinator.coStar.input.participants.map((participant) =>
        Object.freeze({
          personId: participant.personId,
          positionKeys: Object.freeze(
            participant.positionKeys.map(String),
          ),
        }),
      ),
    ),
  }),
  payload: coordinator.coStar.payload,
  phase: coordinator.coStar.phase,
  requestId: coordinator.coStar.requestId,
  view: coordinator.coStar.view,
  viewPending: coordinator.coStar.viewPending,
}));

function executeCandidateView(
  input: Readonly<CandidateInput>,
  view: Readonly<CandidateView>,
): Promise<boolean> {
  return coordinator.executeCandidateView(
    { positionKey: input.positionKey, positionScope: 'all', participants: selectedCandidateParticipants.value },
    view,
  );
}

function executePartners(
  input: Readonly<PartnersInput>,
  view: Readonly<PartnersView>,
): Promise<boolean> {
  const normalizedInput: Readonly<PartnersInput> = Object.freeze({
    positionScope: input.positionScope ?? 'all',
    source: Object.freeze({
      personId: input.source.personId,
      positionKeys: Object.freeze([...input.source.positionKeys]),
    }),
    ...(input.candidatePositionKey
      ? { candidatePositionKey: input.candidatePositionKey }
      : {}),
  });
  const normalizedView = Object.freeze(structuredClone(view));
  partnersIntent.value = Object.freeze({
    input: normalizedInput,
    view: normalizedView,
  });
  return coordinator.executePartners(
    {
      positionScope: normalizedInput.positionScope,
      source: {
        personId: normalizedInput.source.personId,
        positionKeys: [...normalizedInput.source.positionKeys],
      },
      ...(normalizedInput.candidatePositionKey
        ? {
            candidatePositionKey:
              normalizedInput.candidatePositionKey,
          }
        : {}),
    },
    normalizedView,
  );
}

function executePartnersView(
  view: Readonly<PartnersView>,
): Promise<boolean> {
  const prior = partnersIntent.value;
  if (prior) {
    partnersIntent.value = Object.freeze({
      input: prior.input,
      view: Object.freeze(structuredClone(view)),
    });
  }
  return coordinator.executePartnersView(view);
}

function executeCoStar(
  input: Readonly<CoStarInput>,
  view: Readonly<CoStarView>,
): Promise<boolean> {
  const normalizedInput: Readonly<CoStarInput> = Object.freeze({
    positionScope: input.positionScope ?? 'all',
    participants: Object.freeze(
      input.participants.map((participant) =>
        Object.freeze({
          personId: participant.personId,
          positionKeys: Object.freeze([
            ...participant.positionKeys,
          ]),
        }),
      ),
    ),
  });
  const normalizedView = Object.freeze(structuredClone(view));
  coStarIntent.value = Object.freeze({
    input: normalizedInput,
    view: normalizedView,
  });
  return coordinator.executeCoStar(
    {
      positionScope: normalizedInput.positionScope,
      participants: normalizedInput.participants.map(
        (participant) => ({
          personId: participant.personId,
          positionKeys: [...participant.positionKeys],
        }),
      ),
    },
    normalizedView,
  );
}

function executeCoStarView(
  view: Readonly<CoStarView>,
): Promise<boolean> {
  const prior = coStarIntent.value;
  if (prior) {
    coStarIntent.value = Object.freeze({
      input: prior.input,
      view: Object.freeze(structuredClone(view)),
    });
  }
  return coordinator.executeCoStarView(view);
}

const pendingDetailQuery = computed(() =>
  coordinator.rankings.phase === 'pending'
    ? pendingRankingsQuery.value ?? queryStore.draft
    : coordinator.personDetail.acceptedQuery ?? queryStore.applied ?? queryStore.draft,
);
const pendingDetailHasCharacters = computed(() =>
  pendingDetailQuery.value.positionKeys.some(
    (key) => catalogStore.snapshot?.positionsByKey.get(String(key))?.kind === 'cast',
  ),
);

function executePersonDetail(
  personId: number,
  view?: Readonly<PersonDetailView>,
): Promise<boolean> {
  personDetailIntent.value = Object.freeze({
    personId,
    ...(view
      ? { view: Object.freeze(structuredClone(view)) }
      : {}),
  });
  return coordinator.executePersonDetail(personId, view);
}

function executePersonDetailView(
  view: Readonly<PersonDetailView>,
): Promise<boolean> {
  if (selectedPersonId.value !== null) {
    personDetailIntent.value = Object.freeze({
      personId: selectedPersonId.value,
      view: Object.freeze(structuredClone(view)),
    });
  }
  return coordinator.executePersonDetailView(view);
}

function rerunCurrentChild(
  operation: 'candidates' | 'rankings',
): void {
  if (operation === 'rankings') {
    if (selectedPersonId.value !== null) {
      const intent =
        personDetailIntent.value?.personId ===
        selectedPersonId.value
          ? personDetailIntent.value
          : null;
      const currentView =
        coordinator.personDetail.input.personId ===
        selectedPersonId.value
          ? coordinator.personDetail.view
          : intent?.view;
      void executePersonDetail(
        selectedPersonId.value,
        currentView
          ? structuredClone(currentView)
          : undefined,
      );
    }
    return;
  }

  const people = selection.people.value;
  if (people.length === 1) {
    const source = people[0]!;
    const intent =
      partnersIntent.value &&
      partnersInputMatchesSelection(
        partnersIntent.value.input,
        source,
      )
        ? partnersIntent.value
        : null;
    const currentInput: PartnersInput = {
      positionScope: coordinator.partners.input.positionScope,
      ...(typeof coordinator.partners.input.candidatePositionKey ===
      'string'
        ? {
            candidatePositionKey:
              coordinator.partners.input.candidatePositionKey,
          }
        : {}),
      source: {
        personId: coordinator.partners.input.source.personId,
        positionKeys:
          coordinator.partners.input.source.positionKeys.map(String),
      },
    };
    const currentMatches =
      partnersInputMatchesSelection(currentInput, source);
    const replayInput = currentMatches ? currentInput : intent?.input;
    void executePartners(
      {
        positionScope: replayInput?.positionScope ?? 'all',
        ...(typeof replayInput?.candidatePositionKey === 'string'
          ? {
              candidatePositionKey:
                replayInput.candidatePositionKey,
            }
          : {}),
        source: {
          personId: source.person.id,
          positionKeys: source.identities.map(
            (identity) => identity.positionKey,
          ),
        },
      },
      structuredClone(
        currentMatches
          ? coordinator.partners.view
          : intent?.view ?? coordinator.partners.view,
      ),
    );
  } else if (people.length >= 2) {
    const intent =
      coStarIntent.value &&
      coStarInputMatchesSelection(
        coStarIntent.value.input,
        people,
      )
        ? coStarIntent.value
        : null;
    const currentInput: CoStarInput = {
      positionScope: coordinator.coStar.input.positionScope,
      participants: coordinator.coStar.input.participants.map(
        (participant) => ({
          personId: participant.personId,
          positionKeys: participant.positionKeys.map(String),
        }),
      ),
    };
    const currentMatches = coStarInputMatchesSelection(
      currentInput,
      people,
    );
    void executeCoStar(
      {
        positionScope: currentMatches ? currentInput.positionScope : intent?.input.positionScope,
        participants: people.map((person) => ({
          personId: person.person.id,
          positionKeys: person.identities.map(
            (identity) => identity.positionKey,
          ),
        })),
      },
      structuredClone(
        currentMatches
          ? coordinator.coStar.view
          : intent?.view ?? coordinator.coStar.view,
      ),
    );
  }
}

function resourceMatchesApplied(
  resource: Readonly<{
    acceptedQuery: AppliedQuery | null;
    revision: number;
  }>,
): boolean {
  return (
    queryStore.applied !== null &&
    resource.acceptedQuery !== null &&
    resource.revision === queryStore.revision &&
    querySignature(resource.acceptedQuery) ===
      querySignature(queryStore.applied)
  );
}

function loadAppliedMode(mode: 'ranking' | 'co-star'): void {
  if (!queryStore.applied) {
    return;
  }
  if (mode === 'ranking' && queryStore.applied.positionKeys.length === 0) {
    void queryWorkspace.value?.openEditor();
    return;
  }
  const resource =
    mode === 'ranking' ? coordinator.rankings : coordinator.candidates;
  if (resourceMatchesApplied(resource) || resource.phase === 'pending') {
    return;
  }
  void coordinator.executeApplied({
    catalog: catalogStore.snapshot,
    mode,
  });
}

const acceptedRecoveryWorkspace = computed<RecoveryWorkspace | null>(() => {
  if (!queryStore.applied) {
    return null;
  }
  if (route.mode.value === 'ranking') {
    if (
      !resourceMatchesApplied(coordinator.rankings) ||
      !coordinator.rankings.acceptedView
    ) {
      return null;
    }
    const acceptedDetailInput = coordinator.personDetail.acceptedInput;
    const acceptedDetailView = coordinator.personDetail.acceptedView;
    const detail =
      selectedPersonId.value !== null &&
      resourceMatchesApplied(coordinator.personDetail) &&
      acceptedDetailInput?.personId === selectedPersonId.value &&
      acceptedDetailView
        ? {
            input: structuredClone(acceptedDetailInput),
            view: structuredClone(acceptedDetailView),
          }
        : undefined;
    return {
      ...(detail ? { detail } : {}),
      kind: 'ranking',
      rankingsView: structuredClone(
        coordinator.rankings.acceptedView,
      ),
    };
  }
  const acceptedCandidateInput =
    coordinator.candidates.acceptedInput;
  const acceptedCandidateView =
    coordinator.candidates.acceptedView;
  if (
    !resourceMatchesApplied(coordinator.candidates) ||
    !acceptedCandidateInput ||
    !acceptedCandidateView
  ) {
    return null;
  }
  const candidates = {
      input: {
        positionKey: acceptedCandidateInput.positionKey,
        ...(acceptedCandidateInput.positionScope ? { positionScope: acceptedCandidateInput.positionScope } : {}),
        ...(acceptedCandidateInput.participants ? { participants: acceptedCandidateInput.participants.map((person) => ({ personId: person.personId, positionKeys: [...person.positionKeys] })) } : {}),
    },
    view: structuredClone(acceptedCandidateView),
  };
  const people = selection.people.value;
  if (people.length === 0) {
    return {
      candidates,
      kind: 'co-star',
      state: 'empty',
    };
  }
  if (people.length === 1) {
    const source = people[0]!;
    const acceptedInput = coordinator.partners.acceptedInput;
    const acceptedView = coordinator.partners.acceptedView;
    const normalizedInput: PartnersInput | null = acceptedInput
      ? {
          positionScope: acceptedInput.positionScope,
          ...(typeof acceptedInput.candidatePositionKey === 'string'
            ? {
                candidatePositionKey:
                  acceptedInput.candidatePositionKey,
              }
            : {}),
          source: {
            personId: acceptedInput.source.personId,
            positionKeys: acceptedInput.source.positionKeys.map(String),
          },
        }
      : null;
    if (
      resourceMatchesApplied(coordinator.partners) &&
      normalizedInput &&
      acceptedView &&
      partnersInputMatchesSelection(normalizedInput, source)
    ) {
      return {
        candidates,
        kind: 'co-star',
        partners: {
          input: {
            ...(normalizedInput.positionScope ? { positionScope: normalizedInput.positionScope } : {}),
            source: {
              personId: normalizedInput.source.personId,
              positionKeys: [...normalizedInput.source.positionKeys],
            },
            ...(normalizedInput.candidatePositionKey
              ? {
                  candidatePositionKey:
                    normalizedInput.candidatePositionKey,
                }
              : {}),
          },
          view: structuredClone(acceptedView),
        },
        state: 'partners',
      };
    }
    return null;
  }
  const acceptedInput = coordinator.coStar.acceptedInput;
  const acceptedView = coordinator.coStar.acceptedView;
  const normalizedInput: CoStarInput | null = acceptedInput
    ? {
        positionScope: acceptedInput.positionScope,
        participants: acceptedInput.participants.map((participant) => ({
          personId: participant.personId,
          positionKeys: participant.positionKeys.map(String),
        })),
      }
    : null;
  if (
    resourceMatchesApplied(coordinator.coStar) &&
    normalizedInput &&
    acceptedView &&
    coStarInputMatchesSelection(normalizedInput, people)
  ) {
    return {
      candidates,
      coStar: {
        input: {
          ...(normalizedInput.positionScope ? { positionScope: normalizedInput.positionScope } : {}),
          participants: normalizedInput.participants.map(
            (participant) => ({
              personId: participant.personId,
              positionKeys: [...participant.positionKeys],
            }),
          ),
        },
        view: structuredClone(acceptedView),
      },
      kind: 'co-star',
      state: 'analysis',
    };
  }
  return null;
});

const currentRecoveryPath = computed<'/co-star' | '/ranking'>(() =>
  route.mode.value === 'ranking' ? '/ranking' : '/co-star',
);

watch(
  [querySessionReady, currentRecoveryPath, acceptedRecoveryWorkspace],
  ([ready, path, workspace]) => {
    if (!ready || !workspace || !queryStore.applied) {
      return;
    }
    if (
      path === '/ranking' &&
      selectedPersonId.value !== null &&
      coordinator.personDetail.phase === 'pending'
    ) {
      const saved = querySession.read(path);
      if (
        saved?.workspace.kind === 'ranking' && saved.workspace.detail &&
        querySignature(saved.query) === querySignature(queryStore.applied)
      ) {
        return;
      }
    }
    querySession.write(path, queryStore.applied, workspace);
  },
  { flush: 'post' },
);

function primaryRecoveryWorkspace(): RecoveryWorkspace | null {
  if (!queryStore.applied) {
    return null;
  }
  if (route.mode.value === 'ranking') {
    if (
      !resourceMatchesApplied(coordinator.rankings) ||
      !coordinator.rankings.acceptedView
    ) {
      return null;
    }
    return {
      kind: 'ranking',
      rankingsView: structuredClone(
        coordinator.rankings.acceptedView,
      ),
    };
  }
  if (
    !resourceMatchesApplied(coordinator.candidates) ||
    !coordinator.candidates.acceptedInput ||
    !coordinator.candidates.acceptedView
  ) {
    return null;
  }
  return {
    candidates: {
      input: {
        positionKey: coordinator.candidates.input.positionKey,
        ...(coordinator.candidates.input.positionScope ? { positionScope: coordinator.candidates.input.positionScope } : {}),
        ...(coordinator.candidates.input.participants ? { participants: coordinator.candidates.input.participants.map((person) => ({ personId: person.personId, positionKeys: [...person.positionKeys] })) } : {}),
      },
      view: structuredClone(coordinator.candidates.view),
    },
    kind: 'co-star',
    state: 'empty',
  };
}

function intentRecoveryWorkspace(): RecoveryWorkspace | null {
  const primary = primaryRecoveryWorkspace();
  if (!primary) {
    return null;
  }
  if (primary.kind === 'ranking') {
    if (selectedPersonId.value === null) {
      return primary;
    }
    const intent =
      personDetailIntent.value?.personId === selectedPersonId.value
        ? personDetailIntent.value
        : null;
    const currentView =
      coordinator.personDetail.input.personId === selectedPersonId.value
        ? coordinator.personDetail.view
        : intent?.view ?? defaultPersonDetailView;
    return {
      detail: {
        input: { personId: selectedPersonId.value },
        view: structuredClone(currentView),
      },
      kind: 'ranking',
      rankingsView: primary.rankingsView,
    };
  }

  const people = selection.people.value;
  if (people.length === 0) {
    return primary;
  }
  if (people.length === 1) {
    const source = people[0]!;
    const intent =
      partnersIntent.value &&
      partnersInputMatchesSelection(partnersIntent.value.input, source)
        ? partnersIntent.value
        : null;
    const currentInput: PartnersInput = {
      positionScope: coordinator.partners.input.positionScope,
      ...(typeof coordinator.partners.input.candidatePositionKey ===
      'string'
        ? {
            candidatePositionKey:
              coordinator.partners.input.candidatePositionKey,
          }
        : {}),
      source: {
        personId: coordinator.partners.input.source.personId,
        positionKeys:
          coordinator.partners.input.source.positionKeys.map(String),
      },
    };
    const currentMatches =
      partnersInputMatchesSelection(currentInput, source);
    const recoveryInput = currentMatches
      ? currentInput
      : intent?.input;
    return {
      candidates: primary.candidates,
      kind: 'co-star',
      partners: {
        input: {
          positionScope: recoveryInput?.positionScope ?? 'all',
          ...(recoveryInput?.candidatePositionKey
            ? {
                candidatePositionKey:
                  recoveryInput.candidatePositionKey,
              }
            : {}),
          source: {
            personId: source.person.id,
            positionKeys: source.identities.map(
              (identity) => identity.positionKey,
            ),
          },
        },
        view: structuredClone(
          currentMatches
            ? coordinator.partners.view
            : intent?.view ?? defaultPartnersView,
        ),
      },
      state: 'partners',
    };
  }

  const intent =
    coStarIntent.value &&
    coStarInputMatchesSelection(coStarIntent.value.input, people)
      ? coStarIntent.value
      : null;
  const currentInput: CoStarInput = {
      positionScope: coordinator.coStar.input.positionScope,
    participants: coordinator.coStar.input.participants.map(
      (participant) => ({
        personId: participant.personId,
        positionKeys: participant.positionKeys.map(String),
      }),
    ),
  };
  const currentMatches = coStarInputMatchesSelection(
    currentInput,
    people,
  );
  const recoveryInput = currentMatches
    ? currentInput
    : intent?.input;
  return {
    candidates: primary.candidates,
    coStar: {
      input: {
        positionScope: recoveryInput?.positionScope ?? 'all',
        participants: (
          recoveryInput?.participants ??
          people.map((person) => ({
            personId: person.person.id,
            positionKeys: person.identities.map(
              (identity) => identity.positionKey,
            ),
          }))
        ).map((participant) => ({
          personId: participant.personId,
          positionKeys: [...participant.positionKeys],
        })),
      },
      view: structuredClone(
        currentMatches
          ? coordinator.coStar.view
          : intent?.view ??
              defaultCoStarView(queryStore.applied!.scope),
      ),
    },
    kind: 'co-star',
    state: 'analysis',
  };
}

function recoverDeferredSurface(): boolean {
  if (!queryStore.applied) {
    return false;
  }
  const path =
    route.mode.value === 'ranking' ? '/ranking' : '/co-star';
  let recoverySaved = false;
  for (const workspace of [
    intentRecoveryWorkspace(),
    acceptedRecoveryWorkspace.value,
    primaryRecoveryWorkspace(),
  ]) {
    if (!workspace) {
      continue;
    }
    if (querySession.write(path, queryStore.applied, workspace)) {
      recoverySaved = true;
      break;
    }
  }
  if (!recoverySaved) {
    return false;
  }
  try {
    targetWindow.document.documentElement.dataset.deferredSurfaceRecovery =
      'deferred-surface-reload-v1';
    targetWindow.location.reload();
    return true;
  } catch {
    return false;
  }
}

function positionLabel(positionKey: string): string {
  return (
    catalogStore.snapshot?.positionsByKey.get(positionKey)?.label ??
    positionKey
  );
}

function selectedIdentities(
  person: Readonly<{
    id: number;
    name: string;
    nameCN: string | null;
  }>,
  positionKeys: readonly string[],
): readonly SelectedIdentity[] {
  return Object.freeze(
    positionKeys.map((positionKey) =>
      Object.freeze({
        person: Object.freeze({
          id: person.id,
          name: person.name,
          nameCN: person.nameCN,
        }),
        positionKey,
        positionLabel: positionLabel(positionKey),
      }),
    ),
  );
}

function collectBoundedCandidateIdentities(
  items: CandidatePayload['items'],
): SelectedIdentity[] {
  const identities: SelectedIdentity[] = [];
  let selectedPeople = 0;

  for (const item of items) {
    if (selectedPeople >= 1) {
      break;
    }
    const itemIdentities = selectedIdentities(item.person, item.positionKeys);
    if (
      itemIdentities.length === 0 ||
      identities.length + itemIdentities.length > MAX_SELECTED_IDENTITIES
    ) {
      continue;
    }
    identities.push(...itemIdentities);
    selectedPeople += 1;
  }

  return identities;
}

function activateDefaultCandidates(): void {
  const payload = coordinator.candidates.payload;
  if (!payload || selection.personCount.value !== 0) {
    return;
  }
  const identities = collectBoundedCandidateIdentities(payload.items);
  if (identities.length > 0) {
    selection.replace(identities);
  }
}

function recoveryCandidateInput(
  input: Readonly<{
    positionKey: unknown;
    positionScope?: 'query' | 'all';
    participants?: readonly Readonly<{ personId: number; positionKeys: readonly unknown[] }>[];
  }>,
): Readonly<CandidateInput> {
  return Object.freeze({
    ...(input.positionScope ? { positionScope: input.positionScope } : {}),
    ...(input.participants ? {
      participants: input.participants.map((person) => ({
        personId: person.personId,
        positionKeys: person.positionKeys.map(String),
      })),
    } : {}),
    positionKey:
      input.positionKey === null ? null : String(input.positionKey),
  });
}

function installRecoveryWorkspace(payload: RecoveryPayload): void {
  if (payload.workspace.kind === 'ranking') {
    coordinator.rankings.view = Object.freeze({
      order: payload.workspace.rankingsView.order ?? 'desc',
      page: payload.workspace.rankingsView.page ?? 1,
      pageSize: payload.workspace.rankingsView.pageSize ?? 10,
      search: payload.workspace.rankingsView.search ?? '',
      sort: payload.workspace.rankingsView.sort ?? 'count',
    });
    return;
  }
  coordinator.candidates.input = recoveryCandidateInput(
    payload.workspace.candidates.input,
  );
  coordinator.candidates.view = Object.freeze(
    structuredClone(payload.workspace.candidates.view),
  );
}

async function replayRecovery(payload: RecoveryPayload): Promise<boolean> {
  if (payload.workspace.kind === 'co-star') {
    const workspace = payload.workspace;
    const participants = workspace.state === 'partners'
      ? [workspace.partners.input.source]
      : workspace.state === 'analysis' ? workspace.coStar.input.participants : [];
    const needsAllPositions = participants.some((person) =>
      person.positionKeys.some((key) => !payload.query.positionKeys.includes(String(key))),
    );
    payload = {
      ...payload,
      workspace: {
        ...workspace,
        candidates: {
          ...workspace.candidates,
          input: {
            ...workspace.candidates.input,
            ...(needsAllPositions ? { positionScope: 'all' as const } : {}),
            ...(participants.length > 0 || workspace.candidates.input.participants ? { participants } : {}),
          },
        },
      },
    };
  }
  queryStore.replaceDraft(draftFromEffective(payload.query));
  installRecoveryWorkspace(payload);
  const suppressAutomaticRankingDetail =
    payload.workspace.kind === 'ranking';
  const suppressAutomaticCoStarSelection =
    payload.workspace.kind === 'co-star';
  if (suppressAutomaticRankingDetail) {
    replayingRankingWorkspace = true;
  }
  if (suppressAutomaticCoStarSelection) {
    replayingCoStarWorkspace = true;
  }
  let primaryAccepted: boolean;
  try {
    primaryAccepted = await coordinator.execute({
      candidateInput:
        payload.workspace.kind === 'co-star'
          ? recoveryCandidateInput(payload.workspace.candidates.input)
          : undefined,
      candidateView:
        payload.workspace.kind === 'co-star'
          ? {
              ...defaultCandidateView,
              ...structuredClone(payload.workspace.candidates.view),
            }
          : undefined,
      catalog: catalogStore.snapshot,
      mode: payload.workspace.kind === 'ranking' ? 'ranking' : 'co-star',
    });
  } finally {
    if (suppressAutomaticRankingDetail) {
      replayingRankingWorkspace = false;
    }
    if (suppressAutomaticCoStarSelection) {
      replayingCoStarWorkspace = false;
    }
  }
  if (!primaryAccepted) {
    return false;
  }
  if (payload.workspace.kind === 'co-star') {
    expandedCandidateRevision = queryStore.revision;
    queryStore.setCoStarPositionScope(payload.workspace.candidates.input.positionScope ?? 'query', true);
  }
  if (payload.workspace.kind === 'ranking') {
    const detail = payload.workspace.detail;
    if (detail) {
      const section = detail.view.section ?? defaultPersonDetailView.section;
      const detailView: PersonDetailView = Object.freeze({
        order: detail.view.order ?? defaultPersonDetailView.order,
        page: detail.view.page ?? defaultPersonDetailView.page,
        pageSize:
          detail.view.pageSize ?? defaultPersonDetailView.pageSize,
        search: detail.view.search ?? defaultPersonDetailView.search,
        section,
        sort:
          detail.view.sort ??
          (section === 'characters' ? 'role' : 'globalScore'),
      });
      const detailAccepted = await executePersonDetail(
        detail.input.personId,
        detailView,
      );
      if (!detailAccepted) {
        return false;
      }
      selectedPersonId.value = detail.input.personId;
      // Selection is recoverable; opening the mobile drawer requires activation.
      drawerOpen.value = false;
    }
    queryWorkspace.value?.closeForExternalAction();
    await nextTick();
    return true;
  }
  if (payload.workspace.state === 'empty') {
    selection.clear();
    queryWorkspace.value?.closeForExternalAction();
    await nextTick();
    return true;
  }
  if (payload.workspace.state === 'partners') {
    const partnersView = Object.freeze({
      ...defaultPartnersView,
      ...structuredClone(payload.workspace.partners.view),
    });
    const accepted = await executePartners(
      {
        positionScope: payload.workspace.partners.input.positionScope ?? 'query',
        ...(typeof payload.workspace.partners.input
          .candidatePositionKey === 'string'
          ? {
              candidatePositionKey:
                payload.workspace.partners.input
                  .candidatePositionKey,
            }
          : {}),
        source: {
          personId:
            payload.workspace.partners.input.source.personId,
          positionKeys:
            payload.workspace.partners.input.source.positionKeys.map(
              String,
            ),
        },
      },
      partnersView,
    );
    const source = coordinator.partners.payload?.source;
    if (!accepted || !source) {
      return false;
    }
    const restored = selection.replace(
      selectedIdentities(source.person, source.positionKeys),
    ).ok;
    if (restored) {
      queryWorkspace.value?.closeForExternalAction();
      await nextTick();
    }
    return restored;
  }
  const coStarView = Object.freeze({
    ...defaultCoStarView(payload.query.scope),
    ...structuredClone(payload.workspace.coStar.view),
  });
  const accepted = await executeCoStar(
    {
      positionScope: payload.workspace.coStar.input.positionScope ?? 'query',
      participants:
        payload.workspace.coStar.input.participants.map(
          (participant) => ({
            personId: participant.personId,
            positionKeys: participant.positionKeys.map(String),
          }),
        ),
    },
    coStarView,
  );
  const participants = coordinator.coStar.payload?.data.participants;
  if (!accepted || !participants) {
    return false;
  }
  const restored = selection.replace(
    participants.flatMap((participant) =>
      selectedIdentities(
        participant.person,
        participant.positionKeys.map(String),
      ),
    ),
  ).ok;
  if (restored) {
    queryWorkspace.value?.closeForExternalAction();
    await nextTick();
  }
  return restored;
}

async function loadCatalog(): Promise<boolean> {
  return catalogStore.load(catalogApi);
}

async function retryRanking(): Promise<boolean> {
  return coordinator.execute({
    catalog: catalogStore.snapshot,
    mode: 'ranking',
  });
}

async function retryCandidates(): Promise<boolean> {
  if (queryStore.applied && coordinator.candidates.phase === 'ready') {
    return executeCandidateView(coordinator.candidates.input, { ...defaultCandidateView, ...coordinator.candidates.view,
      ...(!candidateSelectionMatches.value ? { page: 1 } : {}) });
  }
  return coordinator.execute({
    candidateInput: coordinator.candidates.input,
    catalog: catalogStore.snapshot,
    mode: 'co-star',
  });
}

async function closeQueryBeforePicker(): Promise<boolean> {
  const closed =
    queryWorkspace.value?.closeForExternalAction() ?? true;
  if (closed) {
    await nextTick();
  }
  return closed;
}

async function openHeaderCandidatePicker(
  trigger: HTMLElement,
): Promise<void> {
  if (
    !coStarWorkspaceHandle.value &&
    !(await loadCoStarWorkspace())
  ) {
    return;
  }
  await nextTick();
  await coStarWorkspaceHandle.value?.openPicker(trigger);
}

async function revealCoStarAnalysis(): Promise<void> {
  if (selection.personCount.value < 2) {
    return;
  }
  await nextTick();
  await coStarWorkspaceHandle.value?.revealAnalysis();
}

function positionDisplay(
  positionKey: string,
  exactPositionKey?: string,
): PersonPositionDisplay {
  const catalog = catalogStore.snapshot;
  const selected = catalog?.positionsByKey.get(positionKey);
  const exact = exactPositionKey
    ? catalog?.positionsByKey.get(exactPositionKey)
    : undefined;
  if (selected?.kind === 'staffSet') {
    return Object.freeze({
      ...(exact?.label
        ? { detail: `具体职位：${exact.label}` }
        : {}),
      label: selected.label,
    });
  }
  return Object.freeze({
    label: exact?.label ?? selected?.label ?? '职员',
  });
}

function activatePerson(
  personId: number,
  _trigger: HTMLElement,
): void {
  selectedPersonId.value = personId;
  void loadPersonDetailSurface();
  if (detailDrawerLayout.value) {
    drawerOpen.value = true;
  }
  void executePersonDetail(personId);
}

function activateFirstRankingPerson(): void {
  const firstPersonId = coordinator.rankings.payload?.items[0]?.person.id;
  if (typeof firstPersonId !== 'number') {
    return;
  }
  selectedPersonId.value = firstPersonId;
  void loadPersonDetailSurface();
  drawerOpen.value = false;
  void executePersonDetail(firstPersonId);
}

function closePersonDrawer(): void {
  drawerOpen.value = false;
}

function resetPersonDetailSelection(): void {
  selectedPersonId.value = null;
  drawerOpen.value = false;
}

async function initialize(): Promise<void> {
  runtime.markReady();
  const sessionPath = currentRecoveryPath.value;
  const savedSession = querySession.read(sessionPath);
  if (!savedSession) {
    queryStore.draft.uid = route.prefilledUser();
  }
  try {
    await loadCatalog();
    if (savedSession && currentRecoveryPath.value === sessionPath) {
      let restored = false;
      try {
        restored = await replayRecovery(savedSession);
      } catch {
        restored = false;
      }
      if (!restored) {
        querySessionWriteBlocked = true;
        routeError.value =
          '已恢复查询设置，但结果暂时无法重新加载；可重试后再次查询';
      }
    }
  } finally {
    initializationFinished = true;
    querySessionReady.value = !querySessionWriteBlocked;
  }
}

onMounted(initialize);

watch(
  () => coordinator.personDetail.phase,
  (phase) => {
    if (phase === 'idle' && selectedPersonId.value !== null) {
      resetPersonDetailSelection();
    }
  },
);
watch(detailDrawerLayout, (isCompact) => {
  if (!isCompact) {
    drawerOpen.value = false;
  }
});
watch(
  () => selection.personCount.value,
  (count) => {
    if (count === 1) {
      void loadPartnersSurface();
    } else if (count >= 2) {
      void loadCoStarSurface();
    }
    if (count !== 1) {
      coordinator.cancelPartners('');
    }
    if (count < 2) {
      coordinator.cancelCoStar('');
    }
  },
  { flush: 'sync' },
);
watch(
  [
    () => route.mode.value,
    () => coordinator.candidates.phase,
  ],
  ([mode, phase]) => {
    if (mode === 'co-star' && phase !== 'idle') {
      void loadCoStarWorkspace();
    }
  },
  { immediate: true },
);
watch(
  () => coordinator.rankings.phase,
  (phase) => {
    if (phase !== 'idle') {
      void loadPersonDetailSurface();
    }
  },
  { immediate: true },
);
watch(
  () => route.mode.value,
  (mode) => {
    closeCoStarPerson(false);
    if (navigationExpectedMode && mode !== navigationExpectedMode) {
      navigationSequence += 1;
      linkNavigationPending.value = false;
      navigationExpectedMode = null;
    }
    if (mode !== 'co-star') {
      coStarWorkspaceHandle.value?.closePicker();
    }
    if (mode !== 'ranking' && drawerOpen.value) {
      drawerOpen.value = false;
      void nextTick().then(() => {
        targetWindow.document.getElementById(`mode-tab-${mode}`)?.focus();
      });
    }
    if (!linkNavigationPending.value) loadAppliedMode(mode);
  },
);

onBeforeUnmount(() => {
  personLinks.close();
  coordinator.clearPersonDetail();
  coordinator.cancel('ranking');
  coordinator.cancel('co-star');
  coordinator.cancelCoStar('');
  coordinator.cancelPartners('');
  catalogStore.cancel();
  route.dispose();
  themeOwner.dispose();
});
</script>

<template>
  <app-providers :theme="themeOwner.theme.value">
    <app-viewport
      :target-window="targetWindow"
      data-app-root
      :data-app-ready="runtime.isReady ? 'true' : 'false'"
      :data-runtime-phase="runtime.phase"
    >
      <template #header>
        <app-header
          :mode="route.mode.value"
          :navigate="route.navigate"
          :target-window="targetWindow"
          :theme="themeOwner.theme.value"
          :toggle-theme="themeOwner.toggle"
        />
      </template>

        <main id="main-content" class="app-main">
          <query-workspace
            ref="queryWorkspace"
            :catalog-store="catalogStore"
            :coordinator="coordinator"
            :mode="route.mode.value"
            :query-store="queryStore"
            :retry-catalog="loadCatalog"
            :target-window="targetWindow"
            @editing-change="queryEditing = $event"
          />

          <p
            v-if="operationFeedback"
            class="app-query-feedback"
            :class="{
              'app-query-feedback--error': operationFeedback.kind === 'error',
            }"
            :data-operation="operationFeedback.operation"
            role="status"
            aria-live="polite"
          >
            {{ operationFeedback.message }}
          </p>
          <p v-if="routeError" class="app-local-error" role="alert">
            {{ routeError }}
          </p>
          <p v-if="linkError" class="app-local-error" role="alert">{{ linkError }}</p>

          <section
            id="mode-panel-ranking"
            class="app-mode-panel"
            role="tabpanel"
            aria-labelledby="mode-tab-ranking"
            :hidden="route.mode.value !== 'ranking'"
            :inert="route.mode.value !== 'ranking' ? true : undefined"
          >
            <div
              v-if="
                coordinator.rankings.phase === 'pending' ||
                coordinator.rankings.payload !== null ||
                coordinator.rankings.error !== null
              "
              class="ranking-workspace"
              :class="{
                'ranking-workspace--single':
                  detailDrawerLayout ||
                  coordinator.rankings.phase !== 'pending' &&
                  selectedPersonId === null,
              }"
            >
              <component
                :is="RankingResultsComponent"
                v-if="RankingResultsComponent"
                :device-pixel-ratio="targetWindow.devicePixelRatio"
                :expanded-person-id="expandedPersonId"
                :execute-view="coordinator.executeRankingView"
                :pending-personal="pendingDetailQuery.scope === 'personal'"
                :pending-has-character-count="pendingDetailHasCharacters"
                :pending-work-unit="pendingDetailQuery.mergeSeries ? 'series' : 'subject'"
                :resource="coordinator.rankings"
                :retry="retryRanking"
                :selected-person-id="selectedPersonId"
                :suppress-error-message="editorOwnsRankingError"
                @activate="activatePerson"
              />
              <deferred-surface-state
                v-else
                :error="rankingSurfaceLoadFailed"
                error-title="人物排行界面加载失败"
                loading-title="正在加载人物排行界面"
                @retry="loadRankingSurface"
              >
                <template #loading>
                  <ranking-results-skeleton
                    :personal="pendingDetailQuery.scope === 'personal'"
                    :has-character-count="pendingDetailHasCharacters"
                    :work-unit="pendingDetailQuery.mergeSeries ? 'series' : 'subject'"
                    :view="coordinator.rankings.view"
                    :page-size="coordinator.rankings.view.pageSize"
                  />
                </template>
              </deferred-surface-state>
              <aside
                v-if="desktopRankingCompanionPending"
                id="person-detail-panel"
                class="person-detail-surface surface-panel"
                aria-label="人物详情"
                :aria-hidden="
                  coordinator.rankings.phase === 'pending' ? 'true' : undefined
                "
              >
                <person-detail-skeleton
                  :personal="pendingDetailQuery.scope === 'personal'"
                  :has-character-count="pendingDetailHasCharacters"
                  :work-unit="pendingDetailQuery.mergeSeries ? 'series' : 'subject'"
                  :section="coordinator.personDetail.view.section"
                  :page-size="coordinator.personDetail.view.pageSize"
                />
              </aside>
              <component
                :is="PersonDetailSurfaceComponent"
                v-else-if="
                  PersonDetailSurfaceComponent && selectedPersonId !== null
                "
                :compact="detailDrawerLayout"
                :device-pixel-ratio="targetWindow.devicePixelRatio"
                :execute-view="executePersonDetailView"
                :open="selectedPersonId !== null && drawerOpen"
                :position-label="positionDisplay"
                :resource="coordinator.personDetail"
                :has-character-count="pendingDetailHasCharacters"
                :retry="executePersonDetail"
                :target-window="targetWindow"
                @close="closePersonDrawer"
              >
                <template #profile-action>
                  <n-button :size="compact ? 'small' : 'medium'" :disabled="coordinator.personDetail.phase !== 'ready'" icon-placement="right" @click="followRankingPerson">
                    查看共演
                    <template #icon><app-icon name="chevron-right" :size="16" /></template>
                  </n-button>
                </template>
              </component>
              <deferred-surface-state
                v-else-if="
                  selectedPersonId !== null &&
                  (!detailDrawerLayout || drawerOpen)
                "
                :error="personDetailSurfaceLoadFailed"
                error-title="人物详情加载失败"
                loading-title="正在加载人物详情"
                @retry="loadPersonDetailSurface"
              >
                <template #loading>
                  <person-detail-skeleton
                    :personal="pendingDetailQuery.scope === 'personal'"
                    :has-character-count="pendingDetailHasCharacters"
                    :work-unit="pendingDetailQuery.mergeSeries ? 'series' : 'subject'"
                    :section="coordinator.personDetail.view.section"
                    :page-size="coordinator.personDetail.view.pageSize"
                  />
                </template>
              </deferred-surface-state>
            </div>

            <section
              v-else-if="!queryStore.applied"
              class="query-result-state ranking-page-empty-state"
              aria-labelledby="ranking-query-empty-title"
            >
              <span class="state-icon">
                <query-icon name="search" :size="28" />
              </span>
              <h1 id="ranking-query-empty-title">尚未开始查询</h1>
            </section>

          </section>

          <section
            id="mode-panel-co-star"
            class="app-mode-panel"
            role="tabpanel"
            aria-labelledby="mode-tab-co-star"
            :hidden="route.mode.value !== 'co-star'"
            :inert="route.mode.value !== 'co-star' ? true : undefined"
          >
            <mobile-candidate-entry
              v-if="compactCandidateEntryVisible"
              class="co-star-content-entry"
              :expanded="coStarPickerExpanded"
              :selection="selection"
              @toggle="openHeaderCandidatePicker"
            />
            <component
              :is="CoStarWorkspaceComponent"
              v-if="
                coStarWorkspaceReady && CoStarWorkspaceComponent
              "
              ref="coStarWorkspaceHandle"
              :before-open-picker="closeQueryBeforePicker"
              :analysis-pending="candidatesCorePending"
              :cancel="() => coordinator.cancel('co-star')"
              :device-pixel-ratio="targetWindow.devicePixelRatio"
              :execute-view="executeCandidateView"
              external-owns-mobile-entry
              :position-label="positionLabel"
              :resource="candidateResource"
              :retry="retryCandidates"
              :selection="selection"
              :suppress-error-message="editorOwnsCandidateError"
              :target-window="targetWindow"
              @picker-open-change="coStarPickerExpanded = $event"
            >
              <template #analysis-loading>
                <component
                  :is="pendingCoStarAnalysis.component"
                  v-bind="pendingCoStarAnalysis.props"
                />
              </template>
              <template #analysis>
                <component
                  :is="PersonDetailSurfaceComponent"
                  v-if="(inspectedPerson || detailDrawerLayout) && PersonDetailSurfaceComponent"
                  panel-id="co-star-person-detail-panel"
                  :return-focus="detailOriginTrigger"
                  inline
                  :compact="detailDrawerLayout"
                  :open="Boolean(inspectedPerson) && route.mode.value === 'co-star'"
                  :device-pixel-ratio="targetWindow.devicePixelRatio"
                  :execute-view="personLinks.loadDetail"
                  :position-label="positionDisplay"
                  :resource="personLinks.detail"
                  :has-character-count="linkedDetailHasCharacters"
                  :retry="() => personLinks.loadDetail()"
                  :target-window="targetWindow"
                  @close="closeCoStarPerson()"
                >
                  <template #actions>
                    <n-button v-if="!detailDrawerLayout" :size="compact ? 'small' : 'medium'" @click="closeCoStarPerson()">返回共演分析</n-button>
                    <n-button
                      :size="compact ? 'small' : 'medium'"
                      :loading="linkedRankPending || linkNavigationPending"
                      :disabled="!linkedRankError && !linkedRankPending && linkedRank?.page == null"
                      @click="linkedRankError ? personLinks.loadRank() : locateInspectedPerson()"
                    >{{ linkedRankError ? '重试排名' : '在排行中查看' }}</n-button>
                    <span v-if="linkedRankError || (linkedRank && linkedRank.rank === null)" class="person-workspace-notice" role="status">{{ linkedRankError || '未进入当前榜单：不满足当前查询的全部职位条件' }}</span>
                  </template>
                </component>
                <deferred-surface-state v-else-if="inspectedPerson" :error="personDetailSurfaceLoadFailed" error-title="人物详情加载失败" loading-title="正在加载人物详情" @retry="loadPersonDetailSurface">
                  <template #loading><person-detail-skeleton :personal="coStarScope === 'personal'" :has-character-count="linkedDetailHasCharacters" :work-unit="coStarWorkUnit" :section="personLinks.detail.view.section" :page-size="personLinks.detail.view.pageSize" /></template>
                </deferred-surface-state>
                <div :hidden="Boolean(inspectedPerson && !detailDrawerLayout)" :inert="inspectedPerson && !detailDrawerLayout ? true : undefined">
                <template v-if="selection.personCount.value === 1">
                  <component
                    :is="PartnersSurfaceComponent"
                    v-if="PartnersSurfaceComponent"
                    :cancel="coordinator.cancelPartners"
                    :device-pixel-ratio="targetWindow.devicePixelRatio"
                    :execute="executePartners"
                    :execute-view="executePartnersView"
                    :position-keys="cooperationPositionKeys"
                    :position-label="positionLabel"
                    :resource="partnersResource"
                    :scope="coStarScope"
                    :selection="selection"
                    :source="selection.people.value[0]!"
                     :target-window="targetWindow"
                     :work-unit="coStarWorkUnit"
                     @partner-activated="revealCoStarAnalysis"
                     @inspect-person="inspectCoStarPerson"
                   />
                  <deferred-surface-state
                    v-else
                    :error="partnersSurfaceLoadFailed"
                    error-title="合作人物加载失败"
                    loading-title="正在加载合作人物分析"
                    @retry="loadPartnersSurface"
                  >
                    <template #loading>
                      <partners-skeleton
                        :source="selection.people.value[0]!"
                        :scope="coStarScope"
                        :work-unit="coStarWorkUnit"
                        :page-size="coordinator.partners.view.pageSize"
                        :position-label="positionLabel"
                        :position-keys="cooperationPositionKeys"
                      />
                    </template>
                  </deferred-surface-state>
                </template>
                <template
                  v-else-if="selection.personCount.value >= 2"
                >
                  <component
                    :is="CoStarSurfaceComponent"
                    v-if="CoStarSurfaceComponent"
                    :cancel="coordinator.cancelCoStar"
                    :device-pixel-ratio="targetWindow.devicePixelRatio"
                    :execute="executeCoStar"
                    :execute-view="executeCoStarView"
                    :position-label="positionLabel"
                    :resource="coStarResource"
                    :scope="coStarScope"
                    :selection="selection"
                    :work-unit="coStarWorkUnit"
                    @inspect-person="inspectCoStarPerson"
                  />
                  <deferred-surface-state
                    v-else
                    :error="coStarSurfaceLoadFailed"
                    error-title="共演分析暂时无法加载"
                    :loading-title="`正在加载 ${selection.personCount.value} 人共演分析`"
                    retry-label="重新加载"
                    @retry="loadCoStarSurface"
                  >
                    <template #loading>
                      <co-star-analysis-skeleton
                        :people="selection.people.value"
                        :scope="coStarScope"
                        :work-unit="coStarWorkUnit"
                        :page-size="coordinator.coStar.view.pageSize"
                        :position-label="positionLabel"
                      />
                    </template>
                  </deferred-surface-state>
                </template>
                </div>
              </template>
            </component>

            <deferred-surface-state
              v-else-if="coStarWorkspaceReady"
              :error="coStarWorkspaceLoadFailed"
              error-title="候选人物加载失败"
              loading-title="正在加载候选人物"
              @retry="loadCoStarWorkspace"
            >
              <template #loading>
                <candidate-workspace-skeleton
                  :compact="compact"
                  :work-unit="coStarWorkUnit"
                  :page-size="coordinator.candidates.view.pageSize"
                >
                  <template #analysis>
                    <component
                      :is="pendingCoStarAnalysis.component"
                      v-bind="pendingCoStarAnalysis.props"
                    />
                  </template>
                </candidate-workspace-skeleton>
              </template>
            </deferred-surface-state>

            <candidate-workspace-skeleton
              v-else-if="coordinator.candidates.phase === 'pending'"
              :compact="compact"
              :work-unit="coStarWorkUnit"
              :page-size="coordinator.candidates.view.pageSize"
            >
              <template #analysis>
                <component
                  :is="pendingCoStarAnalysis.component"
                  v-bind="pendingCoStarAnalysis.props"
                />
              </template>
            </candidate-workspace-skeleton>

            <section
              v-else-if="!queryStore.applied"
              class="query-result-state surface-panel"
              aria-labelledby="co-star-query-empty-title"
            >
              <span class="state-icon">
                <query-icon name="search" :size="28" />
              </span>
              <h1 id="co-star-query-empty-title">尚未开始查询</h1>
              <button
                class="app-primary-action"
                type="button"
                @click="revealQueryEditor"
              >
                设置查询条件
              </button>
            </section>

          </section>
        </main>

        <footer class="app-footer">
          <div class="app-content-line">
            <nav aria-label="站点信息">
              <a
                href="https://bgm.tv/group/topic/407903"
                target="_blank"
                rel="noopener noreferrer"
              >
                问题反馈
              </a>
              <span aria-hidden="true">·</span>
              <a
                href="https://beian.miit.gov.cn/"
                target="_blank"
                rel="noopener noreferrer"
              >
                粤ICP备2024321317号
              </a>
            </nav>
          </div>
        </footer>
    </app-viewport>
  </app-providers>
</template>

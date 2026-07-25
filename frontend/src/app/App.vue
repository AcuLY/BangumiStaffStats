<!--
THESIS: 查询是正式应用的唯一入口，拒绝用假数据或结果卡片掩盖尚未接入的垂直能力。
OWN-WORLD: Bangumi 粉色、冷灰单层表面、固定 Header 与高密度两阶段查询编辑器。
STORY: 用户选择数据范围与动态职位，清楚地应用、取消、恢复或分享最后一次成功查询。
FIRST VIEWPORT: 品牌与双模式操作在第一行，完整查询 disclosure 紧随其下，主体保留可信空态。
FORM: 已建立的 Operate 世界；桌面使用 Header 下覆盖层，低于 780px 回到文档流。
-->
<script setup lang="ts">
import { NSkeleton } from 'naive-ui';
import {
  computed,
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
import { defaultCandidateView } from '../features/co-star/model';
import {
  defaultPartnersView,
  partnersInputMatchesSelection,
  type PartnersInput,
  type PartnersResource,
  type PartnersView,
} from '../features/co-star/partners';
import {
  createCoStarSelection,
  type CoStarSelection,
} from '../features/co-star/selection';
import MobileCandidateEntry from '../features/co-star/components/MobileCandidateEntry.vue';
import {
  defaultPersonDetailView,
  type PersonDetailView,
  type PersonPositionDisplay,
} from '../features/person-detail/model';
import RankingResults from '../features/ranking/components/RankingResults.vue';
import AppHeader from '../features/query/components/AppHeader.vue';
import QueryIcon from '../features/query/components/QueryIcon.vue';
import QueryWorkspace from '../features/query/components/QueryWorkspace.vue';
import { useCompactLayout } from '../features/query/composables/useCompactLayout';
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
  SharePayload,
  ShareWorkspace,
} from '../features/query/share';
import { createShareUrl } from '../features/query/share';
import { useQueryStore } from '../features/query/store';
import AppIcon from '../shared/components/AppIcon.vue';
import DeferredSurfaceState from '../shared/components/DeferredSurfaceState.vue';
import AppProviders from './AppProviders.vue';
import { createRouteOwner } from './routes';
import { useRuntimeStore } from './store/runtime';
import { createThemeOwner } from './theme';

type SurfaceModule = Readonly<{ default: Component }>;
type SurfaceLoader = () => Promise<SurfaceModule>;

interface AppSurfaceLoaders {
  readonly coStar: SurfaceLoader;
  readonly coStarWorkspace: SurfaceLoader;
  readonly partners: SurfaceLoader;
  readonly personDetail: SurfaceLoader;
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
const runtime = useRuntimeStore();
const catalogStore = useCatalogStore();
const queryStore = useQueryStore();
const route = createRouteOwner(targetWindow);
const themeOwner = createThemeOwner(targetWindow.document);
const routeError = ref<string | null>(null);
const queryWorkspace = ref<InstanceType<typeof QueryWorkspace> | null>(null);
const queryEditing = ref(queryStore.applied === null);
const coStarWorkspaceHandle = ref<CoStarWorkspaceHandle | null>(null);
const coStarPickerOpen = ref(false);
const selection: CoStarSelection = createCoStarSelection();
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
const drawerOpen = ref(false);
const compact = useCompactLayout(targetWindow);
const expandedPersonId = computed(() =>
  selectedPersonId.value !== null &&
  (!compact.value || drawerOpen.value)
    ? selectedPersonId.value
    : null,
);

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
    coStar: {
      execute(request) {
        return coStarDriver.execute({
          ...request,
          refreshCollection: false,
        });
      },
    },
    partners: {
      execute(request) {
        return partnersDriver.execute({
          ...request,
          refreshCollection: false,
        });
      },
    },
    personDetail: createPersonDetailDriver(apiClient),
    rankings: createRankingsDriver(apiClient),
  };
const coordinator = createQueryCoordinator(
  queryStore,
  drivers,
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
    route.updateSuccessfulQuery(query);
    routeError.value = null;
  },
);

const operationFeedback = computed(
  () => coordinator.lastOperationFeedback.value,
);
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
    coStarWorkspaceReady.value &&
    !queryEditing.value,
);
const personDetailDrawerMounted = computed(
  () =>
    drawerOpen.value &&
    PersonDetailSurfaceComponent.value !== null,
);
const coStarScope = computed(
  () =>
    coordinator.candidates.payload?.scope ??
    queryStore.applied?.scope ??
    'global',
);
const coStarWorkUnit = computed(
  () =>
    coordinator.candidates.payload?.workUnit ??
    (queryStore.applied?.mergeSeries ? 'series' : 'subject'),
);
const appliedPositionKeys = computed(
  () => queryStore.applied?.positionKeys.map(String) ?? [],
);
const candidateResource = computed<CandidateResource>(() => ({
  error: coordinator.candidates.error,
  feedback: coordinator.candidates.feedback,
  input: Object.freeze({
    positionKey: String(coordinator.candidates.input.positionKey),
  }),
  payload: coordinator.candidates.payload,
  phase: coordinator.candidates.phase,
  view: coordinator.candidates.view,
  viewPending: coordinator.candidates.viewPending,
}));
const partnersResource = computed<PartnersResource>(() => ({
  error: coordinator.partners.error,
  feedback: coordinator.partners.feedback,
  input: Object.freeze({
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
    { positionKey: input.positionKey },
    view,
  );
}

function executePartners(
  input: Readonly<PartnersInput>,
  view: Readonly<PartnersView>,
): Promise<boolean> {
  const normalizedInput: Readonly<PartnersInput> = Object.freeze({
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

const shareWorkspace = computed<ShareWorkspace | null>(() => {
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
      positionKey: String(acceptedCandidateInput.positionKey),
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

function primaryRecoveryWorkspace(): ShareWorkspace | null {
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
        positionKey: String(coordinator.candidates.input.positionKey),
      },
      view: structuredClone(coordinator.candidates.view),
    },
    kind: 'co-star',
    state: 'empty',
  };
}

function intentRecoveryWorkspace(): ShareWorkspace | null {
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
  let recoveryUrl: string | null = null;
  for (const workspace of [
    intentRecoveryWorkspace(),
    shareWorkspace.value,
    primaryRecoveryWorkspace(),
  ]) {
    if (!workspace) {
      continue;
    }
    try {
      recoveryUrl = createShareUrl(
        new URL(targetWindow.location.href),
        path,
        queryStore.applied,
        workspace,
      );
      break;
    } catch {
      recoveryUrl = null;
    }
  }
  if (!recoveryUrl) {
    return false;
  }
  try {
    targetWindow.history.replaceState(
      targetWindow.history.state,
      '',
      recoveryUrl,
    );
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

function installShareWorkspace(payload: SharePayload): void {
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
  coordinator.candidates.input = Object.freeze(
    structuredClone(payload.workspace.candidates.input),
  );
  coordinator.candidates.view = Object.freeze(
    structuredClone(payload.workspace.candidates.view),
  );
}

async function replayShare(payload: SharePayload): Promise<boolean> {
  queryStore.replaceDraft(draftFromEffective(payload.query));
  installShareWorkspace(payload);
  const primaryAccepted = await coordinator.execute({
    candidateInput:
      payload.workspace.kind === 'co-star'
        ? payload.workspace.candidates.input
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
  if (!primaryAccepted) {
    return false;
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
      drawerOpen.value = compact.value;
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
  if (compact.value) {
    drawerOpen.value = true;
  }
  void executePersonDetail(personId);
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
  const hadFragment = targetWindow.location.hash.length > 0;
  if (!hadFragment) {
    queryStore.draft.uid = route.prefilledUser();
  }
  await loadCatalog();
  const shareResult = await route.consumeInitialShare(replayShare);
  if (shareResult === 'invalid') {
    routeError.value = '分享查询无效或已不受支持';
  } else if (shareResult === 'deferred') {
    routeError.value = '分享查询已读取，但暂时无法应用；可重试后再次查询';
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
watch(compact, (isCompact) => {
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
    if (mode !== 'co-star') {
      coStarWorkspaceHandle.value?.closePicker();
    }
    if (mode !== 'ranking' && drawerOpen.value) {
      drawerOpen.value = false;
    }
  },
);

onBeforeUnmount(() => {
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
    <div
      class="app-shell"
      data-app-root
      :data-app-ready="runtime.isReady ? 'true' : 'false'"
      :data-runtime-phase="runtime.phase"
      :aria-hidden="
        coStarPickerOpen || personDetailDrawerMounted
          ? 'true'
          : undefined
      "
      :inert="
        coStarPickerOpen || personDetailDrawerMounted
          ? true
          : undefined
      "
    >
      <header class="app-header">
        <app-header
          :compact-context-visible="compactCandidateEntryVisible"
          :coordinator="coordinator"
          :mode="route.mode.value"
          :navigate="route.navigate"
          :query-store="queryStore"
          :share-workspace="shareWorkspace"
          :target-window="targetWindow"
          :theme="themeOwner.theme.value"
          :toggle-theme="themeOwner.toggle"
        >
          <template #query>
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
          </template>
          <template #compact-context>
            <mobile-candidate-entry
              :drawer-open="coStarPickerOpen"
              :selection="selection"
              @open="openHeaderCandidatePicker"
            />
          </template>
        </app-header>
      </header>

      <div class="app-page-scroll">
        <main id="main-content" class="app-main">
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
            >
              <ranking-results
                :device-pixel-ratio="targetWindow.devicePixelRatio"
                :expanded-person-id="expandedPersonId"
                :execute-view="coordinator.executeRankingView"
                :resource="coordinator.rankings"
                :retry="retryRanking"
                :selected-person-id="selectedPersonId"
                @activate="activatePerson"
              />
              <component
                :is="PersonDetailSurfaceComponent"
                v-if="PersonDetailSurfaceComponent"
                :compact="compact"
                :device-pixel-ratio="targetWindow.devicePixelRatio"
                :execute-view="executePersonDetailView"
                :open="selectedPersonId !== null && drawerOpen"
                :position-label="positionDisplay"
                :resource="coordinator.personDetail"
                :retry="executePersonDetail"
                :target-window="targetWindow"
                @close="closePersonDrawer"
              />
              <aside
                v-else-if="selectedPersonId === null && !compact"
                id="person-detail-panel"
                class="person-detail-surface surface-panel"
                aria-label="人物详情"
              >
                <div class="person-detail-placeholder">
                  <span class="state-icon">
                    <app-icon name="person" :size="26" />
                  </span>
                  <h2>选择人物查看详情</h2>
                  <p>
                    从左侧排行中选择一位人物，查看评分、证据和参与作品。
                  </p>
                </div>
              </aside>
              <deferred-surface-state
                v-else-if="
                  selectedPersonId !== null &&
                  (!compact || drawerOpen)
                "
                :error="personDetailSurfaceLoadFailed"
                error-title="人物详情加载失败"
                loading-title="正在加载人物详情"
                @retry="loadPersonDetailSurface"
              />
            </div>

            <section
              v-else-if="!queryStore.applied"
              class="query-result-state surface-panel"
              aria-labelledby="ranking-query-empty-title"
            >
              <span class="state-icon">
                <query-icon name="search" :size="28" />
              </span>
              <h1 id="ranking-query-empty-title">尚未开始查询</h1>
              <button
                class="app-primary-action"
                type="button"
                @click="queryWorkspace?.openEditor()"
              >
                设置查询条件
              </button>
            </section>

            <section
              v-else
              class="query-result-state surface-panel"
              aria-labelledby="ranking-query-ready-title"
            >
              <span class="state-icon">
                <query-icon name="check" :size="28" />
              </span>
              <h1 id="ranking-query-ready-title">查询条件已应用</h1>
              <p>在人物排行中应用当前条件以加载结果</p>
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
            <component
              :is="CoStarWorkspaceComponent"
              v-if="
                coStarWorkspaceReady && CoStarWorkspaceComponent
              "
              ref="coStarWorkspaceHandle"
              :before-open-picker="closeQueryBeforePicker"
              :cancel="() => coordinator.cancel('co-star')"
              :device-pixel-ratio="targetWindow.devicePixelRatio"
              :execute-view="executeCandidateView"
              header-owns-mobile-entry
              :position-label="positionLabel"
              :resource="candidateResource"
              :retry="retryCandidates"
              :selection="selection"
              :target-window="targetWindow"
              @picker-open-change="coStarPickerOpen = $event"
            >
              <template #analysis>
                <template v-if="selection.personCount.value === 1">
                  <component
                    :is="PartnersSurfaceComponent"
                    v-if="PartnersSurfaceComponent"
                    :cancel="coordinator.cancelPartners"
                    :device-pixel-ratio="targetWindow.devicePixelRatio"
                    :execute="executePartners"
                    :execute-view="executePartnersView"
                    :position-keys="appliedPositionKeys"
                    :position-label="positionLabel"
                    :resource="partnersResource"
                    :scope="coStarScope"
                    :selection="selection"
                    :source="selection.people.value[0]!"
                    :target-window="targetWindow"
                    :work-unit="coStarWorkUnit"
                  />
                  <deferred-surface-state
                    v-else
                    :error="partnersSurfaceLoadFailed"
                    error-title="合作人物加载失败"
                    loading-title="正在加载合作人物分析"
                    @retry="loadPartnersSurface"
                  />
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
                  />
                  <deferred-surface-state
                    v-else
                    :error="coStarSurfaceLoadFailed"
                    error-title="共演分析暂时无法加载"
                    :loading-title="`正在加载 ${selection.personCount.value} 人共演分析`"
                    retry-label="重新加载"
                    @retry="loadCoStarSurface"
                  />
                </template>
              </template>
            </component>

            <deferred-surface-state
              v-else-if="coStarWorkspaceReady"
              :error="coStarWorkspaceLoadFailed"
              error-title="候选人物加载失败"
              loading-title="正在加载候选人物"
              @retry="loadCoStarWorkspace"
            />

            <section
              v-else-if="coordinator.candidates.phase === 'pending'"
              class="query-result-state surface-panel"
              aria-busy="true"
              aria-live="polite"
            >
              <span class="state-icon state-icon--loading">
                <query-icon name="search" :size="28" />
              </span>
              <h1>正在应用查询</h1>
              <div class="query-result-skeleton" aria-hidden="true">
                <n-skeleton text :repeat="4" />
              </div>
            </section>

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
                @click="queryWorkspace?.openEditor()"
              >
                设置查询条件
              </button>
            </section>

            <section
              v-else
              class="query-result-state surface-panel"
              aria-labelledby="co-star-query-ready-title"
            >
              <span class="state-icon">
                <query-icon name="check" :size="28" />
              </span>
              <h1 id="co-star-query-ready-title">查询条件已应用</h1>
              <p>在共演分析中应用当前条件以加载候选人物</p>
            </section>
          </section>
        </main>

        <footer class="app-footer">
          <div class="app-content-line">
            Bangumi Staff Statistics · 数据口径以当前查询与 Archive 版本为准
          </div>
        </footer>
      </div>
    </div>
  </app-providers>
</template>

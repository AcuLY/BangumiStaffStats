<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import type { useCatalogStore } from '../../catalog/store';
import type { QueryCoordinator } from '../coordinator';
import { summarizeQuery, type QueryMode } from '../model';
import type { useQueryStore } from '../store';
import { useCompactLayout } from '../composables/useCompactLayout';
import QueryEditor from './QueryEditor.vue';
import QueryIcon from './QueryIcon.vue';

const props = defineProps<{
  catalogStore: ReturnType<typeof useCatalogStore>;
  coordinator: QueryCoordinator<unknown, unknown>;
  mode: QueryMode;
  queryStore: ReturnType<typeof useQueryStore>;
  retryCatalog: () => Promise<boolean>;
  targetWindow: Window;
}>();
const emit = defineEmits<{
  editingChange: [editing: boolean];
}>();

const editing = ref(props.queryStore.applied === null);
const compact = useCompactLayout(props.targetWindow);
const expandedQuerySections = ref<string[]>([]);
const queryEditor = ref<InstanceType<typeof QueryEditor> | null>(null);
const workspace = ref<HTMLElement | null>(null);
const summaryButton = ref<HTMLButtonElement | null>(null);
const attention = ref(false);
let attentionTimer: number | undefined;
let restoreSummaryFocus = true;
let summaryPointerActivated = false;

const resource = computed(() =>
  props.coordinator.pendingOperation.value === 'rankings'
    ? props.coordinator.rankings
    : props.coordinator.pendingOperation.value === 'candidates'
      ? props.coordinator.candidates
      : props.mode === 'ranking'
    ? props.coordinator.rankings
    : props.coordinator.candidates,
);
const summary = computed(() =>
  props.queryStore.applied
    ? summarizeQuery(props.queryStore.applied, props.catalogStore.snapshot)
    : ['暂无查询'],
);
const summaryText = computed(() => summary.value.join(' · '));
const mergeSeriesAvailable = computed(() => {
  const operation = props.mode === 'ranking' ? 'rankings' : 'candidates';
  return (
    props.catalogStore.snapshot?.filterCapabilities.some(
      (capability) =>
        capability.field === 'mergeSeries' &&
        capability.scopes.includes(props.queryStore.draft.scope) &&
        capability.subjectTypes.includes(props.queryStore.draft.subjectType) &&
        capability.applications.some(
          (application) => application.operation === operation,
        ),
    ) === true
  );
});

function focusEditorTarget(selector: string): void {
  props.targetWindow.document
    .querySelector<HTMLElement>(`#query-editor ${selector}`)
    ?.focus();
}

function canAutoFocusEditor(): boolean {
  if (
    props.queryStore.draft.scope === 'global' ||
    typeof props.targetWindow.matchMedia !== 'function'
  ) {
    return false;
  }
  return props.targetWindow
    .matchMedia('(width >= 780px) and (pointer: fine)')
    .matches;
}

interface OpenEditorOptions {
  reveal?: boolean;
}

function reducedMotion(): boolean {
  return (
    typeof props.targetWindow.matchMedia === 'function' &&
    props.targetWindow.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function clearAttention(): void {
  attention.value = false;
  if (attentionTimer !== undefined) {
    props.targetWindow.clearTimeout(attentionTimer);
    attentionTimer = undefined;
  }
}

function revealWorkspace(): void {
  clearAttention();
  attention.value = true;
  props.targetWindow.scrollTo({
    behavior: reducedMotion() ? 'auto' : 'smooth',
    top: 0,
  });
  attentionTimer = props.targetWindow.setTimeout(clearAttention, 900);
}

async function openEditor(options: OpenEditorOptions = {}): Promise<void> {
  if (options.reveal) {
    revealWorkspace();
  }
  editing.value = true;
  await nextTick();
  if (options.reveal) {
    workspace.value?.focus({ preventScroll: true });
  }
  if (canAutoFocusEditor()) {
    focusEditorTarget('[name="userId"]');
  }
}

function closeEditor(restoreFocus = true): void {
  if (props.coordinator.pending.value) {
    return;
  }
  restoreSummaryFocus = restoreFocus;
  editing.value = false;
}

function closeForExternalAction(): boolean {
  if (!editing.value) {
    return true;
  }
  if (props.coordinator.pending.value) {
    return false;
  }
  closeEditor(false);
  return true;
}

function markSummaryPointerActivation(): void {
  summaryPointerActivated = true;
}

function clearSummaryPointerActivation(): void {
  summaryPointerActivated = false;
}

function toggleEditor(event: MouseEvent): void {
  const pointerActivated = summaryPointerActivated || event.detail > 0;
  summaryPointerActivated = false;
  if (editing.value) {
    closeEditor(!pointerActivated);
  } else {
    void openEditor();
  }
  if (pointerActivated) {
    summaryButton.value?.blur();
  }
}

async function execute(): Promise<void> {
  if (
    props.queryStore.applied !== null &&
    !props.queryStore.dirty
  ) {
    return;
  }
  const accepted = await props.coordinator.execute({
    catalog: props.catalogStore.snapshot,
    mode: props.mode,
  });
  restoreSummaryFocus = true;
  editing.value = !accepted;
  if (!accepted) {
    await nextTick();
    await nextTick();
    await queryEditor.value?.focusFirstInvalidField();
  }
}

watch(
  editing,
  async (isEditing) => {
    await nextTick();
    if (isEditing) {
      return;
    }
    if (
      restoreSummaryFocus &&
      props.targetWindow.document.activeElement !== summaryButton.value
    ) {
      summaryButton.value?.focus();
    }
    restoreSummaryFocus = true;
  },
);
watch(
  editing,
  (isEditing) => emit('editingChange', isEditing),
  { immediate: true },
);
watch(
  () => props.queryStore.applied,
  (applied) => {
    if (!applied) {
      editing.value = true;
    }
  },
);
watch(
  mergeSeriesAvailable,
  (available) => {
    if (!available) {
      props.queryStore.draft.mergeSeries = false;
    }
  },
  { immediate: true },
);

onMounted(async () => {
  await nextTick();
  if (editing.value && canAutoFocusEditor()) {
    focusEditorTarget('[name="userId"]');
  }
});

onBeforeUnmount(clearAttention);

defineExpose({
  closeForExternalAction,
  editing,
  openEditor,
});
</script>

<template>
  <section
    ref="workspace"
    class="query-workspace"
    :class="{ 'is-attention': attention }"
    aria-labelledby="query-title"
    tabindex="-1"
  >
    <h1 id="query-title" class="sr-only">
      {{ editing ? '编辑查询参数' : queryStore.applied ? '当前查询' : '查询设置' }}
    </h1>
    <button
      ref="summaryButton"
      class="query-summary header-edit-card"
      :class="{ 'is-editing': editing }"
      type="button"
      :aria-label="
        editing
          ? '收起查询条件'
          : coordinator.pending.value
            ? '查询中，打开查询面板以取消'
            : queryStore.applied
              ? `编辑查询条件：${summaryText}`
              : '设置首次查询条件'
      "
      :aria-expanded="editing"
      :aria-busy="coordinator.pending.value"
      aria-controls="query-editor"
      @pointerdown="markSummaryPointerActivation"
      @pointercancel="clearSummaryPointerActivation"
      @click="toggleEditor"
    >
      <template v-if="editing">
        <span
          id="query-editor-title"
          class="query-editor__title"
          role="heading"
          aria-level="2"
        >
          编辑查询
        </span>
        <span
          class="query-editor__collapse header-edit-card__action"
          aria-hidden="true"
        >
          <query-icon name="chevron" :size="18" />
        </span>
      </template>
      <template v-else>
        <span class="query-summary__stages">
          <span class="query-summary__stage">
            <span class="query-summary__stage-copy">
              <strong class="query-summary__copy">
                <span
                  v-for="(part, index) in summary"
                  :key="`${index}-${part}`"
                  class="query-summary__value"
                >
                  {{ part }}
                </span>
              </strong>
            </span>
          </span>
        </span>
        <span
          class="query-summary__action header-edit-card__action"
          aria-hidden="true"
        >
          <query-icon :name="queryStore.applied ? 'edit' : 'search'" :size="18" />
        </span>
      </template>
    </button>

    <transition name="query-panel">
      <div v-if="editing" class="query-editor-panel">
        <query-editor
          ref="queryEditor"
          v-model:expanded-sections="expandedQuerySections"
          :catalog-phase="catalogStore.phase"
          :compact="compact"
          :dirty="queryStore.dirty"
          :disabled="coordinator.pending.value"
          :draft="queryStore.draft"
          :errors="queryStore.fieldErrors"
          :groups="catalogStore.snapshot?.groups ?? []"
          :has-applied-query="Boolean(queryStore.applied)"
          :merge-series-available="mergeSeriesAvailable"
          :mode="mode"
          :positions="catalogStore.positions"
          :status-message="resource.error ?? resource.feedback"
          :subject-types="catalogStore.subjectTypes"
          @cancel="coordinator.cancelPending()"
          @close="closeEditor()"
          @restore="queryStore.restoreDraft"
          @retry-catalog="retryCatalog"
          @submit="execute"
        />
      </div>
    </transition>
  </section>
</template>

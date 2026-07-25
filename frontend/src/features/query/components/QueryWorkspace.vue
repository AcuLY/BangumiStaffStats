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

const editing = ref(props.queryStore.applied === null);
const compact = useCompactLayout(props.targetWindow);
const summaryButton = ref<HTMLButtonElement | null>(null);
const overlayTop = ref(0);

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

function syncOverlayTop(): void {
  const bottom = summaryButton.value?.getBoundingClientRect().bottom;
  if (bottom !== undefined) {
    overlayTop.value = Math.ceil(bottom);
  }
}

function focusEditorTarget(selector: string): void {
  props.targetWindow.document
    .querySelector<HTMLElement>(`#query-editor ${selector}`)
    ?.focus();
}

async function openEditor(): Promise<void> {
  syncOverlayTop();
  editing.value = true;
  await nextTick();
  focusEditorTarget(':is([name="userId"], [name="subjectType"])');
}

function closeEditor(): void {
  if (props.coordinator.pending.value) {
    return;
  }
  editing.value = false;
  props.targetWindow.requestAnimationFrame(() => summaryButton.value?.focus());
}

async function execute(refreshCollection = false): Promise<void> {
  const accepted = await props.coordinator.execute({
    catalog: props.catalogStore.snapshot,
    mode: props.mode,
    refreshCollection,
  });
  editing.value = !accepted;
  if (!accepted) {
    await nextTick();
    focusEditorTarget(
      ':is(input[aria-invalid="true"], select[aria-invalid="true"], [data-query-invalid="true"], [name="userId"], [name="subjectType"])',
    );
  }
}

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
  props.targetWindow.addEventListener('resize', syncOverlayTop);
  await nextTick();
  syncOverlayTop();
  if (editing.value) {
    focusEditorTarget(':is([name="userId"], [name="subjectType"])');
  }
});

onBeforeUnmount(() => {
  props.targetWindow.removeEventListener('resize', syncOverlayTop);
});

defineExpose({ openEditor });
</script>

<template>
  <section class="query-workspace" aria-labelledby="query-workspace-title">
    <h1 id="query-workspace-title" class="sr-only">
      {{ queryStore.applied ? '当前查询' : '查询设置' }}
    </h1>
    <button
      ref="summaryButton"
      class="query-summary"
      :class="{ 'is-editing': editing }"
      type="button"
      :aria-expanded="editing"
      :aria-busy="coordinator.pending.value"
      aria-controls="query-editor"
      @click="editing ? closeEditor() : openEditor()"
    >
      <template v-if="editing">
        <span id="query-editor-title" class="query-editor__title">编辑查询</span>
        <span class="query-summary__action" aria-hidden="true">
          <query-icon name="chevron" />
        </span>
      </template>
      <template v-else>
        <span class="query-summary__copy">
          <span
            v-for="(part, index) in summary"
            :key="`${index}-${part}`"
            class="query-summary__value"
          >
            {{ part }}
          </span>
        </span>
        <span class="query-summary__action" aria-hidden="true">
          <query-icon name="edit" />
        </span>
      </template>
    </button>

    <teleport to="body" :disabled="compact">
      <transition name="query-panel">
        <div
          v-if="editing"
          class="query-editor-overlay"
          :style="{ '--query-overlay-top': `${overlayTop}px` }"
        >
          <query-editor
            :catalog-phase="catalogStore.phase"
            :disabled="coordinator.pending.value"
            :draft="queryStore.draft"
            :errors="queryStore.fieldErrors"
            :groups="catalogStore.snapshot?.groups ?? []"
            :merge-series-available="mergeSeriesAvailable"
            :mode="mode"
            :positions="catalogStore.positions"
            :status-message="resource.error ?? resource.feedback"
            :subject-types="catalogStore.subjectTypes"
            :target-window="targetWindow"
            @cancel="coordinator.cancelPending()"
            @close="closeEditor"
            @refresh="execute(true)"
            @restore="queryStore.restoreDraft"
            @retry-catalog="retryCatalog"
            @submit="execute(false)"
          />
        </div>
      </transition>
    </teleport>
  </section>
</template>

<script setup lang="ts">
import { NButton, NDynamicInput, NPopover, NSelect } from 'naive-ui';
import { computed, nextTick, ref, watch } from 'vue';

import type {
  CatalogGroup,
  CatalogPosition,
  PositionKey,
} from '../../../api/adapters/catalog';
import AppIcon from '../../../shared/components/AppIcon.vue';
import type { CatalogPhase } from '../../catalog/store';
import { useCompactLayout } from '../../../shared/composables/useCompactLayout';
import PositionCatalogBrowser from './PositionCatalogBrowser.vue';
import QueryIcon from './QueryIcon.vue';
import type { QueryControlSize } from './controlTheme';

const props = withDefaults(defineProps<{
  allowAll?: boolean;
  allLabel?: string;
  allSelected?: boolean;
  controlSize: QueryControlSize;
  disabled?: boolean;
  error?: string;
  groups: readonly CatalogGroup[];
  modelValue: readonly PositionKey[];
  phase: CatalogPhase;
  placeholder: string;
  positions: readonly CatalogPosition[];
}>(), { allLabel: '全部' });

const emit = defineEmits<{
  'update:allSelected': [value: boolean];
  retry: [];
  'update:modelValue': [value: PositionKey[]];
}>();

interface PositionSelectorRow {
  readonly id: number;
  readonly positionKey: PositionKey | null;
}

type CatalogActivation = 'keyboard' | 'toggle';

let nextRowId = 0;

function createRow(positionKey: PositionKey | null = null): PositionSelectorRow {
  nextRowId += 1;
  return Object.freeze({ id: nextRowId, positionKey });
}

function rowsFromModel(
  modelValue: readonly PositionKey[],
  currentRows: readonly PositionSelectorRow[] = [],
): PositionSelectorRow[] {
  if (modelValue.length === 0) {
    return [
      currentRows.find((row) => row.positionKey === null) ?? createRow(),
    ];
  }
  const availableRows = [...currentRows];
  return modelValue.map((positionKey) => {
    const existingIndex = availableRows.findIndex(
      (row) => row.positionKey === positionKey,
    );
    if (existingIndex < 0) {
      return createRow(positionKey);
    }
    return availableRows.splice(existingIndex, 1)[0]!;
  });
}

function projectRows(rows: readonly PositionSelectorRow[]): PositionKey[] {
  const seen = new Set<PositionKey>();
  const positions: PositionKey[] = [];
  for (const row of rows) {
    if (row.positionKey === null || seen.has(row.positionKey)) {
      continue;
    }
    seen.add(row.positionKey);
    positions.push(row.positionKey);
  }
  return positions;
}

function sameKeys(
  left: readonly PositionKey[],
  right: readonly PositionKey[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

const compact = useCompactLayout();
const selectorRoot = ref<HTMLElement | null>(null);
const selectorRows = ref<PositionSelectorRow[]>(
  rowsFromModel(props.modelValue),
);
const visibleRows = computed(() => props.allSelected
  ? [Object.freeze({ ...selectorRows.value[0]!, positionKey: null })]
  : selectorRows.value);
const activeRowId = ref<number | null>(null);
const searchDraft = ref('');
const catalogBrowser = ref<{
  reveal: (options: { focusFirstControl: boolean }) => void;
} | null>(null);
const panelId = 'query-position-catalog-browser';
const catalogPopoverThemeOverrides = Object.freeze({
  boxShadow: 'none',
});

const positionByKey = computed(
  () => new Map(props.positions.map((position) => [position.key, position])),
);
const describedBy = computed(() =>
  props.error ? 'query-error-position-keys' : undefined,
);

function rowToggle(rowId: number): HTMLButtonElement | null {
  return (
    selectorRoot.value?.querySelector<HTMLButtonElement>(
      `[data-position-row-id="${rowId}"] .position-selector__toggle`,
    ) ?? null
  );
}

function selectedPosition(
  row: PositionSelectorRow,
): CatalogPosition | undefined {
  return row.positionKey === null
    ? undefined
    : positionByKey.value.get(row.positionKey);
}

function rowAriaLabel(row: PositionSelectorRow, index: number): string {
  const label = props.allSelected ? props.allLabel : selectedPosition(row)?.label ?? row.positionKey;
  return label
    ? `第 ${index + 1} 个职位，当前为${label}`
    : `第 ${index + 1} 个职位，尚未选择`;
}

function unavailableKeysFor(rowId: number): PositionKey[] {
  if (props.allSelected) return [];
  const unavailable = new Set<PositionKey>();
  const exclusiveGroups = new Set<string>();
  for (const row of selectorRows.value) {
    if (row.id === rowId || row.positionKey === null) {
      continue;
    }
    unavailable.add(row.positionKey);
    const exclusiveGroup = positionByKey.value.get(
      row.positionKey,
    )?.exclusiveGroup;
    if (exclusiveGroup) {
      exclusiveGroups.add(exclusiveGroup);
    }
  }
  for (const position of props.positions) {
    if (
      position.exclusiveGroup &&
      exclusiveGroups.has(position.exclusiveGroup)
    ) {
      unavailable.add(position.key);
    }
  }
  return [...unavailable];
}

function publishRows(rows: readonly PositionSelectorRow[]): void {
  const projected = projectRows(rows);
  if (!sameKeys(projected, props.modelValue)) {
    emit('update:modelValue', projected);
  }
}

function isPositionSelectorRow(
  value: unknown,
): value is PositionSelectorRow {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Partial<PositionSelectorRow>).id === 'number' &&
    (
      (value as Partial<PositionSelectorRow>).positionKey === null ||
      typeof (value as Partial<PositionSelectorRow>).positionKey === 'string'
    )
  );
}

function updateRows(value: unknown[]): void {
  const receivedRows = value.filter(isPositionSelectorRow);
  const rows = receivedRows.length > 0 ? receivedRows : [createRow()];
  selectorRows.value = rows;
  if (
    activeRowId.value !== null &&
    !rows.some((row) => row.id === activeRowId.value)
  ) {
    activeRowId.value = null;
    searchDraft.value = '';
  }
  publishRows(rows);
}

async function openCatalog(
  rowId: number,
  activation: CatalogActivation = 'toggle',
): Promise<void> {
  if (props.disabled) {
    return;
  }
  if (activeRowId.value !== rowId) {
    activeRowId.value = rowId;
    searchDraft.value = '';
  }

  await nextTick();
  if (activeRowId.value !== rowId) {
    return;
  }
  if (activation === 'toggle') {
    rowToggle(rowId)?.focus({ preventScroll: true });
  }
  catalogBrowser.value?.reveal({
    focusFirstControl: activation === 'keyboard',
  });
}

function toggleCatalog(event: MouseEvent, rowId: number): void {
  if (activeRowId.value === rowId) {
    void closeCatalog(false);
    return;
  }
  void openCatalog(
    rowId,
    event.detail === 0 ? 'keyboard' : 'toggle',
  );
}

async function closeCatalog(restoreFocus = true): Promise<void> {
  const rowId = activeRowId.value;
  activeRowId.value = null;
  searchDraft.value = '';
  if (restoreFocus && rowId !== null) {
    await nextTick();
    if (props.disabled || !selectorRoot.value?.isConnected) {
      return;
    }
    // All can replace the active row or hide it behind the first row.
    const allRow = props.allSelected ? visibleRows.value[0] : undefined;
    const toggle = rowToggle(rowId) ?? (allRow ? rowToggle(allRow.id) : null);
    toggle?.focus({ preventScroll: true });
  }
}

function replacePosition(rowId: number, key: PositionKey): void {
  if (
    props.disabled ||
    unavailableKeysFor(rowId).includes(key)
  ) {
    return;
  }
  const rows = props.allSelected ? [Object.freeze({ id: rowId, positionKey: key })] : selectorRows.value.map((row) =>
    row.id === rowId
      ? Object.freeze({ ...row, positionKey: key })
      : row,
  );
  selectorRows.value = rows;
  emit('update:allSelected', false);
  publishRows(rows);
  void closeCatalog();
}

function selectAll(): void {
  if (props.disabled || !props.allowAll) return;
  emit('update:allSelected', true);
  void closeCatalog();
}

function handleTriggerKeydown(
  event: KeyboardEvent,
  rowId: number,
): void {
  if (event.key !== 'ArrowDown') {
    return;
  }
  event.preventDefault();
  void openCatalog(rowId, 'keyboard');
}

async function createPositionRow(
  index: number,
  create: (index: number) => void,
): Promise<void> {
  await closeCatalog(false);
  create(index);
  await nextTick();
  const createdRow = selectorRows.value[index + 1];
  if (createdRow) {
    rowToggle(createdRow.id)?.focus({ preventScroll: true });
    void openCatalog(createdRow.id, 'toggle');
  }
}

async function removePositionRow(
  index: number,
  remove: (index: number) => void,
): Promise<void> {
  if (selectorRows.value.length <= 1) {
    return;
  }
  const remainingRows = selectorRows.value.filter(
    (_, rowIndex) => rowIndex !== index,
  );
  const targetRow =
    remainingRows[Math.min(index, remainingRows.length - 1)] ?? null;
  await closeCatalog(false);
  remove(index);
  await nextTick();
  if (targetRow) {
    rowToggle(targetRow.id)?.focus({ preventScroll: true });
  }
}

watch(
  () => props.modelValue,
  (modelValue) => {
    if (sameKeys(projectRows(selectorRows.value), modelValue)) {
      return;
    }
    activeRowId.value = null;
    searchDraft.value = '';
    selectorRows.value = rowsFromModel(modelValue, selectorRows.value);
  },
  { deep: true },
);

watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) {
      activeRowId.value = null;
      searchDraft.value = '';
    }
  },
);

watch(() => props.allSelected, () => { void closeCatalog(false); });

watch(
  compact,
  (isCompact, wasCompact) => {
    if (
      isCompact === wasCompact ||
      activeRowId.value === null
    ) {
      return;
    }
    const activeElement = window.document.activeElement;
    const restoreFocus =
      activeElement instanceof window.HTMLElement &&
      (selectorRoot.value?.contains(activeElement) === true ||
        activeElement.closest(`#${panelId}`) !== null);
    void closeCatalog(restoreFocus);
  },
  { flush: 'sync' },
);

defineExpose({
  focus: () => {
    const firstRow = selectorRows.value[0];
    if (firstRow) {
      rowToggle(firstRow.id)?.focus();
    }
  },
});
</script>

<template>
  <div
    ref="selectorRoot"
    class="position-selector"
    :class="{ 'is-error': Boolean(error) }"
    :aria-invalid="Boolean(error)"
    :aria-describedby="error ? 'query-error-position-keys' : undefined"
    :data-query-invalid="error ? 'true' : undefined"
  >
    <div
      v-if="phase === 'pending' || phase === 'idle'"
      class="position-selector__pending"
      aria-busy="true"
      aria-live="polite"
    >
      <n-select
        :size="controlSize"
        :options="[]"
        loading
        disabled
        placeholder="正在加载职位目录"
        aria-label="职位目录加载中"
      />
      <span class="sr-only">正在加载职位目录</span>
    </div>
    <div
      v-else-if="phase === 'error'"
      class="position-selector__error"
      role="alert"
    >
      <span>职位目录暂时无法加载</span>
      <n-button
        :size="controlSize"
        secondary
        attr-type="button"
        @click="emit('retry')"
      >
        重新加载
      </n-button>
    </div>
    <template v-else>
      <input
        v-for="key in modelValue"
        :key="`position-input-${key}`"
        type="hidden"
        name="positionKeys"
        :value="key"
      />
      <n-dynamic-input
        class="position-selector__dynamic-input"
        item-class="position-selector__dynamic-item"
        key-field="id"
        :item-style="{
          alignItems: 'center',
          display: 'flex',
          justifyContent: 'flex-start',
        }"
        :value="visibleRows"
        :min="1"
        :disabled="disabled"
        :on-create="() => createRow()"
        @update:value="updateRows"
      >
        <template #default="{ value: row, index }">
          <n-popover
            :show="activeRowId === row.id"
            :disabled="disabled"
            trigger="manual"
            placement="bottom-start"
            :show-arrow="false"
            :theme-overrides="catalogPopoverThemeOverrides"
            style="max-width: min(480px, calc(100dvw - var(--scrollbar-shell-size) - 24px));"
            to="body"
            display-directive="if"
            raw
            @clickoutside="closeCatalog(false)"
          >
            <template #trigger>
              <div
                class="position-selector__control"
                :class="[
                  `is-${controlSize}`,
                  {
                    'is-open': activeRowId === row.id,
                    'is-disabled': disabled,
                    'is-error': Boolean(error),
                  },
                ]"
                :data-position-row-id="row.id"
                :data-position-row-index="index"
                @click.self="toggleCatalog($event, row.id)"
              >
                <button
                  class="position-selector__toggle"
                  type="button"
                  :disabled="disabled"
                  aria-haspopup="dialog"
                  :aria-expanded="activeRowId === row.id"
                  :aria-controls="panelId"
                  :aria-describedby="describedBy"
                  :aria-invalid="Boolean(error)"
                  :aria-label="rowAriaLabel(row, index)"
                  @click="toggleCatalog($event, row.id)"
                  @keydown="handleTriggerKeydown($event, row.id)"
                >
                  <span
                    class="position-selector__selected-label"
                    :class="{ 'is-placeholder': !allSelected && !row.positionKey }"
                  >{{ allSelected ? allLabel : selectedPosition(row)?.label ?? row.positionKey ?? placeholder }}</span>
                  <query-icon name="chevron" :size="16" />
                </button>
              </div>
            </template>

            <position-catalog-browser
              v-if="activeRowId === row.id"
              ref="catalogBrowser"
              :id="panelId"
              :compact="compact"
              :allow-all="allowAll"
              :all-label="allLabel"
              :all-selected="allSelected"
              :disabled="disabled"
              :groups="groups"
              :model-value="
                !allSelected && row.positionKey ? [row.positionKey] : []
              "
              :positions="positions"
              :search-query="searchDraft"
              @update:search-query="searchDraft = $event"
              :unavailable-keys="unavailableKeysFor(row.id)"
              @close="closeCatalog()"
              @toggle="replacePosition(row.id, $event)"
              @select-all="selectAll"
            />
          </n-popover>
        </template>

        <template #action="{ index, create, remove }">
          <div
            class="position-selector__actions"
            :class="`is-${controlSize}`"
          >
            <span class="position-selector__action-slot">
              <n-button
                class="position-selector__action-button"
                :size="controlSize"
                attr-type="button"
                :disabled="disabled || allSelected || selectorRows.length <= 1"
                :aria-label="`移除第 ${index + 1} 个职位选择器`"
                @click="removePositionRow(index, remove)"
              >
                <template #icon>
                  <app-icon name="close" :size="14" />
                </template>
              </n-button>
            </span>
            <span class="position-selector__action-slot">
              <n-button
                class="position-selector__action-button"
                :size="controlSize"
                attr-type="button"
                :disabled="disabled || allSelected"
                :aria-label="`在第 ${index + 1} 行后添加职位选择器`"
                @click="createPositionRow(index, create)"
              >
                <template #icon>
                  <query-icon name="plus" :size="16" />
                </template>
              </n-button>
            </span>
          </div>
        </template>
      </n-dynamic-input>
    </template>

    <small
      v-if="error"
      id="query-error-position-keys"
      class="query-field-error"
    >
      {{ error }}
    </small>
  </div>
</template>

<style scoped>
.position-selector__dynamic-input {
  width: 100%;
}

.position-selector__control {
  position: relative;
  display: grid;
  width: auto;
  min-width: 0;
  flex: 1 1 0;
  grid-template-columns: minmax(0, 1fr) 44px;
  align-items: stretch;
  overflow: visible;
  border: 1px solid var(--control-outline);
  border-radius: var(--radius-control);
  background: var(--control-background);
  transition:
    border-color 150ms ease-out,
    box-shadow 150ms ease-out;
}

.position-selector__control.is-medium {
  min-height: 34px;
}

.position-selector__control.is-small {
  min-height: 28px;
}

.position-selector__control:hover:not(.is-disabled):not(.is-open) {
  border-color: var(--brand-hover);
}

.position-selector__control.is-open:not(.is-disabled),
.position-selector__control:focus-within:not(.is-disabled) {
  border-color: var(--brand);
  box-shadow: var(--control-focus-shadow);
}

.position-selector__control.is-error {
  border-color: var(--error);
}

.position-selector__control.is-disabled {
  cursor: not-allowed;
  opacity: 0.58;
}

.position-selector__toggle {
  position: relative;
  display: grid;
  width: 100%;
  grid-column: 1 / -1;
  grid-template-columns: minmax(0, 1fr) 44px;
  min-height: 100%;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: inherit;
  color: var(--control-placeholder);
  background: transparent;
  cursor: pointer;
}

.position-selector__toggle::before,
.position-selector__action-button::before {
  position: absolute;
  top: 50%;
  left: 50%;
  height: var(--touch-target);
  transform: translate(-50%, -50%);
  content: "";
}

.position-selector__toggle::before {
  width: 100%;
}

.position-selector__selected-label {
  box-sizing: border-box;
  width: 100%;
  overflow: hidden;
  padding-left: var(--space-3);
  color: var(--control-text);
  font: inherit;
  font-size: 14px;
  line-height: 21px;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-selector__selected-label.is-placeholder {
  color: var(--control-placeholder);
}

.position-selector__action-button::before {
  width: 100%;
}

.position-selector__toggle:disabled {
  cursor: not-allowed;
}

.position-selector__toggle .query-icon {
  transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.position-selector__control.is-open .position-selector__toggle .query-icon {
  transform: rotate(180deg);
}

.position-selector__actions {
  --position-selector-action-size: 34px;
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--space-2);
  margin-left: var(--space-2);
}

.position-selector__actions.is-small {
  --position-selector-action-size: 28px;
}

.position-selector__action-slot {
  display: grid;
  width: var(--position-selector-action-size);
  height: var(--touch-target);
  place-items: center;
}

.position-selector__action-button {
  position: relative;
  width: var(--position-selector-action-size);
  padding-inline: 0;
}

@media (width < 780px) {
  .position-selector__dynamic-input {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: start;
    column-gap: var(--space-3);
  }

  .position-selector__control::before {
    position: absolute;
    inset-block: -8px;
    inset-inline: 0;
    content: "";
  }

  .position-selector__control.is-small {
    min-height: 28px;
  }
}

@media (max-width: 520px) {
  .position-selector__dynamic-input {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (prefers-reduced-motion: reduce) {
  .position-selector__control,
  .position-selector__toggle .query-icon {
    transition-duration: 0s;
  }
}
</style>

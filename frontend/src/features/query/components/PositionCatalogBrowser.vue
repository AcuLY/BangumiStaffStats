<script setup lang="ts">
import { NEmpty } from 'naive-ui';
import { computed, ref, watch } from 'vue';
import ContentDivider from '../../../shared/components/ContentDivider.vue';

import type {
  CatalogGroup,
  CatalogPosition,
  PositionKey,
} from '../../../api/adapters/catalog';
import QueryIcon from './QueryIcon.vue';

interface BrowserGroup {
  key: string;
  kind: CatalogGroup['kind'];
  label: string;
  positions: readonly CatalogPosition[];
}

const props = defineProps<{
  allowAll?: boolean;
  allSelected?: boolean;
  compact: boolean;
  disabled?: boolean;
  groups: readonly CatalogGroup[];
  id: string;
  modelValue: readonly PositionKey[];
  positions: readonly CatalogPosition[];
  searchQuery: string;
  unavailableKeys?: readonly PositionKey[];
}>();

const emit = defineEmits<{
  selectAll: [];
  close: [];
  toggle: [positionKey: PositionKey];
}>();

const browserRoot = ref<HTMLElement | null>(null);
const expandedGroupKeys = ref<ReadonlySet<string>>(new Set());
const unavailableKeySet = computed(
  () => new Set(props.unavailableKeys ?? []),
);

const positionByKey = computed(
  () => new Map(props.positions.map((position) => [position.key, position])),
);

const browserGroups = computed<readonly BrowserGroup[]>(() => {
  const included = new Set<PositionKey>();
  const resolved: BrowserGroup[] = [];

  for (const group of props.groups) {
    const seen = new Set<PositionKey>();
    const positions: CatalogPosition[] = [];
    for (const positionKey of group.positionKeys) {
      const position = positionByKey.value.get(positionKey);
      if (!position?.selectable || seen.has(positionKey)) {
        continue;
      }
      seen.add(positionKey);
      included.add(positionKey);
      positions.push(position);
    }
    if (positions.length) {
      resolved.push({
        key: group.key,
        kind: group.kind,
        label: group.label,
        positions,
      });
    }
  }

  const remaining = props.positions.filter(
    (position) => position.selectable && !included.has(position.key),
  );
  if (remaining.length) {
    resolved.push({
      key: 'fallback:other-positions',
      kind: 'fallback',
      label: '其他职位',
      positions: remaining,
    });
  }

  return resolved;
});

const groupSignature = computed(() =>
  JSON.stringify(
    browserGroups.value.map((group) => [
      group.key,
      group.positions.map((position) => position.key),
    ]),
  ),
);

watch(
  groupSignature,
  () => {
    const featured = browserGroups.value.find(
      (group) => group.kind === 'shortcut' && group.positions.length > 0,
    );
    expandedGroupKeys.value = new Set(featured ? [featured.key] : []);
  },
  { immediate: true },
);

const groupLabelsByPosition = computed(() => {
  const labels = new Map<PositionKey, string[]>();
  for (const group of browserGroups.value) {
    for (const position of group.positions) {
      const current = labels.get(position.key) ?? [];
      if (!current.includes(group.label)) {
        current.push(group.label);
      }
      labels.set(position.key, current);
    }
  }
  return labels;
});

const groupKeysByPosition = computed(() => {
  const keys = new Map<PositionKey, string[]>();
  for (const group of browserGroups.value) {
    for (const position of group.positions) {
      const current = keys.get(position.key) ?? [];
      if (!current.includes(group.key)) {
        current.push(group.key);
      }
      keys.set(position.key, current);
    }
  }
  return keys;
});

const normalizedSearch = computed(() =>
  props.searchQuery.trim().toLocaleLowerCase(),
);
const searching = computed(() => normalizedSearch.value.length > 0);
const searchResults = computed<readonly CatalogPosition[]>(() => {
  const pattern = normalizedSearch.value;
  if (!pattern) {
    return [];
  }

  const included = new Set<PositionKey>();
  const results: CatalogPosition[] = [];
  for (const group of browserGroups.value) {
    for (const position of group.positions) {
      if (included.has(position.key)) {
        continue;
      }
      const positionId = position.key.split(':').at(-1) ?? '';
      const haystack = [
        position.label,
        position.names.cn,
        position.names.en,
        position.names.jp,
        position.key,
        positionId,
        ...position.categories,
        ...(groupKeysByPosition.value.get(position.key) ?? []),
        ...(groupLabelsByPosition.value.get(position.key) ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n')
        .toLocaleLowerCase();
      if (haystack.includes(pattern)) {
        included.add(position.key);
        results.push(position);
      }
    }
  }
  return results;
});

function isSelected(positionKey: PositionKey): boolean {
  return props.modelValue.includes(positionKey);
}

function isUnavailable(positionKey: PositionKey): boolean {
  return unavailableKeySet.value.has(positionKey);
}

function togglePosition(positionKey: PositionKey): void {
  if (!props.disabled && !isUnavailable(positionKey)) {
    emit('toggle', positionKey);
  }
}

function toggleGroup(groupKey: string): void {
  if (props.disabled) {
    return;
  }
  const next = new Set(expandedGroupKeys.value);
  if (next.has(groupKey)) {
    next.delete(groupKey);
  } else {
    next.add(groupKey);
  }
  expandedGroupKeys.value = next;
}

function setGroupExpanded(groupKey: string, expanded: boolean): void {
  if (props.disabled) {
    return;
  }
  const next = new Set(expandedGroupKeys.value);
  if (expanded) {
    next.add(groupKey);
  } else {
    next.delete(groupKey);
  }
  expandedGroupKeys.value = next;
}

function setGroupContentHidden(element: Element, hidden: boolean): void {
  element.toggleAttribute('inert', hidden);
  element.setAttribute('aria-hidden', String(hidden));
}

function occurrenceKey(
  groupKey: string,
  positionKey: PositionKey,
): string {
  return JSON.stringify([groupKey, positionKey]);
}

function searchOccurrenceKey(positionKey: PositionKey): string {
  return JSON.stringify(['search', positionKey]);
}

function groupPanelId(index: number): string {
  return `${props.id}-group-${index}`;
}

function categoryText(positionKey: PositionKey): string {
  return (groupLabelsByPosition.value.get(positionKey) ?? ['其他职位']).join(
    '、',
  );
}

function focusFirstCatalogControl(): void {
  const root = browserRoot.value;
  if (!root) {
    return;
  }
  const firstControl = root.querySelector<HTMLButtonElement>(
    '.position-catalog-browser__position--all:not(:disabled), .position-catalog-browser__position--search:not(:disabled), .position-catalog-browser__group-button:not(:disabled)',
  );
  (firstControl ?? root).focus({ preventScroll: true });
}

function reveal(options: { focusFirstControl: boolean }): void {
  const root = browserRoot.value;
  if (!root) {
    return;
  }
  if (options.focusFirstControl) {
    focusFirstCatalogControl();
  }
}

defineExpose({ reveal });
</script>

<template>
  <div
    ref="browserRoot"
    :id="id"
    class="position-catalog-browser"
    :class="{ 'is-compact': compact }"
    role="dialog"
    :aria-label="searching ? '职位搜索结果' : '职位目录'"
    :aria-disabled="disabled ? 'true' : undefined"
    tabindex="-1"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <div
      class="position-catalog-browser__list"
      :aria-label="searching ? '职位搜索结果' : '职位分类'"
    >
      <button
        v-if="allowAll"
        class="position-catalog-browser__position position-catalog-browser__position--all"
        :class="{ 'is-selected': allSelected }"
        type="button"
        :disabled="disabled"
        :aria-pressed="Boolean(allSelected)"
        data-position-all
        @click="emit('selectAll')"
      >
        <span class="position-catalog-browser__position-label">全部</span>
        <span class="position-catalog-browser__selection-mark">
          <query-icon v-if="allSelected" name="check" :size="16" />
        </span>
      </button>
      <content-divider v-if="allowAll" />
      <template v-if="searching">
        <ul
          v-if="searchResults.length"
          class="position-catalog-browser__positions position-catalog-browser__search-results"
        >
          <li
            v-for="position in searchResults"
            :key="searchOccurrenceKey(position.key)"
          >
            <button
              class="position-catalog-browser__position position-catalog-browser__position--search"
              :class="{
                'is-selected': isSelected(position.key),
                'is-unavailable': isUnavailable(position.key),
              }"
              type="button"
              :disabled="disabled || isUnavailable(position.key)"
              :aria-pressed="isSelected(position.key)"
              :aria-label="
                isUnavailable(position.key)
                  ? `${position.label}，已在其他行选择`
                  : undefined
              "
              :data-position-key="position.key"
              :data-position-unavailable="
                isUnavailable(position.key) ? 'true' : undefined
              "
              :data-occurrence-key="searchOccurrenceKey(position.key)"
              @click="togglePosition(position.key)"
            >
              <span class="position-catalog-browser__position-copy">
                <span class="position-catalog-browser__position-label">
                  {{ position.label }}
                </span>
                <span class="position-catalog-browser__position-context">
                  {{ categoryText(position.key) }}
                </span>
              </span>
              <span class="position-catalog-browser__selection-mark">
                <query-icon
                  v-if="isSelected(position.key)"
                  name="check"
                  :size="16"
                />
              </span>
            </button>
          </li>
        </ul>
        <n-empty
          v-else
          class="position-catalog-browser__empty"
          size="small"
          description="没有符合搜索条件的职位"
        />
      </template>

      <div v-else-if="browserGroups.length" class="position-catalog-browser__groups">
        <section
          v-for="(group, groupIndex) in browserGroups"
          :key="group.key"
          class="position-catalog-browser__group"
        >
          <h3 class="position-catalog-browser__group-heading">
            <button
              class="position-catalog-browser__group-button"
              type="button"
              :disabled="disabled"
              :aria-expanded="expandedGroupKeys.has(group.key)"
              :aria-controls="groupPanelId(groupIndex)"
              :data-position-group="group.key"
              @click="toggleGroup(group.key)"
              @keydown.left.prevent="setGroupExpanded(group.key, false)"
              @keydown.right.prevent="setGroupExpanded(group.key, true)"
            >
              <span class="position-catalog-browser__group-label">
                {{ group.label }}
              </span>
              <span class="position-catalog-browser__group-count">
                {{ group.positions.length }}
              </span>
              <query-icon
                class="position-catalog-browser__group-arrow"
                :class="{
                  'is-expanded': expandedGroupKeys.has(group.key),
                }"
                name="chevron"
                :size="16"
              />
            </button>
          </h3>

          <transition
            name="position-catalog-group"
            @before-enter="setGroupContentHidden($event, false)"
            @before-leave="setGroupContentHidden($event, true)"
          >
            <div
              v-if="expandedGroupKeys.has(group.key)"
              class="position-catalog-browser__group-content"
            >
              <ul
                :id="groupPanelId(groupIndex)"
                class="position-catalog-browser__positions"
              >
                <li
                  v-for="position in group.positions"
                  :key="occurrenceKey(group.key, position.key)"
                >
                  <button
                    class="position-catalog-browser__position"
                    :class="{
                      'is-selected': isSelected(position.key),
                      'is-unavailable': isUnavailable(position.key),
                    }"
                    type="button"
                    :disabled="disabled || isUnavailable(position.key)"
                    :aria-pressed="isSelected(position.key)"
                    :aria-label="
                      isUnavailable(position.key)
                        ? `${position.label}，已在其他行选择`
                        : undefined
                    "
                    :data-position-key="position.key"
                    :data-position-unavailable="
                      isUnavailable(position.key) ? 'true' : undefined
                    "
                    :data-occurrence-key="occurrenceKey(group.key, position.key)"
                    @click="togglePosition(position.key)"
                  >
                    <span class="position-catalog-browser__position-label">
                      {{ position.label }}
                    </span>
                    <span class="position-catalog-browser__selection-mark">
                      <query-icon
                        v-if="isSelected(position.key)"
                        name="check"
                        :size="16"
                      />
                    </span>
                  </button>
                </li>
              </ul>
            </div>
          </transition>
          <content-divider v-if="groupIndex < browserGroups.length - 1" />
        </section>
      </div>

      <n-empty
        v-else
        class="position-catalog-browser__empty"
        size="small"
        description="没有可用职位"
      />
    </div>
  </div>
</template>

<style scoped>
.position-catalog-browser {
  --position-catalog-list-height: 258.4px;
  --position-catalog-option-height: 34px;
  --position-catalog-option-pending: rgb(243 243 245);
  --position-catalog-option-disabled: rgb(194 194 194);
  --position-catalog-option-disabled-opacity: 0.5;
  box-sizing: border-box;
  display: grid;
  width: min(
    30rem,
    calc(100dvw - var(--scrollbar-shell-size) - 24px)
  );
  max-width: calc(
    100dvw - var(--scrollbar-shell-size) - 24px
  );
  height: calc(var(--position-catalog-list-height) + 8px);
  min-width: 0;
  grid-template-rows: minmax(0, 1fr);
  overflow: hidden;
  padding: 4px;
  border: 0;
  border-radius: var(--radius-control);
  color: var(--text-primary);
  background: var(--surface-raised);
  box-shadow:
    0 3px 6px -4px rgb(0 0 0 / 12%),
    0 6px 16px 0 rgb(0 0 0 / 8%),
    0 9px 28px 8px rgb(0 0 0 / 5%);
}

:global(:root[data-theme='dark'] .position-catalog-browser) {
  --position-catalog-option-pending: rgb(255 255 255 / 9%);
  --position-catalog-option-disabled: rgb(255 255 255 / 38%);
  --position-catalog-option-disabled-opacity: 0.38;
}

.position-catalog-browser.is-compact {
  --position-catalog-list-height: 212.8px;
  --position-catalog-option-height: 28px;
}

.position-catalog-browser.is-compact .position-catalog-browser__list {
  height: var(--position-catalog-list-height);
}

.position-catalog-browser__list {
  min-width: 0;
  height: var(--position-catalog-list-height);
  max-height: var(--position-catalog-list-height);
  overflow-x: hidden;
  overflow-y: auto;
  border-radius: calc(var(--radius-control) - 4px);
  scrollbar-width: thin;
  scrollbar-color: var(--scrollbar-thumb) var(--scrollbar-track);
}

.position-catalog-browser__list::-webkit-scrollbar {
  width: var(--scrollbar-component-size, 6px);
  height: var(--scrollbar-component-size, 6px);
}

.position-catalog-browser__list::-webkit-scrollbar-track {
  background: var(--scrollbar-track);
}

.position-catalog-browser__list::-webkit-scrollbar-thumb {
  border-radius: var(--scrollbar-radius);
  background: var(--scrollbar-thumb);
}

.position-catalog-browser__list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover);
}

.position-catalog-browser__groups {
  display: grid;
  min-width: 0;
}

.position-catalog-browser__list :deep(.content-divider) {
  width: calc(100% - 8px);
  margin-inline: 4px;
}

.position-catalog-browser__group-content {
  display: grid;
  grid-template-rows: 1fr;
  opacity: 1;
}

.position-catalog-browser__group-content > .position-catalog-browser__positions {
  min-height: 0;
  overflow: hidden;
}

.position-catalog-group-enter-active {
  transition: grid-template-rows 220ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease-out;
}

.position-catalog-group-leave-active {
  transition: grid-template-rows 160ms ease-in, opacity 160ms ease-in;
}

.position-catalog-group-enter-from,
.position-catalog-group-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}

.position-catalog-browser__group {
  min-width: 0;
}

.position-catalog-browser__group-heading {
  margin: 0;
  font: inherit;
}

.position-catalog-browser__group-button,
.position-catalog-browser__position {
  position: relative;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  color: inherit;
  background: transparent;
  font: inherit;
  cursor: pointer;
  transition:
    color 300ms cubic-bezier(0.4, 0, 0.2, 1),
    opacity 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.position-catalog-browser__group-button::before,
.position-catalog-browser__position::before {
  position: absolute;
  inset: 0 4px;
  border-radius: var(--radius-control);
  background: transparent;
  content: '';
  pointer-events: none;
  transition: background-color 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.position-catalog-browser__group-button > *,
.position-catalog-browser__position > * {
  position: relative;
  z-index: 1;
}

.position-catalog-browser__group-button {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  width: 100%;
  height: auto;
  min-height: calc(var(--position-catalog-option-height) + 8px);
  gap: var(--space-2);
  padding: 4px 12px;
  line-height: 21px;
  text-align: left;
}

.position-catalog-browser__group-label {
  min-width: 0;
  color: var(--text-primary);
  font-weight: 600;
  overflow-wrap: anywhere;
}

.position-catalog-browser__group-count {
  min-width: 2ch;
  color: var(--text-tertiary);
  font-size: 12px;
  font-weight: 400;
  text-align: right;
}

.position-catalog-browser__group-arrow {
  transform: rotate(-90deg);
  color: var(--text-tertiary);
  transition: transform 120ms ease-out;
}

.position-catalog-browser__group-arrow.is-expanded {
  transform: rotate(0);
}

.position-catalog-browser__positions {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(12rem, 1fr));
  min-width: 0;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.position-catalog-browser.is-compact .position-catalog-browser__positions,
.position-catalog-browser__search-results {
  grid-template-columns: minmax(0, 1fr);
  padding-inline-start: 0;
}

.position-catalog-browser__positions > li {
  min-width: 0;
}

.position-catalog-browser__position {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  min-height: var(--position-catalog-option-height);
  gap: var(--space-2);
  padding: 0 12px;
  line-height: 21px;
  text-align: left;
}

.position-catalog-browser__position.is-selected {
  color: var(--brand);
}

.position-catalog-browser__position-copy {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
}

.position-catalog-browser__position-label,
.position-catalog-browser__position-context {
  min-width: 0;
}

.position-catalog-browser__position-copy
  .position-catalog-browser__position-label {
  flex: 0 0 auto;
}

.position-catalog-browser__position-context {
  overflow: hidden;
  flex: 1 1 auto;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 400;
  line-height: 21px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-catalog-browser__selection-mark {
  display: inline-flex;
  flex: 0 0 16px;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}

.position-catalog-browser__empty {
  padding: var(--space-6) var(--space-3);
}

.position-catalog-browser__group-button:disabled {
  cursor: not-allowed;
  opacity: var(--position-catalog-option-disabled-opacity);
}

.position-catalog-browser__position:disabled {
  color: var(--position-catalog-option-disabled);
  cursor: not-allowed;
}

.position-catalog-browser__position.is-selected:disabled {
  opacity: var(--position-catalog-option-disabled-opacity);
}

.position-catalog-browser__group-button:focus-visible,
.position-catalog-browser__position:focus-visible {
  outline: none;
}

.position-catalog-browser__group-button:focus-visible::before,
.position-catalog-browser__position:focus-visible::before {
  background: var(--position-catalog-option-pending);
}

.position-catalog-browser__position:not(:disabled):active {
  color: var(--brand-pressed);
}

@media (hover: hover) and (pointer: fine) {
  .position-catalog-browser__group-button:not(:disabled):hover::before,
  .position-catalog-browser__position:not(:disabled):hover::before {
    background: var(--position-catalog-option-pending);
  }
}

@media (prefers-reduced-motion: reduce) {
  .position-catalog-group-enter-active,
  .position-catalog-group-leave-active,
  .position-catalog-browser__group-arrow,
  .position-catalog-browser__group-button,
  .position-catalog-browser__position,
  .position-catalog-browser__group-button::before,
  .position-catalog-browser__position::before {
    transition: none;
  }
}

@media (forced-colors: active) {
  .position-catalog-browser__position.is-selected {
    outline: 1px solid Highlight;
    color: Highlight;
    background: Canvas;
  }

  .position-catalog-browser__group-button:focus-visible,
  .position-catalog-browser__position:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: -2px;
  }
}
</style>

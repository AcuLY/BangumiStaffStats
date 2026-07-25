<script setup lang="ts">
import {
  NButton,
  NEmpty,
  NInput,
  NPopover,
  NSkeleton,
  NTag,
} from 'naive-ui';
import { computed, ref } from 'vue';

import type {
  CatalogGroup,
  CatalogPosition,
  PositionKey,
  SubjectType,
} from '../../../api/adapters/catalog';
import type { CatalogPhase } from '../../catalog/store';
import { useCompactLayout } from '../composables/useCompactLayout';

const props = defineProps<{
  disabled?: boolean;
  error?: string;
  groups: readonly CatalogGroup[];
  modelValue: readonly PositionKey[];
  phase: CatalogPhase;
  positions: readonly CatalogPosition[];
  subjectType: SubjectType;
  targetWindow: Window;
}>();

const emit = defineEmits<{
  retry: [];
  'update:modelValue': [value: PositionKey[]];
}>();

const compact = useCompactLayout(props.targetWindow);
const open = ref(false);
const search = ref('');

const selected = computed(() => new Set(props.modelValue));
const positionByKey = computed(
  () => new Map(props.positions.map((position) => [position.key, position])),
);
const selectedPositions = computed(() =>
  props.modelValue
    .map((key) => positionByKey.value.get(key))
    .filter((position): position is CatalogPosition => Boolean(position)),
);
const filtered = computed(() => {
  const term = search.value.trim().toLocaleLowerCase();
  if (!term) {
    return [];
  }
  return props.positions.filter((position) =>
    [position.label, position.names.cn, position.names.en, position.names.jp]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(term)),
  );
});

function groupPositions(group: CatalogGroup): readonly CatalogPosition[] {
  return group.positionKeys
    .map((key) => positionByKey.value.get(key))
    .filter(
      (position): position is CatalogPosition =>
        Boolean(position) && position!.selectable,
    );
}

function toggle(position: CatalogPosition): void {
  const next = [...props.modelValue];
  const index = next.indexOf(position.key);
  if (index >= 0) {
    next.splice(index, 1);
  } else {
    if (position.exclusiveGroup) {
      for (let cursor = next.length - 1; cursor >= 0; cursor -= 1) {
        const current = positionByKey.value.get(next[cursor] ?? '');
        if (current?.exclusiveGroup === position.exclusiveGroup) {
          next.splice(cursor, 1);
        }
      }
    }
    next.push(position.key);
  }
  emit('update:modelValue', next);
}

function remove(key: PositionKey): void {
  emit(
    'update:modelValue',
    props.modelValue.filter((value) => value !== key),
  );
}
</script>

<template>
  <div
    class="position-selector"
    :class="{ 'is-error': Boolean(error) }"
    :aria-invalid="Boolean(error)"
    :aria-describedby="error ? 'query-error-position-keys' : undefined"
    :data-query-invalid="error ? 'true' : undefined"
    :tabindex="error ? -1 : undefined"
  >
    <div
      v-if="phase === 'pending' || phase === 'idle'"
      class="position-selector__loading"
      aria-busy="true"
      aria-live="polite"
    >
      <n-skeleton text :repeat="2" />
      <span class="sr-only">正在加载职位目录</span>
    </div>
    <div
      v-else-if="phase === 'error'"
      class="position-selector__error"
      role="alert"
    >
      <span>职位目录暂时无法加载</span>
      <n-button size="small" secondary attr-type="button" @click="emit('retry')">
        重新加载
      </n-button>
    </div>
    <template v-else>
      <div class="position-selector__selected" aria-live="polite">
        <n-tag
          v-for="position in selectedPositions"
          :key="position.key"
          type="primary"
          closable
          :disabled="disabled"
          @close="remove(position.key)"
        >
          {{ position.label }}
        </n-tag>
        <span v-if="selectedPositions.length === 0" class="position-selector__placeholder">
          选择职位
        </span>
      </div>

      <n-button
        v-if="compact"
        class="position-selector__trigger"
        block
        secondary
        attr-type="button"
        :disabled="disabled"
        :aria-expanded="open"
        :aria-describedby="error ? 'query-error-position-keys' : undefined"
        aria-controls="position-selector-panel"
        @click="open = !open"
      >
        {{ open ? '收起职位' : '浏览职位' }}
      </n-button>

      <n-popover
        v-else
        v-model:show="open"
        trigger="click"
        placement="bottom-start"
        :width="560"
        :show-arrow="false"
      >
        <template #trigger>
          <n-button
            class="position-selector__trigger"
            secondary
            attr-type="button"
            :disabled="disabled"
          >
            浏览职位
          </n-button>
        </template>
        <div class="position-selector-popover">
          <n-input
            v-model:value="search"
            clearable
            placeholder="搜索职位"
            aria-label="搜索职位"
          />
          <div class="position-selector__catalog">
            <template v-if="search.trim()">
              <button
                v-for="position in filtered"
                :key="position.key"
                class="position-option"
                :class="{ 'is-selected': selected.has(position.key) }"
                type="button"
                :aria-pressed="selected.has(position.key)"
                @click="toggle(position)"
              >
                <span>{{ position.label }}</span>
                <small>{{ position.categories.join(' / ') || '其他职位' }}</small>
              </button>
              <n-empty
                v-if="filtered.length === 0"
                size="small"
                description="没有符合搜索条件的职位"
              />
            </template>
            <section
              v-for="group in groups"
              v-else
              :key="group.key"
              class="position-group"
            >
              <h4>{{ group.label }}</h4>
              <div class="position-group__items">
                <button
                  v-for="position in groupPositions(group)"
                  :key="position.key"
                  class="position-option"
                  :class="{ 'is-selected': selected.has(position.key) }"
                  type="button"
                  :aria-pressed="selected.has(position.key)"
                  @click="toggle(position)"
                >
                  {{ position.label }}
                </button>
              </div>
            </section>
          </div>
        </div>
      </n-popover>

      <div
        v-if="compact && open"
        id="position-selector-panel"
        class="position-selector-inline"
      >
        <n-input
          v-model:value="search"
          clearable
          placeholder="搜索职位"
          aria-label="搜索职位"
        />
        <div class="position-selector__catalog">
          <template v-if="search.trim()">
            <button
              v-for="position in filtered"
              :key="position.key"
              class="position-option"
              :class="{ 'is-selected': selected.has(position.key) }"
              type="button"
              :aria-pressed="selected.has(position.key)"
              @click="toggle(position)"
            >
              {{ position.label }}
            </button>
          </template>
          <section v-for="group in groups" v-else :key="group.key" class="position-group">
            <h4>{{ group.label }}</h4>
            <div class="position-group__items">
              <button
                v-for="position in groupPositions(group)"
                :key="position.key"
                class="position-option"
                :class="{ 'is-selected': selected.has(position.key) }"
                type="button"
                :aria-pressed="selected.has(position.key)"
                @click="toggle(position)"
              >
                {{ position.label }}
              </button>
            </div>
          </section>
        </div>
      </div>
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

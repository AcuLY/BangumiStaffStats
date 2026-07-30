<script setup lang="ts">
import {
  NButton,
  NSelect,
  NSkeleton,
  NTag,
  type SelectGroupOption,
  type SelectOption,
} from 'naive-ui';
import { computed, h, ref } from 'vue';

import type {
  CatalogGroup,
  CatalogPosition,
  PositionKey,
} from '../../../api/adapters/catalog';
import type { CatalogPhase } from '../../catalog/store';
import {
  querySelectThemeOverrides,
  type QueryControlSize,
} from './controlTheme';

const props = defineProps<{
  controlSize: QueryControlSize;
  disabled?: boolean;
  error?: string;
  groups: readonly CatalogGroup[];
  modelValue: readonly PositionKey[];
  phase: CatalogPhase;
  placeholder: string;
  positions: readonly CatalogPosition[];
}>();

const emit = defineEmits<{
  retry: [];
  'update:modelValue': [value: PositionKey[]];
}>();

type FocusableControl = { focus: () => void };
interface PositionOption extends SelectOption {
  searchText: string;
}

const select = ref<FocusableControl>();
const positionByKey = computed(
  () => new Map(props.positions.map((position) => [position.key, position])),
);
const selectOptions = computed<Array<PositionOption | SelectGroupOption>>(() => {
  const included = new Set<PositionKey>();
  const groups = props.groups
    .map((group): SelectGroupOption | null => {
      const children = group.positionKeys
        .map((key) => positionByKey.value.get(key))
        .filter(
          (position): position is CatalogPosition =>
            Boolean(position) && position!.selectable,
        )
        .map(toOption);
      children.forEach((option) => included.add(option.value as PositionKey));
      return children.length
        ? {
            type: 'group',
            key: group.key,
            label: group.label,
            children,
          }
        : null;
    })
    .filter((group): group is SelectGroupOption => Boolean(group));
  const remaining = props.positions
    .filter((position) => position.selectable && !included.has(position.key))
    .map(toOption);
  if (remaining.length) {
    groups.push({
      type: 'group',
      key: 'other',
      label: '其他职位',
      children: remaining,
    });
  }
  return groups;
});

function toOption(position: CatalogPosition): PositionOption {
  return {
    label: position.label,
    value: position.key,
    searchText: [
      position.label,
      position.names.cn,
      position.names.en,
      position.names.jp,
      ...position.categories,
    ]
      .filter((value): value is string => Boolean(value))
      .join('\n')
      .toLocaleLowerCase(),
  };
}

function filterPosition(pattern: string, option: SelectOption): boolean {
  const candidate = option as Partial<PositionOption>;
  return (
    candidate.searchText?.includes(pattern.trim().toLocaleLowerCase()) ??
    String(option.label ?? '')
      .toLocaleLowerCase()
      .includes(pattern.trim().toLocaleLowerCase())
  );
}

function updateSelection(value: string[]): void {
  const next = value as PositionKey[];
  const added = next.find((key) => !props.modelValue.includes(key));
  const exclusiveGroup = added
    ? positionByKey.value.get(added)?.exclusiveGroup
    : undefined;
  const normalized = exclusiveGroup
    ? next.filter(
        (key) =>
          key === added ||
          positionByKey.value.get(key)?.exclusiveGroup !== exclusiveGroup,
      )
    : next;
  emit('update:modelValue', [...new Set(normalized)]);
}

function renderTag({
  option,
  handleClose,
}: {
  option: SelectOption;
  handleClose: () => void;
}) {
  return h(
    NTag,
    {
      type: 'primary',
      size: props.controlSize,
      closable: !option.disabled,
      disabled: props.disabled || Boolean(option.disabled),
      internalCloseIsButtonTag: false,
      internalCloseFocusable: false,
      onClose: handleClose,
    },
    { default: () => String(option.label ?? option.value ?? '') },
  );
}

defineExpose({ focus: () => select.value?.focus() });
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
      <n-button
        :size="controlSize"
        secondary
        attr-type="button"
        @click="emit('retry')"
      >
        重新加载
      </n-button>
    </div>
    <n-select
      v-else
      ref="select"
      class="query-position-select"
      multiple
      filterable
      :value="[...modelValue]"
      :options="selectOptions"
      :filter="filterPosition"
      :render-tag="renderTag"
      :size="controlSize"
      :menu-size="controlSize"
      :theme-overrides="querySelectThemeOverrides"
      :status="error ? 'error' : undefined"
      :disabled="disabled"
      :placeholder="placeholder"
      :input-props="{
        name: 'positionKeys',
        'aria-labelledby': 'query-position-control-label',
        'aria-invalid': Boolean(error),
        'aria-describedby': error ? 'query-error-position-keys' : undefined,
      }"
      @update:value="updateSelection"
    />
    <small
      v-if="error"
      id="query-error-position-keys"
      class="query-field-error"
    >
      {{ error }}
    </small>
  </div>
</template>

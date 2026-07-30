<script setup lang="ts">
import { NInputNumber } from 'naive-ui';
import { computed } from 'vue';

import {
  queryInputNumberThemeOverrides,
  type QueryControlSize,
} from './controlTheme';

const props = defineProps<{
  conditionKey: string;
  controlSize: QueryControlSize;
  disabled?: boolean;
  errorId: string;
  inputmode: 'decimal' | 'numeric';
  max?: number;
  maxLabel: string;
  maxPlaceholder: string;
  min: number;
  minLabel: string;
  minPlaceholder: string;
  modelValue: [string, string];
  status?: 'error';
  step: number;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: [string, string]];
}>();

function updateAt(index: 0 | 1, value: number | null): void {
  const next: [string, string] = [...props.modelValue];
  next[index] = value === null ? '' : String(value);
  emit('update:modelValue', next);
}

const minimum = computed<number | null>({
  get: () => (props.modelValue[0] === '' ? null : Number(props.modelValue[0])),
  set: (value) => updateAt(0, value),
});
const maximum = computed<number | null>({
  get: () => (props.modelValue[1] === '' ? null : Number(props.modelValue[1])),
  set: (value) => updateAt(1, value),
});
</script>

<template>
  <div class="query-range-control">
    <n-input-number
      v-model:value="minimum"
      :size="controlSize"
      :theme-overrides="queryInputNumberThemeOverrides"
      :min="min"
      :max="max"
      :step="step"
      :status="status"
      :disabled="disabled"
      :input-props="{
        name: `${conditionKey}Min`,
        inputmode,
        'aria-label': minLabel,
        'aria-invalid': status === 'error',
        'aria-describedby': status === 'error' ? errorId : undefined,
      }"
      :placeholder="minPlaceholder"
      clearable
      button-placement="both"
    />
    <span class="query-range-control__separator" aria-hidden="true">—</span>
    <n-input-number
      v-model:value="maximum"
      :size="controlSize"
      :theme-overrides="queryInputNumberThemeOverrides"
      :min="min"
      :max="max"
      :step="step"
      :status="status"
      :disabled="disabled"
      :input-props="{
        name: `${conditionKey}Max`,
        inputmode,
        'aria-label': maxLabel,
        'aria-invalid': status === 'error',
        'aria-describedby': status === 'error' ? errorId : undefined,
      }"
      :placeholder="maxPlaceholder"
      clearable
      button-placement="both"
    />
  </div>
</template>

<script setup lang="ts">
import { NButton, NDatePicker, NSelect } from 'naive-ui';
import { computed, ref } from 'vue';

import {
  queryDatePickerThemeOverrides,
  querySelectThemeOverrides,
  type QueryControlSize,
} from './controlTheme';

const props = defineProps<{
  conditionKey: string;
  controlSize: QueryControlSize;
  disabled?: boolean;
  endLabel: string;
  modelValue: [string, string];
  startLabel: string;
  status?: 'error';
}>();

const emit = defineEmits<{
  'update:modelValue': [value: [string, string]];
}>();

type FocusableControl = { focus: () => void };
const startInput = ref<FocusableControl>();
const now = new Date();
const currentDecade = Math.floor(now.getFullYear() / 10) * 10;
const recentYearOptions = [1, 3, 5] as const;
const decadeOptions = Array.from(
  { length: Math.floor((currentDecade - 1950) / 10) + 1 },
  (_, index) => {
    const decade = currentDecade - index * 10;
    return { label: `${decade} 年代`, value: decade };
  },
);

function formatMonth(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

const currentMonth = formatMonth(now);

function recentRange(years: number): [string, string] {
  return [
    formatMonth(new Date(now.getFullYear(), now.getMonth() - years * 12 + 1, 1)),
    currentMonth,
  ];
}

function updateAt(index: 0 | 1, value: string | null): void {
  const next: [string, string] = [...props.modelValue];
  next[index] = value ?? '';
  emit('update:modelValue', next);
}

const start = computed<string | null>({
  get: () => props.modelValue[0] || null,
  set: (value) => updateAt(0, value),
});
const end = computed<string | null>({
  get: () => props.modelValue[1] || null,
  set: (value) => updateAt(1, value),
});
const selectedDecade = computed<number | null>(() => {
  const [rangeStart, rangeEnd] = props.modelValue;
  const year = Number(rangeStart.slice(0, 4));
  if (!Number.isInteger(year) || year % 10 !== 0) {
    return null;
  }
  return rangeStart === `${year}-01` && rangeEnd === `${year + 9}-12`
    ? year
    : null;
});

function applyRecentRange(years: number): void {
  emit('update:modelValue', recentRange(years));
}

function isRecentRange(years: number): boolean {
  const range = recentRange(years);
  return props.modelValue[0] === range[0] && props.modelValue[1] === range[1];
}

function applyDecade(decade: number | null): void {
  if (decade !== null) {
    emit('update:modelValue', [`${decade}-01`, `${decade + 9}-12`]);
  }
}

defineExpose({ focus: () => startInput.value?.focus() });
</script>

<template>
  <div class="query-date-range" :data-condition-key="conditionKey">
    <div class="query-range-control">
      <label class="query-range-field">
        <span class="sr-only">{{ startLabel }}</span>
        <n-date-picker
          ref="startInput"
          v-model:formatted-value="start"
          class="query-month-picker"
          type="month"
          format="yyyy-MM"
          value-format="yyyy-MM"
          :size="controlSize"
          :theme-overrides="queryDatePickerThemeOverrides"
          :status="status"
          :disabled="disabled"
          placeholder="最早时间"
          clearable
          update-value-on-close
        />
      </label>
      <span class="query-range-control__separator" aria-hidden="true">—</span>
      <label class="query-range-field">
        <span class="sr-only">{{ endLabel }}</span>
        <n-date-picker
          v-model:formatted-value="end"
          class="query-month-picker"
          type="month"
          format="yyyy-MM"
          value-format="yyyy-MM"
          :size="controlSize"
          :theme-overrides="queryDatePickerThemeOverrides"
          :status="status"
          :disabled="disabled"
          placeholder="最晚时间"
          clearable
          update-value-on-close
        />
      </label>
    </div>
    <div class="query-range-presets" :aria-label="`${conditionKey}快捷范围`">
      <n-button
        v-for="years in recentYearOptions"
        :key="years"
        :size="controlSize"
        attr-type="button"
        :type="isRecentRange(years) ? 'primary' : 'default'"
        :secondary="!isRecentRange(years)"
        :aria-pressed="isRecentRange(years)"
        :disabled="disabled"
        @click="applyRecentRange(years)"
      >
        近 {{ years }} 年
      </n-button>
      <n-select
        class="query-decade-select"
        :size="controlSize"
        :menu-size="controlSize"
        :theme-overrides="querySelectThemeOverrides"
        :value="selectedDecade"
        :options="decadeOptions"
        :disabled="disabled"
        :input-props="{ 'aria-label': `${conditionKey}指定年代` }"
        placeholder="选择年代"
        @update:value="applyDecade"
      />
    </div>
  </div>
</template>

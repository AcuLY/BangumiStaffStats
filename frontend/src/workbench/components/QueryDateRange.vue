<script setup lang="ts">
import { computed, ref } from 'vue'

const props = defineProps<{
	modelValue: [string, string]
	conditionKey: string
	startLabel: string
	endLabel: string
	status?: 'error'
	disabled?: boolean
}>()

const emit = defineEmits<{
	'update:modelValue': [value: [string, string]]
}>()

type FocusableControl = { focus: () => void }
const startInput = ref<FocusableControl>()
const now = new Date()
const currentDecade = Math.floor(now.getFullYear() / 10) * 10
const recentYearOptions = [1, 3, 5]
const decadeOptions = Array.from({ length: Math.floor((currentDecade - 1950) / 10) + 1 }, (_, index) => {
	const decade = currentDecade - index * 10
	return { label: `${decade} 年代`, value: decade }
})

const formatMonth = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
const currentMonth = formatMonth(now)
const recentRange = (years: number): [string, string] => [
	formatMonth(new Date(now.getFullYear(), now.getMonth() - years * 12 + 1, 1)),
	currentMonth,
]

const updateAt = (index: 0 | 1, value: string | null) => {
	const next: [string, string] = [...props.modelValue]
	next[index] = value ?? ''
	emit('update:modelValue', next)
}

const start = computed<string | null>({
	get: () => props.modelValue[0] || null,
	set: (value) => updateAt(0, value),
})
const end = computed<string | null>({
	get: () => props.modelValue[1] || null,
	set: (value) => updateAt(1, value),
})

const applyRecentRange = (years: number) => emit('update:modelValue', recentRange(years))
const isRecentRange = (years: number) => {
	const range = recentRange(years)
	return props.modelValue[0] === range[0] && props.modelValue[1] === range[1]
}
const selectedDecade = computed<number | null>(() => {
	const [rangeStart, rangeEnd] = props.modelValue
	const year = Number(rangeStart.slice(0, 4))
	if (!Number.isInteger(year) || year % 10 !== 0) return null
	return rangeStart === `${year}-01` && rangeEnd === `${year + 9}-12` ? year : null
})
const applyDecade = (decade: number | null) => {
	if (decade === null) return
	emit('update:modelValue', [`${decade}-01`, `${decade + 9}-12`])
}

defineExpose({ focus: () => startInput.value?.focus() })
</script>

<template>
	<div class="query-date-range">
		<div class="query-range-control">
			<label class="query-range-field">
				<span class="sr-only">{{ startLabel }}</span>
				<n-date-picker
					ref="startInput"
					class="query-month-picker"
					v-model:formatted-value="start"
					type="month"
					format="yyyy-MM"
					value-format="yyyy-MM"
					size="medium"
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
					class="query-month-picker"
					v-model:formatted-value="end"
					type="month"
					format="yyyy-MM"
					value-format="yyyy-MM"
					size="medium"
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
				size="small"
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
				size="small"
				:value="selectedDecade"
				:options="decadeOptions"
				:disabled="disabled"
				:input-props="{ 'aria-label': `${conditionKey}指定年代` }"
				placeholder="指定年代"
				@update:value="applyDecade"
			/>
		</div>
	</div>
</template>

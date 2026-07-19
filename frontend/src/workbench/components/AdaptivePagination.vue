<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWorkbenchControlSize, type WorkbenchControlSize } from '../composables/useWorkbenchControlSize'

type PageSizeOption = number | { label: string; value: number }

const props = withDefaults(defineProps<{
	page: number
	pageSize: number
	itemCount: number
	pageSizes?: PageSizeOption[]
	size?: WorkbenchControlSize
	showSizePicker?: boolean
	showQuickJumper?: boolean
	summary?: string
	ariaLabel?: string
}>(), {
	pageSizes: () => [10],
	showSizePicker: true,
	showQuickJumper: true,
	summary: '',
	ariaLabel: '分页导航',
})

const emit = defineEmits<{
	'update:page': [value: number]
	'update:page-size': [value: number]
}>()

const { controlSize } = useWorkbenchControlSize()
const paginationSize = computed<WorkbenchControlSize>(() => props.size ?? controlSize.value)

const pagesContainer = ref<HTMLElement | null>(null)
const pageSlot = ref(9)
let resizeObserver: ResizeObserver | null = null
let slotSyncId = 0

const syncPageSlot = async () => {
	const syncId = ++slotSyncId
	pageSlot.value = 9
	await nextTick()

	const container = pagesContainer.value
	const pagination = container?.firstElementChild as HTMLElement | null
	if (!container || !pagination) return

	const paginationOverflows = () => {
		const firstItem = pagination.firstElementChild
		const lastItem = pagination.lastElementChild
		if (!firstItem || !lastItem) return false
		const firstRect = firstItem.getBoundingClientRect()
		const lastRect = lastItem.getBoundingClientRect()
		return lastRect.right - firstRect.left > container.clientWidth + 1
	}

	while (syncId === slotSyncId && pageSlot.value > 3 && paginationOverflows()) {
		pageSlot.value -= 2
		await nextTick()
	}
}

onMounted(() => {
	resizeObserver = new ResizeObserver(() => void syncPageSlot())
	if (pagesContainer.value) resizeObserver.observe(pagesContainer.value)
	void syncPageSlot()
})

watch(
	() => [props.page, props.pageSize, props.itemCount, paginationSize.value],
	() => void syncPageSlot(),
)

onBeforeUnmount(() => {
	slotSyncId += 1
	resizeObserver?.disconnect()
})
</script>

<template>
	<nav class="adaptive-pagination" :aria-label="ariaLabel">
		<span v-if="summary" class="adaptive-pagination__summary" role="status" aria-live="polite">{{ summary }}</span>
		<div ref="pagesContainer" class="adaptive-pagination__pages">
			<n-pagination
				class="adaptive-pagination__control adaptive-pagination__control--pages"
				:size="paginationSize"
				:page="page"
				:page-size="pageSize"
				:item-count="itemCount"
				:page-slot="pageSlot"
				:display-order="['pages']"
				@update:page="emit('update:page', $event)"
			/>
		</div>
		<n-pagination
			v-if="showSizePicker || showQuickJumper"
			class="adaptive-pagination__control adaptive-pagination__control--tools"
			:size="paginationSize"
			:page="page"
			:page-size="pageSize"
			:item-count="itemCount"
			:page-sizes="pageSizes"
			:display-order="['size-picker', 'quick-jumper']"
			:show-size-picker="showSizePicker"
			:show-quick-jumper="showQuickJumper"
			@update:page="emit('update:page', $event)"
			@update:page-size="emit('update:page-size', $event)"
		>
			<template #goto><span>跳至</span></template>
		</n-pagination>
	</nav>
</template>

<style scoped>
.adaptive-pagination {
	display: grid;
	justify-items: end;
	gap: var(--space-2);
	width: 100%;
	min-width: 0;
	margin-top: var(--space-4);
}

.adaptive-pagination__summary {
	color: var(--text-3);
	font-size: var(--text-caption);
	font-variant-numeric: tabular-nums;
	line-height: 1.4;
	text-align: right;
}

.adaptive-pagination__pages {
	width: 100%;
	min-width: 0;
}

.adaptive-pagination__control {
	justify-content: flex-end;
	width: 100%;
	max-width: 100%;
}

.adaptive-pagination__control--pages,
.adaptive-pagination__control--tools {
	flex-wrap: nowrap;
}
</style>

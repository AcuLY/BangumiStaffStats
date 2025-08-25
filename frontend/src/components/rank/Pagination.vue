<script setup lang="ts">
import { useGlobalStore } from '@/stores/global'
import { usePaginationStore } from '@/stores/pagination'
import { useRequestStore } from '@/stores/request'
import { useResponseStore } from '@/stores/response'
import type { Size } from 'naive-ui/es/pagination/src/interface'

const props = defineProps<{
	bottom?: boolean
}>()

const globalStore = useGlobalStore()

const paginationStore = usePaginationStore()

const requestStore = useRequestStore()
const { updateAndFetch } = requestStore

const responseStore = useResponseStore()

const page = ref(1)
const pageSize = ref(10)
const pageSizes = [
	{ label: '每页 5 人', value: 5 },
	{ label: '每页 10 人', value: 10 },
	{ label: '每页 20 人', value: 20 },
	{ label: '每页 50 人', value: 50 },
]
const pageSlot = 7
const paginationSize = computed((): Size => (globalStore.isMobile ? 'small' : 'medium'))
const displayOrder = computed(
	(): Array<'pages' | 'size-picker' | 'quick-jumper'> =>
		props.bottom
			? ['quick-jumper', 'pages', 'size-picker']
			: ['pages', 'size-picker', 'quick-jumper']
)

const handlePageChange = (newPage: number) => {
    page.value = newPage
	paginationStore.page = newPage
	updateAndFetch(false)
}

const handlePageSizeChange = (newPageSize: number) => {
    pageSize.value = newPageSize
    page.value = 1
	paginationStore.pageSize = newPageSize
	paginationStore.page = 1
	updateAndFetch(false)
}

watch(() => paginationStore.page, (newPage) => {
	page.value = newPage
})
</script>

<template>
	<n-pagination
		:class="props.bottom ? 'pagination-bottom' : 'pagination-top'"
		:page="page"
		:page-size="pageSize"
		:item-count="responseStore.response.personCount"
		:page-sizes="pageSizes"
		show-size-picker
		:page-slot="pageSlot"
		:size="paginationSize"
        :display-order="displayOrder"
		@update:page="handlePageChange"
		@update:page-size="handlePageSizeChange"
		show-quick-jumper
	>
		<template #goto>
			<span style="font-size: larger">按回车跳至</span>
		</template>
	</n-pagination>
</template>

<style scoped>
.pagination-top {
	width: 90vw;
	margin-bottom: 12px;
	display: flex;
	justify-content: start;
	flex-wrap: wrap;
	gap: 10px 0px;
}

.pagination-bottom {
	width: 90vw;
	margin-top: 12px;
	display: flex;
	flex-wrap: wrap;
	justify-content: end;
	gap: 10px 0px;
}
</style>

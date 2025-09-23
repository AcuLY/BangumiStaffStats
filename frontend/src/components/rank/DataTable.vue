<script setup lang="ts">
import type { PersonSummary } from '@/api/api'
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'
import { usePaginationStore } from '@/stores/pagination'
import { useRequestStore } from '@/stores/request'
import { useResponseStore } from '@/stores/response'
import type { DataTableColumns, DataTableSortState } from 'naive-ui'
import TableText from '@/components/columns/TableText.vue'
import PersonName from '@/components/columns/PersonName.vue'
import AverageRate from '@/components/columns/AverageRate.vue'
import OverallRate from '@/components/columns/OverallRate.vue'
import Item from '@/components/columns/Item.vue'
import type { TableBaseColumn } from 'naive-ui/es/data-table/src/interface'
import { SORT_TYPE } from '@/constants/types'

const globalStore = useGlobalStore()

const requestStore = useRequestStore()
const { updateAndFetch } = requestStore

const displayStore = useDisplayStore()
const paginationStore = usePaginationStore()

const responseStore = useResponseStore()

const colWidth = (mobile: number, pc: number) => {
	return computed((): number => (globalStore.isMobile ? mobile : pc))
}
const colWidthIndex = colWidth(38, 50)
const colWidthPersonName = colWidth(32, 96)
const colWidthCount = colWidth(50, 86)
const colWidthAverage = colWidth(50, 76)
const colWidthOverall = colWidth(50, 76)
const colResizable = computed((): boolean => !globalStore.isMobile)

const columns = computed(
	(): DataTableColumns<PersonSummary> => [
		// 序号
		{
			title: '',
			key: '',
			width: colWidthIndex.value,
			resizable: colResizable.value,
			align: 'center',
			render: (_, index) => {
				const exactIndex = index + (paginationStore.page - 1) * paginationStore.pageSize
				return h(TableText, {
					value: exactIndex + 1,
				})
			},
		},
		// 人名
		{
			title: () => h(TableText, { value: '人名' }),
			key: 'person',
			width: colWidthPersonName.value,
			resizable: colResizable.value,
			align: 'center',
			render: (row) => h(PersonName, { person: row.person }),
		},
		// 数量
		{
			title: () => h(TableText, { value: '数量' }),
			key: 'count',
			width: colWidthCount.value,
			resizable: colResizable.value,
			align: 'center',
			sorter: 'default',
			render: (row) =>
				h(TableText, { value: row.subjects ? row.subjects.length : row.characters?.length }),
		},
		// 均分
		{
			title: () => h(TableText, { value: '均分' }),
			key: 'average',
			width: colWidthAverage.value,
			resizable: colResizable.value,
			align: 'center',
			sorter: 'default',
			render: (row) => h(AverageRate, { row: row }),
		},
		// 加权综合
		{
			title: () => h(TableText, { value: '加权综合' }),
			key: 'overall',
			width: colWidthOverall.value,
			resizable: colResizable.value,
			align: 'center',
			sorter: 'default',
			render: (row) => h(OverallRate, { row: row }),
		},
		// 条目
		{
			title: () =>
				h(TableText, {
					value: displayStore.showCharacter ? '角色' : displayStore.mergeSeries ? '系列' : '作品',
				}),
			key: 'subjects',
			titleAlign: 'center',
			render: (row) => h(Item, { row: row }),
		},
	]
)

const visibleColumns = computed(() =>
	columns.value.filter((col) => {
		if (
			displayStore.showCharacter &&
			((col as TableBaseColumn).key === 'average' || (col as TableBaseColumn).key === 'overall')
		) {
			return false
		}
		return true
	})
)

const handleSorterChange = (sorter: DataTableSortState) => {
	switch (sorter.columnKey) {
		case 'count':
			paginationStore.sortBy = SORT_TYPE.COUNT
			break
		case 'average':
			paginationStore.sortBy = SORT_TYPE.AVERAGE
			break
		case 'overall':
			paginationStore.sortBy = SORT_TYPE.OVERALL
			break
	}

	if (sorter.order === 'ascend') {
		paginationStore.ascend = true
	} else {
		paginationStore.ascend = false
	}

	paginationStore.page = 1

	updateAndFetch(false)
}

const dataTableRef = ref<ComponentPublicInstance | null>(null)
let prevFocusID: number | null = null
const onContainerClick = (event: MouseEvent): void => {
	if (!globalStore.isMobile) {
		return
	}

	const target = event.target as HTMLElement
	if (!dataTableRef?.value?.$el.contains(target)) {
		prevFocusID = null
		return
	}
	
	const link = target.closest('a[data-link-id]') as HTMLAnchorElement | null

	if (!link) {
		prevFocusID = null
		return
	}

	const idAttr = link.getAttribute('data-link-id')
	const id = Number(idAttr)

	if (id != prevFocusID) {
		prevFocusID = id
		event.preventDefault()
		return
	}
}

onMounted(() => {
	document.addEventListener('click', onContainerClick, true)
})

onBeforeUnmount(() => {
	document.removeEventListener('click', onContainerClick, true)
})
</script>

<template>
	<n-data-table
		class="data-table"
		ref="dataTableRef"
		:columns="visibleColumns"
		:data="responseStore.response.summaries"
		:single-line="false"
		:max-height="displayStore.tableHeight"
		:loading="globalStore.isLoading"
		striped
		@update:sorter="handleSorterChange"
	>
		<template #loading>
			<n-flex vertical>
				<n-spin>
					<template #description>
						<div class="loading-text">
							<h2 style="margin: 0">查询/加载中</h2>
							<p style="margin: 0">条目越多所需要的时间可能就越长</p>
							<p style="margin: 0">如果查询全站太慢请设置大一点的最小收藏人数</p>
						</div>
					</template>
				</n-spin>
			</n-flex>
		</template>
	</n-data-table>
</template>

<style scoped>
.data-table {
	width: 90vw;
}

.n-data-table {
	overflow: hidden;
}

:deep(.n-data-table-base-table-body.n-scrollbar) {
	--n-scrollbar-width: 6px !important;
	--n-scrollbar-rail-right-vertical-right: 0 !important;
}

:deep(.n-data-table-td--last-col) {
	padding: 0;
	overflow: hidden;
}

@media (max-width: 768px) {
	:deep(.n-data-table-base-table-body.n-scrollbar) {
		--n-scrollbar-width: 3px !important;
	}
}

.loading-text {
	width: 100vw;
	margin-top: 8px;
	display: flex;
	justify-content: center;
	flex-direction: column;
	align-items: center;
	text-shadow: 0 0 12px #7c7c7c75;
}
</style>

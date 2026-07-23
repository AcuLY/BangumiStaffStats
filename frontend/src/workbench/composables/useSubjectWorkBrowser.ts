import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from 'vue'
import type { SelectOption } from 'naive-ui'
import type { Subject } from '../types'

export type SubjectWorkSortOrder = 'desc' | 'asc'
export type SubjectWorkComparator = (a: Subject, b: Subject, direction: 1 | -1) => number

export type SubjectWorkSortOption<T extends string = string> = Omit<SelectOption, 'label' | 'value'> & {
	label: string
	value: T
}

interface SubjectWorkBrowserOptions<T extends string> {
	subjects: MaybeRefOrGetter<Subject[]>
	search?: Ref<string>
	searchTerms: (subject: Subject) => unknown[]
	includeSubject?: (subject: Subject, sort: T) => boolean
	initialSort: T
	comparators: Record<T, SubjectWorkComparator>
	fallbackComparator?: SubjectWorkComparator
	initialOrder?: SubjectWorkSortOrder
	initialPageSize?: number
}

export const SUBJECT_WORK_PAGE_SIZES = [5, 10, 20]
	.map((value) => ({ label: `每页 ${value} 部`, value }))

export const compactSubjectSearch = (value: unknown) => String(value ?? '')
	.normalize('NFKC')
	.toLocaleLowerCase('zh-CN')
	.replace(/[\s·・_-]/g, '')

export const compareSubjectNumber = (
	aValue: unknown,
	bValue: unknown,
	direction: 1 | -1,
) => {
	const a = Number(aValue)
	const b = Number(bValue)
	const aValid = Number.isFinite(a) && a > 0
	const bValid = Number.isFinite(b) && b > 0
	if (aValid !== bValid) return aValid ? -1 : 1
	return aValid && bValid ? (a - b) * direction : 0
}

export const compareSubjectText = (
	aValue: unknown,
	bValue: unknown,
	direction: 1 | -1,
) => {
	const a = String(aValue ?? '')
	const b = String(bValue ?? '')
	if (Boolean(a) !== Boolean(b)) return a ? -1 : 1
	return a.localeCompare(b, 'zh-CN', { numeric: true }) * direction
}

export function useSubjectWorkBrowser<T extends string>(options: SubjectWorkBrowserOptions<T>) {
	const sourceSubjects = computed(() => toValue(options.subjects))
	const search = options.search ?? ref('')
	const sort = ref(options.initialSort) as Ref<T>
	const order = ref<SubjectWorkSortOrder>(options.initialOrder ?? 'desc')
	const page = ref(1)
	const pageSize = ref(options.initialPageSize ?? 10)
	const eligibleSubjects = computed(() => options.includeSubject
		? sourceSubjects.value.filter((subject) => options.includeSubject!(subject, sort.value))
		: sourceSubjects.value)

	const filteredSubjects = computed(() => {
		const query = compactSubjectSearch(search.value)
		if (!query) return eligibleSubjects.value
		return eligibleSubjects.value.filter((subject) => options.searchTerms(subject)
			.some((value) => compactSubjectSearch(value).includes(query)))
	})

	const sortedSubjects = computed(() => {
		const direction = order.value === 'asc' ? 1 : -1
		const comparator = options.comparators[sort.value]
		return [...filteredSubjects.value].sort((a, b) => comparator(a, b, direction)
			|| options.fallbackComparator?.(a, b, direction)
			|| Number(a.id) - Number(b.id))
	})

	const pageCount = computed(() => Math.max(1, Math.ceil(sortedSubjects.value.length / pageSize.value)))
	const pageStart = computed(() => (page.value - 1) * pageSize.value)
	const visibleSubjects = computed(() => sortedSubjects.value.slice(pageStart.value, pageStart.value + pageSize.value))
	const range = computed(() => ({
		start: sortedSubjects.value.length ? pageStart.value + 1 : 0,
		end: Math.min(pageStart.value + pageSize.value, sortedSubjects.value.length),
	}))
	const rangeLabel = computed(() => `${range.value.start}—${range.value.end} / ${sortedSubjects.value.length}`)

	watch([filteredSubjects, sort, order, pageSize], () => { page.value = 1 })
	watch(pageCount, (count) => { page.value = Math.min(page.value, count) })

	return {
		search,
		sort,
		order,
		page,
		pageSize,
		filteredSubjects,
		sortedSubjects,
		visibleSubjects,
		pageCount,
		range,
		rangeLabel,
	}
}

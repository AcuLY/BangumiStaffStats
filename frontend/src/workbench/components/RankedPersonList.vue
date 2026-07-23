<script setup lang="ts">
import { computed } from 'vue'
import type { Person, RankingMetric } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import { useWorkbenchControlSize } from '../composables/useWorkbenchControlSize'
import { SEARCH_EMPTY_COPY } from '../searchEmptyCopy'
import AppIcon from './AppIcon.vue'
import SafeImage from './SafeImage.vue'

interface CooperationPerson extends Person {
	positionIds: number[]
}

const props = withDefaults(defineProps<{
	items: Array<Person | CooperationPerson>
	variant: 'ranking' | 'cooperation'
	rankOffset?: number
	metric?: RankingMetric
	focusedId?: number
	averageLabel?: string
	emptyTitle?: string
	emptyDescription?: string
}>(), {
	rankOffset: 0,
	metric: 'count',
	focusedId: 0,
	averageLabel: '均分',
	emptyTitle: SEARCH_EMPTY_COPY.person,
	emptyDescription: '',
})

const emit = defineEmits<{
	activate: [personId: number]
}>()

const workbench = useWorkbench()
const { isMobile } = useWorkbenchControlSize()
const showPreference = computed(() => !workbench.query.isGlobal)

const formatScore = (value: number | null | undefined, hasRating = true) =>
	hasRating && Number.isFinite(value) ? Number(value).toFixed(2) : '—'

const formatPreference = (person: Person) => {
	const value = person.preference?.score
	if (value === null || value === undefined || !Number.isFinite(value)) return '—'
	return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(2)}`
}

const hasPreference = (person: Person) => Number.isFinite(person.preference?.score)
const preferenceSign = (person: Person) => Number(person.preference?.score) < 0 ? '−' : '+'
const preferenceMagnitude = (person: Person) => Math.abs(Number(person.preference?.score)).toFixed(2)

const progressClass = (person: Person) => {
	const progress = workbench.rankingProgress(person)
	return {
		'is-signed': progress.signed,
		'is-positive': progress.direction === 'positive',
		'is-negative': progress.direction === 'negative',
		'is-neutral': progress.direction === 'neutral',
	}
}

const progressStyle = (person: Person) => ({
	'--row-progress': `${workbench.rankingProgress(person).percent}%`,
})

const ratingCount = (person: Person) => workbench.query.isGlobal
	? Number(person.globalRatedSubjectCount || 0)
	: Number(person.ratedSubjectCount || 0)
const metricSummary = (person: Person) => [
	`${person.subjectCount ?? 0} ${workbench.query.mergeSeries ? '个系列' : '部作品'}`,
	`${props.averageLabel} ${formatScore(workbench.rankingValue(person, 'average'), Boolean(ratingCount(person)))}`,
	`综合分 ${formatScore(workbench.rankingValue(person, 'overall'), Boolean(ratingCount(person)))}`,
	...(showPreference.value ? [`相对偏好 ${formatPreference(person)}`] : []),
].join('，')

const isCooperation = (person: Person | CooperationPerson): person is CooperationPerson =>
	'positionIds' in person
const activeMetric = () => props.variant === 'ranking' ? workbench.rankingMetric.value : props.metric
const focused = (person: Person) => props.variant === 'ranking'
	? workbench.focusedPersonId.value === person.id
	: props.focusedId === person.id
const secondaryLabel = (person: Person | CooperationPerson) => isCooperation(person)
	? person.positionIds.map(workbench.positionLabel).join(' / ')
	: workbench.personSecondaryName(person) || '人物资料'
const identityTooltipSecondary = (person: Person | CooperationPerson) => {
	const label = secondaryLabel(person)
	return label && label !== workbench.personName(person) && label !== '人物资料' ? label : ''
}
const identityTooltipLabel = (person: Person | CooperationPerson) =>
	[workbench.personName(person), identityTooltipSecondary(person)].filter(Boolean).join('\n')
</script>

<template>
	<div
		class="list-columns list-columns--ranking"
		:class="{ 'single-cooperation__list-columns': variant === 'cooperation' }"
		aria-hidden="true"
	>
		<span>#</span>
		<span />
		<span>人物</span>
		<span class="list-columns__metrics" :class="{ 'is-global': !showPreference }">
			<span>{{ workbench.query.mergeSeries ? '系列' : '作品' }}</span>
			<span>均分</span>
			<span>综合</span>
			<span v-if="showPreference">偏好</span>
		</span>
	</div>

	<div
		class="person-list"
		:class="[
			`person-list--${variant}`,
			{ 'person-list--ranking': variant === 'cooperation' },
		]"
	>
		<template v-for="(person, index) in items" :key="`${variant}-${person.id}`">
			<button
				class="person-row person-row--ranking"
				:class="{
					'person-row--cooperation': variant === 'cooperation',
					'is-focused': focused(person),
					'has-signed-progress': variant === 'ranking' && workbench.rankingProgress(person).signed,
				}"
				:style="variant === 'ranking' ? progressStyle(person) : undefined"
				:aria-current="focused(person) ? 'true' : undefined"
				:aria-controls="variant === 'ranking' ? 'ranking-inspector' : 'single-cooperation-works-title'"
				:aria-expanded="variant === 'ranking' ? focused(person) && (!isMobile || workbench.inspectorDrawerOpen.value) : undefined"
				:aria-label="variant === 'ranking'
					? `${rankOffset + index + 1}. ${workbench.personName(person)}，${secondaryLabel(person)}，${metricSummary(person)}`
					: `查看与${workbench.personName(person)}合作的 ${person.subjectCount ?? 0} ${workbench.query.mergeSeries ? '个系列' : '部作品'}，${metricSummary(person)}`"
				type="button"
				@click="emit('activate', person.id)"
			>
				<span v-if="variant === 'ranking'" class="person-row__progress" :class="progressClass(person)" aria-hidden="true" />
				<span class="person-row__rank">{{ rankOffset + index + 1 }}</span>
				<SafeImage
					class="person-row__avatar"
					:sources="workbench.personImageSources(person)"
					:alt="workbench.personName(person)"
					kind="person"
					decorative
					:width="36"
				/>
				<span class="person-row__identity" :title="identityTooltipLabel(person)">
					<strong>{{ workbench.personName(person) }}</strong>
					<small>{{ secondaryLabel(person) }}</small>
				</span>
				<span class="person-row__metrics" :class="{ 'is-global': !showPreference }" :aria-label="metricSummary(person)">
					<span class="person-row__metric" :class="{ 'is-active': activeMetric() === 'count' }">
						<strong>{{ person.subjectCount ?? 0 }}</strong>
					</span>
					<span class="person-row__metric" :class="{ 'is-active': activeMetric() === 'average' }">
						<strong>{{ formatScore(workbench.rankingValue(person, 'average'), Boolean(ratingCount(person))) }}</strong>
					</span>
					<span class="person-row__metric" :class="{ 'is-active': activeMetric() === 'overall' }">
						<strong>{{ formatScore(workbench.rankingValue(person, 'overall'), Boolean(ratingCount(person))) }}</strong>
					</span>
					<span v-if="showPreference" class="person-row__metric" :class="{ 'is-active': activeMetric() === 'preference', 'is-unavailable': !hasPreference(person) }">
						<strong v-if="hasPreference(person)" class="person-row__signed-value"><span>{{ preferenceSign(person) }}</span><span>{{ preferenceMagnitude(person) }}</span></strong>
						<strong v-else>—</strong>
					</span>
				</span>
			</button>

		</template>

		<div v-if="!items.length" class="person-list__empty">
			<AppIcon name="search" :size="22" />
			<strong>{{ emptyTitle }}</strong>
			<span v-if="emptyDescription">{{ emptyDescription }}</span>
		</div>
	</div>
</template>

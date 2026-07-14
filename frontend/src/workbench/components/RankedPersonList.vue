<script setup lang="ts">
import type { CandidatePerson, Person } from '../types'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'
import SafeImage from './SafeImage.vue'

withDefaults(defineProps<{
	items: Array<Person | CandidatePerson>
	variant: 'ranking' | 'candidate'
	rankOffset?: number
	emptyTitle?: string
	emptyDescription?: string
}>(), {
	rankOffset: 0,
	emptyTitle: '没有匹配的人物',
	emptyDescription: '换一个搜索词或筛选条件。',
})

const emit = defineEmits<{
	activate: [personId: number]
	toggle: [personId: number, positionId: number]
}>()

const workbench = useWorkbench()

const formatScore = (value: number | undefined, hasRating = true) =>
	hasRating && Number.isFinite(value) ? Number(value).toFixed(2) : '—'

const metricSummary = (person: Person) => [
	`${person.subjectCount ?? 0} 部作品`,
	`我的均分 ${formatScore(person.userAverage, Boolean(person.ratedSubjectCount))}`,
	`综合分 ${formatScore(workbench.rankingValue(person, 'overall'), Boolean(person.ratedSubjectCount))}`,
].join('，')

const isCandidate = (person: Person | CandidatePerson): person is CandidatePerson =>
	'activePositionId' in person
</script>

<template>
	<div class="person-list" :class="`person-list--${variant}`">
		<template v-for="(person, index) in items" :key="`${variant}-${person.id}`">
			<button
				v-if="variant === 'ranking'"
				class="person-row person-row--ranking"
				:class="{ 'is-focused': workbench.focusedPersonId.value === person.id }"
				:style="{ '--row-progress': `${workbench.rankingProgress(person)}%` }"
				:aria-current="workbench.focusedPersonId.value === person.id ? 'true' : undefined"
				aria-controls="ranking-inspector"
				:aria-expanded="workbench.focusedPersonId.value === person.id"
				type="button"
				@click="emit('activate', person.id)"
			>
				<span class="person-row__progress" aria-hidden="true" />
				<span class="person-row__rank">{{ rankOffset + index + 1 }}</span>
				<SafeImage
					class="person-row__avatar"
					:sources="workbench.personImageSources(person)"
					:alt="workbench.personName(person)"
					kind="person"
					decorative
					:width="36"
					:height="44"
				/>
				<span class="person-row__identity">
					<strong>{{ workbench.personName(person) }}</strong>
					<small>{{ workbench.personSecondaryName(person) || '人物资料' }}</small>
				</span>
				<span class="person-row__metrics" :aria-label="metricSummary(person)">
					<span class="person-row__metric" :class="{ 'is-active': workbench.rankingMetric.value === 'count' }">
						<strong>{{ person.subjectCount ?? 0 }}</strong>
						<small>作品</small>
					</span>
					<span class="person-row__metric" :class="{ 'is-active': workbench.rankingMetric.value === 'average' }">
						<strong>{{ formatScore(person.userAverage, Boolean(person.ratedSubjectCount)) }}</strong>
						<small>均分</small>
					</span>
					<span class="person-row__metric" :class="{ 'is-active': workbench.rankingMetric.value === 'overall' }">
						<strong>{{ formatScore(workbench.rankingValue(person, 'overall'), Boolean(person.ratedSubjectCount)) }}</strong>
						<small>综合</small>
					</span>
				</span>
				<AppIcon class="person-row__arrow" name="arrow" :size="17" />
			</button>

			<button
				v-else-if="isCandidate(person)"
				class="person-row person-row--candidate"
				type="button"
				:class="{ 'is-selected': workbench.isScopeSelected(person.id, person.activePositionId) }"
				:aria-pressed="workbench.isScopeSelected(person.id, person.activePositionId)"
				:aria-label="`${workbench.isScopeSelected(person.id, person.activePositionId) ? '移除' : '选择'}${workbench.personName(person)}的${person.activePositionLabel}身份`"
				@click="emit('toggle', person.id, person.activePositionId)"
			>
				<span class="candidate-row__portrait">
					<SafeImage
						class="person-row__avatar"
						:sources="workbench.personImageSources(person)"
						:alt="workbench.personName(person)"
						kind="person"
						decorative
						:width="36"
						:height="44"
					/>
					<span v-if="workbench.isScopeSelected(person.id, person.activePositionId)" class="candidate-row__selected-state" aria-hidden="true">
						<AppIcon name="check" :size="11" />
					</span>
				</span>
				<span class="person-row__identity">
					<strong>{{ workbench.personName(person) }}</strong>
					<small>{{ person.activePositionLabel }} · {{ person.activeSubjectCount }} 部</small>
				</span>
			</button>
		</template>

		<div v-if="!items.length" class="person-list__empty">
			<AppIcon name="search" :size="22" />
			<strong>{{ emptyTitle }}</strong>
			<span>{{ emptyDescription }}</span>
		</div>
	</div>
</template>

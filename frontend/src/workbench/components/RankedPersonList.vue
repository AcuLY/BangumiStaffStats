<script setup lang="ts">
import { computed } from 'vue'
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

const metricLabel = computed(() => ({
	count: '作品',
	average: '均分',
	overall: '综合',
})[workbench.rankingMetric.value])

const formatMetric = (person: Person) => {
	const value = workbench.rankingValue(person)
	return workbench.rankingMetric.value === 'count' ? String(value) : value.toFixed(2)
}

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
				type="button"
				@click="emit('activate', person.id)"
			>
				<span class="person-row__progress" aria-hidden="true" />
				<span class="person-row__rank">{{ rankOffset + index + 1 }}</span>
					<SafeImage
						class="person-row__avatar"
						:sources="workbench.personImageSources(person, 'small')"
						:alt="workbench.personName(person)"
						kind="person"
						decorative
					:width="44"
					:height="44"
				/>
				<span class="person-row__identity">
					<strong>{{ workbench.personName(person) }}</strong>
					<small>{{ workbench.personSecondaryName(person) || '人物资料' }}</small>
				</span>
				<span class="person-row__metric">
					<strong>{{ formatMetric(person) }}</strong>
					<small>{{ metricLabel }}</small>
				</span>
				<AppIcon class="person-row__arrow" name="arrow" :size="17" />
			</button>

			<article v-else-if="isCandidate(person)" class="person-row person-row--candidate" :class="{ 'is-selected': workbench.isScopeSelected(person.id, person.activePositionId) }">
				<button
					class="person-row__select"
					type="button"
					:aria-pressed="workbench.isScopeSelected(person.id, person.activePositionId)"
					:aria-label="`${workbench.isScopeSelected(person.id, person.activePositionId) ? '移除' : '选择'}${workbench.personName(person)}的${person.activePositionLabel}身份`"
					@click="emit('toggle', person.id, person.activePositionId)"
				>
					<span class="person-row__select-glyph">
						<AppIcon :name="workbench.isScopeSelected(person.id, person.activePositionId) ? 'check' : 'plus'" :size="18" />
					</span>
				</button>
					<SafeImage
						class="person-row__avatar"
						:sources="workbench.personImageSources(person, 'small')"
						:alt="workbench.personName(person)"
						kind="person"
						decorative
					:width="42"
					:height="42"
				/>
				<span class="person-row__identity">
					<strong>{{ workbench.personName(person) }}</strong>
					<small>{{ person.activePositionLabel }} · {{ person.activeSubjectCount }} 部</small>
				</span>
				<span class="person-row__metric">
					<strong>{{ person.activeAverage ? person.activeAverage.toFixed(2) : '—' }}</strong>
					<small>我的均分</small>
				</span>
			</article>
		</template>

		<div v-if="!items.length" class="person-list__empty">
			<AppIcon name="search" :size="22" />
			<strong>{{ emptyTitle }}</strong>
			<span>{{ emptyDescription }}</span>
		</div>
	</div>
</template>

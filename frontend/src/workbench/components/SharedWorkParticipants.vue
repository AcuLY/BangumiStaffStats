<script setup lang="ts">
import { computed } from 'vue'
import type { Person, Subject, SubjectSeriesView } from '../types'
import {
	aggregateParticipationEntries,
	buildParticipationEntries,
} from '../domain/participationEntries'
import type { ParticipationEntryOccurrence } from '../domain/participationEntries'
import { useWorkbench } from '../composables/useWorkbench'
import AdaptiveParticipantBody from './AdaptiveParticipantBody.vue'

const props = defineProps<{
	participants: Array<{
		person: Person
		positionIds: number[]
	}>
	subject?: Subject
	subjectId?: number
	series?: SubjectSeriesView
}>()

const workbench = useWorkbench()
const activeSeries = computed(() => props.series ?? props.subject?.series)
const activeSubjectId = computed(() => Number(props.subject?.id ?? props.subjectId ?? 0))
const participantSubjectIds = (person: Person) => {
	const mappedIds = activeSeries.value?.participantSubjectIds?.[String(person.id)]
	const fallbackIds = activeSubjectId.value > 0 ? [activeSubjectId.value] : []
	return [...new Set((mappedIds ?? fallbackIds).map(Number))]
}
const participationEntries = (person: Person, positionIds: number[], subjectIds: number[]) => {
	const occurrences: ParticipationEntryOccurrence[] = []
	for (const positionId of [...new Set(positionIds.map(Number))]) {
		for (const subjectId of subjectIds) {
			for (const entry of buildParticipationEntries({
				person,
				positionIds: [positionId],
				subjectId,
				positionLabel: workbench.positionLabel,
				positionSubjectIds: workbench.positionSubjectIds,
				personSubjectRoles: workbench.personSubjectRoles,
			})) {
				occurrences.push({ entry, subjectId })
			}
		}
	}
	return aggregateParticipationEntries(occurrences, Boolean(activeSeries.value))
}
const displayParticipants = computed(() => props.participants.map((item) => {
	const subjectIds = participantSubjectIds(item.person)
	return {
		...item,
		entries: participationEntries(item.person, item.positionIds, subjectIds),
		support: activeSeries.value ? `参与 ${subjectIds.length} 部` : '',
	}
}))
const participantRows = computed(() => Array.from(
	{ length: Math.ceil(displayParticipants.value.length / 2) },
	(_, rowIndex) => displayParticipants.value.slice(rowIndex * 2, rowIndex * 2 + 2),
))
</script>

<template>
	<div class="shared-work-participants">
		<div v-for="(row, rowIndex) in participantRows" :key="row[0]?.person.id" class="shared-work-participant-row">
			<div
				v-for="(item, itemIndex) in row"
				:key="item.person.id"
				class="shared-work-participant"
				:class="{ 'shared-work-participant--series': Boolean(activeSeries) }"
			>
				<span class="shared-work-participant__index" aria-hidden="true">{{ rowIndex * 2 + itemIndex + 1 }}</span>
				<AdaptiveParticipantBody
					:name="workbench.personName(item.person)"
					:entries="item.entries"
					:support="item.support"
				/>
			</div>
		</div>
	</div>
</template>

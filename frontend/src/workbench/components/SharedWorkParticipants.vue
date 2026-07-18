<script setup lang="ts">
import { computed } from 'vue'
import type { Person } from '../types'
import { characterRoleLabel } from '../domain/characterCredits'
import { useWorkbench } from '../composables/useWorkbench'
import AdaptiveParticipantBody from './AdaptiveParticipantBody.vue'

const props = defineProps<{
	participants: Array<{
		person: Person
		positionIds: number[]
	}>
	subjectId: number
}>()

const workbench = useWorkbench()
const participantRows = computed(() => Array.from(
	{ length: Math.ceil(props.participants.length / 2) },
	(_, rowIndex) => props.participants.slice(rowIndex * 2, rowIndex * 2 + 2),
))

interface ParticipationEntry {
	displayName: string
	roleLabel: string
	kind: 'character' | 'position'
}

const participationEntries = (person: Person, positionIds: number[]) => positionIds.flatMap<ParticipationEntry>((positionId) => {
	if (!workbench.positionSubjectIds(person, positionId).includes(Number(props.subjectId))) return []
	if (Number(positionId) !== 102) {
		return [{
			displayName: workbench.positionLabel(positionId),
			roleLabel: '',
			kind: 'position' as const,
		}]
	}
	const roles = workbench.personSubjectRoles(person, props.subjectId, positionId)
	return roles.length
		? roles.map((role) => ({
			displayName: role.displayName || '角色',
			roleLabel: `声优 · ${characterRoleLabel(role)}`,
			kind: 'character' as const,
		}))
		: [{ displayName: '声优', roleLabel: '', kind: 'position' as const }]
})
</script>

<template>
	<div class="shared-work-participants">
		<div v-for="(row, rowIndex) in participantRows" :key="row[0]?.person.id" class="shared-work-participant-row">
			<div v-for="(item, itemIndex) in row" :key="item.person.id" class="shared-work-participant">
				<span class="shared-work-participant__index" aria-hidden="true">{{ rowIndex * 2 + itemIndex + 1 }}</span>
				<AdaptiveParticipantBody
					:name="workbench.personName(item.person)"
					:entries="participationEntries(item.person, item.positionIds)"
				/>
			</div>
		</div>
	</div>
</template>

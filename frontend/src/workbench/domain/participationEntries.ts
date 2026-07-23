import type { Person, PersonRole } from '../types'
import {
	characterCreditKey,
	characterRoleLabel,
	characterRoleLabelPriority,
	characterRolePriority,
	sortByCharacterRolePriority,
} from './characterCredits'

export interface ParticipationEntry {
	key: string
	kind: 'character' | 'position'
	label: string
	displayName?: string
	roleLabel?: string
	count?: number
}

export interface ParticipationEntryOccurrence {
	entry: ParticipationEntry
	subjectId: number
}

interface BuildParticipationEntriesOptions {
	person: Person
	positionIds: number[]
	subjectId: number
	positionLabel: (positionId: number) => string
	positionSubjectIds: (person: Person, positionId: number) => number[]
	personSubjectRoles: (person: Person, subjectId: number, positionId?: number) => PersonRole[]
}

const VOICE_ACTOR_POSITION_ID = 102

const compactText = (value: unknown) => String(value ?? '').trim()
const uniqueText = (values: unknown[]) => [...new Set(values.map(compactText).filter(Boolean))]

const characterName = (role: PersonRole) => uniqueText([
	role.displayName,
	role.nameCN,
	role.name,
])[0] ?? (Number(role.characterId) > 0 ? `角色 ${Number(role.characterId)}` : '')

const voiceRoleType = (role: PersonRole) => {
	const rawLabel = compactText(role.roleLabel)
	const roleType = Number(role.roleType)
	const hasKnownRoleType = Number.isInteger(roleType) && roleType >= 1 && roleType <= 4
	return rawLabel || hasKnownRoleType ? characterRoleLabel(role) : ''
}

const uniqueVoiceRoles = (roles: PersonRole[]) => {
	const rolesByCharacter = new Map<string, { role: PersonRole; index: number }>()
	roles.forEach((role, index) => {
		const key = characterCreditKey(role)
		const existing = rolesByCharacter.get(key)
		if (!existing || characterRolePriority(role) > characterRolePriority(existing.role)) {
			rolesByCharacter.set(key, { role, index })
		}
	})

	return sortByCharacterRolePriority(
		[...rolesByCharacter.values()]
			.sort((left, right) => left.index - right.index)
			.map(({ role }) => role),
		voiceRoleType,
	)
}

const voiceEntry = (role: PersonRole): ParticipationEntry => {
	const roleType = voiceRoleType(role)
	const name = characterName(role)
	const identity = roleType ? `声优（${roleType}）` : '声优'
	const label = name ? `${identity}：${name}` : identity

	return {
		key: `voice:${characterCreditKey(role)}`,
		kind: 'character',
		label,
		displayName: name || '角色',
		roleLabel: roleType ? `声优 · ${roleType}` : '声优',
	}
}

export const buildParticipationEntries = ({
	person,
	positionIds,
	subjectId,
	positionLabel,
	positionSubjectIds,
	personSubjectRoles,
}: BuildParticipationEntriesOptions): ParticipationEntry[] => {
	const entries: ParticipationEntry[] = []
	const seenPositions = new Set<number>()

	for (const value of positionIds) {
		const positionId = Number(value)
		if (seenPositions.has(positionId)) continue
		seenPositions.add(positionId)
		if (!positionSubjectIds(person, positionId).includes(Number(subjectId))) continue

		if (positionId !== VOICE_ACTOR_POSITION_ID) {
			const label = compactText(positionLabel(positionId)) || `职位 ${positionId}`
			entries.push({
				key: `position:${positionId}`,
				kind: 'position',
				label,
			})
			continue
		}

		const roles = uniqueVoiceRoles(personSubjectRoles(person, subjectId, positionId))
		if (roles.length) {
			entries.push(...roles.map(voiceEntry))
		} else {
			entries.push({
				key: `position:${positionId}`,
				kind: 'position',
				label: '声优',
			})
		}
	}

	return entries
}

export const aggregateParticipationEntries = (
	occurrences: ParticipationEntryOccurrence[],
	includeCounts = false,
): ParticipationEntry[] => {
	const entriesByKey = new Map<string, {
		entry: ParticipationEntry
		subjectIds: Set<number>
	}>()

	for (const { entry, subjectId } of occurrences) {
		const existing = entriesByKey.get(entry.key)
		if (!existing) {
			entriesByKey.set(entry.key, {
				entry,
				subjectIds: new Set([Number(subjectId)]),
			})
			continue
		}

		existing.subjectIds.add(Number(subjectId))
		if (entry.kind === 'character'
			&& characterRoleLabelPriority(entry.label) > characterRoleLabelPriority(existing.entry.label)) {
			existing.entry = entry
		}
	}

	const entries = [...entriesByKey.values()]
	const hasCharacterEntries = entries.some(({ entry }) => entry.kind === 'character')
	return entries
		.filter(({ entry }) => includeCounts || !hasCharacterEntries || entry.key !== 'position:102')
		.map(({ entry, subjectIds }) => ({
			...entry,
			...(includeCounts ? { count: subjectIds.size } : {}),
		}))
}

import { describe, expect, it } from 'vitest'
import type { PersonRole, Subject } from '../types'
import {
	buildCharacterCredits,
	characterCreditKey,
	characterCreditName,
	characterCreditSecondaryName,
	characterRoleLabel,
	characterRoleLabelPriority,
	countUniqueCharacterRoles,
	sortByCharacterRolePriority,
} from './characterCredits'

const subjects: Subject[] = [
	{ id: 10, name: '第一期', nameCN: '作品一' },
	{ id: 20, name: '第二期', nameCN: '作品二' },
]

const rolesBySubject: Record<number, PersonRole[]> = {
	10: [
		{ characterId: 100, roleType: 2, roleLabel: '配角', sortOrder: 3, name: '星野 アイ', nameCN: '星野爱', displayName: '星野爱' },
		{ characterId: 200, roleType: 3, roleLabel: '客串', sortOrder: 6, name: 'Guest', nameCN: '客串角色', displayName: '客串角色' },
	],
	20: [
		{ characterId: 100, roleType: 1, roleLabel: '主役', sortOrder: 1, name: '星野 アイ', nameCN: '星野爱', displayName: '星野爱' },
	],
}

describe('character credits', () => {
	it('groups the same character across works and keeps bilingual names and role types', () => {
		const credits = buildCharacterCredits(subjects, (subject) => rolesBySubject[subject.id] ?? [])

		expect(credits).toHaveLength(2)
		expect(credits[0]).toMatchObject({
			characterId: 100,
			displayName: '星野爱',
			roleLabels: ['主角', '配角'],
			primaryRolePriority: 4,
			subjectCount: 2,
		})
		expect(credits[0].appearances.map((appearance) => appearance.subject.id)).toEqual([10, 20])
		expect(characterCreditName(credits[0])).toBe('星野爱')
		expect(characterCreditSecondaryName(credits[0])).toBe('星野 アイ')
	})

	it('uses character ids for stable uniqueness and falls back to normalized names', () => {
		const namedRole: PersonRole = { name: '同一・角色', nameCN: '同一角色' }
		const spacedRole: PersonRole = { name: '同一 角色', nameCN: '同一角色' }

		expect(characterCreditKey({ characterId: 42, name: '旧名' })).toBe('character:42')
		expect(characterCreditKey(namedRole)).toBe(characterCreditKey(spacedRole))
		expect(countUniqueCharacterRoles([namedRole, spacedRole, { characterId: 42 }])).toBe(2)
	})

	it('keeps both bilingual name rows even when their text is identical', () => {
		expect(characterCreditSecondaryName({
			displayName: '伊藤美来',
			nameCN: '伊藤美来',
			name: '伊藤美来',
		})).toBe('伊藤美来')
	})

	it('normalizes Bangumi role labels into user-facing types', () => {
		expect(characterRoleLabel({ roleType: 1, roleLabel: '主役' })).toBe('主角')
		expect(characterRoleLabel({ roleType: 2, roleLabel: '配角' })).toBe('配角')
		expect(characterRoleLabel({ roleType: 3, roleLabel: '客串' })).toBe('客串')
		expect(characterRoleLabel({ roleType: 5, roleLabel: '其他' })).toBe('其他')
	})

	it('recognizes role priority inside compound labels', () => {
		expect(characterRoleLabelPriority('声优 · 主役')).toBe(4)
		expect(characterRoleLabelPriority('声优 · 主角')).toBe(4)
		expect(characterRoleLabelPriority('声优 · 配角')).toBe(3)
		expect(characterRoleLabelPriority('声优 · 客串')).toBe(2)
		expect(characterRoleLabelPriority('声优')).toBe(1)
		expect(characterRoleLabelPriority('声优（主角）：角色 A')).toBe(4)
		expect(characterRoleLabelPriority('声优（配角）：角色 B')).toBe(3)
		expect(characterRoleLabelPriority('声优（客串）：角色 C')).toBe(2)
		expect(characterRoleLabelPriority('导演')).toBe(1)
	})

	it('sorts role-bearing items by main, supporting, guest, then other while preserving ties', () => {
		const entries = [
			{ id: 'supporting-a', label: '配角' },
			{ id: 'other', label: '声优' },
			{ id: 'main', label: '声优 · 主角' },
			{ id: 'guest', label: '客串' },
			{ id: 'supporting-b', label: '声优 · 配角' },
		]

		expect(sortByCharacterRolePriority(entries, entry => entry.label).map(entry => entry.id)).toEqual([
			'main',
			'supporting-a',
			'supporting-b',
			'guest',
			'other',
		])
		expect(entries.map(entry => entry.id)).toEqual([
			'supporting-a',
			'other',
			'main',
			'guest',
			'supporting-b',
		])
	})
})

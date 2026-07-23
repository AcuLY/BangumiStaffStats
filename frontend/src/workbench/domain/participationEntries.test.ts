import { describe, expect, it } from 'vitest'
import type { Person, PersonRole } from '../types'
import {
	aggregateParticipationEntries,
	buildParticipationEntries,
} from './participationEntries'

const person: Person = { id: 1, displayName: '测试人物' }
const positionLabels: Record<number, string> = {
	3: '脚本',
	6: '系列构成',
	10: '音乐',
	102: '声优',
}

const buildEntries = ({
	positionIds,
	positionSubjects = {},
	roles = [],
}: {
	positionIds: number[]
	positionSubjects?: Record<number, number[]>
	roles?: PersonRole[]
}) => buildParticipationEntries({
	person,
	positionIds,
	subjectId: 100,
	positionLabel: (positionId) => positionLabels[positionId] ?? '',
	positionSubjectIds: (_person, positionId) => positionSubjects[positionId] ?? [],
	personSubjectRoles: () => roles,
})

describe('participation entries', () => {
	it('keeps matching staff positions in query order and removes duplicate positions', () => {
		const entries = buildEntries({
			positionIds: [3, 3, 6, 10],
			positionSubjects: {
				3: [100],
				6: [100],
				10: [200],
			},
		})

		expect(entries.map((entry) => entry.label)).toEqual(['脚本', '系列构成'])
		expect(entries.map((entry) => entry.kind)).toEqual(['position', 'position'])
	})

	it('renders complete voice-actor tags, normalizes role types, and keeps the highest duplicate credit', () => {
		const entries = buildEntries({
			positionIds: [102],
			positionSubjects: { 102: [100] },
			roles: [
				{ characterId: 1, roleType: 2, roleLabel: '配角', displayName: '星野爱' },
				{ characterId: 2, roleType: 3, roleLabel: '客串', displayName: '来宾' },
				{ characterId: 3, displayName: '无类型角色' },
				{ characterId: 1, roleType: 1, roleLabel: '主役', displayName: '星野爱' },
			],
		})

		expect(entries.map((entry) => entry.label)).toEqual([
			'声优（主角）：星野爱',
			'声优（客串）：来宾',
			'声优：无类型角色',
		])
		expect(entries.map((entry) => entry.displayName)).toEqual(['星野爱', '来宾', '无类型角色'])
		expect(entries.map((entry) => entry.roleLabel)).toEqual(['声优 · 主角', '声优 · 客串', '声优'])
		expect(entries.every((entry) => entry.kind === 'character')).toBe(true)
	})

	it('keeps ordinary positions alongside voice roles for co-star participation', () => {
		const entries = buildEntries({
			positionIds: [3, 102, 6],
			positionSubjects: {
				3: [100],
				102: [100],
				6: [100],
			},
			roles: [{ characterId: 1, roleType: 2, roleLabel: '配角', displayName: '星野爱' }],
		})

		expect(entries.map((entry) => entry.label)).toEqual([
			'脚本',
			'声优（配角）：星野爱',
			'系列构成',
		])
		expect(entries.map((entry) => entry.kind)).toEqual(['position', 'character', 'position'])
	})

	it('counts distinct series works per participation identity and keeps the highest voice role', () => {
		const script = { key: 'position:3', kind: 'position' as const, label: '脚本' }
		const voiceFallback = { key: 'position:102', kind: 'position' as const, label: '声优' }
		const supportingRole = {
			key: 'voice:character:1',
			kind: 'character' as const,
			label: '声优（配角）：星野爱',
			displayName: '星野爱',
			roleLabel: '声优 · 配角',
		}
		const leadRole = {
			...supportingRole,
			label: '声优（主角）：星野爱',
			roleLabel: '声优 · 主角',
		}

		const entries = aggregateParticipationEntries([
			{ entry: script, subjectId: 100 },
			{ entry: script, subjectId: 100 },
			{ entry: script, subjectId: 101 },
			{ entry: voiceFallback, subjectId: 102 },
			{ entry: supportingRole, subjectId: 100 },
			{ entry: leadRole, subjectId: 101 },
		], true)

		expect(entries).toEqual([
			{ ...script, count: 2 },
			{ ...voiceFallback, count: 1 },
			{ ...leadRole, count: 2 },
		])
	})

	it('uses truthful fallbacks for missing character names, types, and role details', () => {
		const namedById = buildEntries({
			positionIds: [102],
			positionSubjects: { 102: [100] },
			roles: [{ characterId: 42, roleType: 2, roleLabel: '配角' }],
		})
		const unnamed = buildEntries({
			positionIds: [102],
			positionSubjects: { 102: [100] },
			roles: [{ roleType: 2, roleLabel: '配角' }],
		})
		const positionOnly = buildEntries({
			positionIds: [102],
			positionSubjects: { 102: [100] },
		})

		expect(namedById[0].label).toBe('声优（配角）：角色 42')
		expect(namedById[0].displayName).toBe('角色 42')
		expect(namedById[0].roleLabel).toBe('声优 · 配角')
		expect(unnamed[0].label).toBe('声优（配角）')
		expect(unnamed[0].displayName).toBe('角色')
		expect(unnamed[0].roleLabel).toBe('声优 · 配角')
		expect(positionOnly[0].label).toBe('声优')
	})
})

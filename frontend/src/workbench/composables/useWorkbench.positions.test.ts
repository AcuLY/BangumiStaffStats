import { describe, expect, it } from 'vitest'
import { retainSelectedScopesForPositions } from './useWorkbench'

describe('co-star selected identity reconciliation', () => {
	it('keeps compatible identities and removes identities outside the new query', () => {
		const scopes = [
			{ personId: 1, positionId: 102 },
			{ personId: 1, positionId: 2 },
			{ personId: 2, positionId: 3 },
		]

		expect(retainSelectedScopesForPositions(scopes, new Set([2, 3]))).toEqual([
			{ personId: 1, positionId: 2 },
			{ personId: 2, positionId: 3 },
		])
		expect(scopes).toHaveLength(3)
	})

	it('allows a query that replaces incompatible selected identities', () => {
		const incompatibleScopes = [
			{ personId: 5745, positionId: 102 },
			{ personId: 4765, positionId: 102 },
			{ personId: 10600, positionId: 102 },
		]

		expect(retainSelectedScopesForPositions(incompatibleScopes, new Set([2]))).toEqual([])
	})
})

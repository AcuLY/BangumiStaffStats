import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const cooperationSource = readFileSync(new URL('./SinglePersonCooperation.vue', import.meta.url), 'utf8')
const rankingSource = readFileSync(new URL('./RankingWorkbench.vue', import.meta.url), 'utf8')
const toolbarSource = readFileSync(new URL('./WorkListToolbar.vue', import.meta.url), 'utf8')
const cooperationStyles = readFileSync(new URL('../styles/modules/single-person-cooperation.css', import.meta.url), 'utf8')

describe('shared ranking controls', () => {
	it('uses WorkListToolbar for both work and cooperation-person sorting', () => {
		expect(cooperationSource).toContain("import WorkListToolbar from './WorkListToolbar.vue'")
		expect(cooperationSource).toContain('<WorkListToolbar')
		expect(cooperationSource).not.toContain("import SortDirectionButton from './SortDirectionButton.vue'")
		expect(cooperationSource).not.toContain('<n-input')
	})

	it('supports an optional filter inside the shared toolbar', () => {
		expect(toolbarSource).toMatch(/<slot\s+name="before-sort"/)
		expect(cooperationStyles).toContain('grid-template-columns: minmax(0, 1fr) minmax(116px, auto) auto;')
	})

	it('uses the same metric-column component in ranking and cooperation lists', () => {
		expect(rankingSource).toContain("import RankingListColumns from './RankingListColumns.vue'")
		expect(rankingSource).toContain('<RankingListColumns')
		expect(cooperationSource).toContain("import RankingListColumns from './RankingListColumns.vue'")
		expect(cooperationSource).toContain('<RankingListColumns')
	})
})

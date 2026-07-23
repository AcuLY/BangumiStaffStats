import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const workbench = read('./composables/useWorkbench.ts')
const inspector = read('./components/PersonInspector.vue')
const analysis = read('./components/AnalysisDashboard.vue')
const cooperation = read('./components/SinglePersonCooperation.vue')

describe('name-only search consumers', () => {
	it('uses the localized-name matcher for every person search', () => {
		expect(workbench).toContain('matchesLocalizedNameSearch(person, rankingSearch.value)')
		expect(workbench).toContain('matchesLocalizedNameSearch(person, candidateSearch.value)')
		expect(cooperation).toContain('matchesLocalizedNameSearch(item.person, partnerSearch.value)')
	})

	it('searches both the representative title and series member titles', () => {
		for (const source of [inspector, analysis, cooperation]) {
			expect(source).toContain('...localizedNameSearchTerms(subject)')
			expect(source).toContain('...(subject.series?.members.flatMap((member) => localizedNameSearchTerms(member)) ?? [])')
		}
		expect(inspector).toContain('searchTerms: subjectSearchTerms')
		for (const source of [analysis, cooperation]) {
			expect(source).toContain('searchTerms: (subject) => [')
		}
		expect(inspector).toContain('focusedWorkSearch.value = localizedNameSearchValue(subject)')
		expect(analysis).toContain('sharedSearch.value = localizedNameSearchValue(subject)')
	})

	it('uses only localized character names for character search', () => {
		expect(inspector).toContain('matchesLocalizedNameSearch(credit, characterSearch.value)')
		expect(inspector).not.toContain('credit.appearances.flatMap')
		expect(inspector).not.toContain('...credit.roleLabels')
	})
})

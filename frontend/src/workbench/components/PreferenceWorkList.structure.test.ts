import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const analysisSource = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')
const inspectorSource = readFileSync(new URL('./PersonInspector.vue', import.meta.url), 'utf8')
const preferenceStyles = readFileSync(new URL('../styles/modules/preference-ranking.css', import.meta.url), 'utf8')

describe('shared preference work list', () => {
	it('uses one component and a component-owned responsive container in both modes', () => {
		for (const source of [analysisSource, inspectorSource]) {
			expect(source).toContain("import PreferenceWorkList from './PreferenceWorkList.vue'")
			expect(source).toContain('<PreferenceWorkList')
			expect(source).not.toContain('class="preference-columns"')
		}

		expect(preferenceStyles).toContain('container: preference-list / inline-size;')
		expect(preferenceStyles).toContain('@container preference-list (max-width: 547px)')
		expect(preferenceStyles).not.toContain('@container person-inspector')
	})
})

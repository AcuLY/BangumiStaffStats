import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const analysisSource = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')
const inspectorSource = readFileSync(new URL('./PersonInspector.vue', import.meta.url), 'utf8')
const preferenceListSource = readFileSync(new URL('./PreferenceWorkList.vue', import.meta.url), 'utf8')
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

	it('keeps empty preference copy concise in both contexts', () => {
		expect(analysisSource).not.toContain('work-noun="共同作品"')
		expect(inspectorSource).toContain("没有同时具备我的评分与有效全站评分的{{ seriesMode ? '系列' : '作品' }}")
		expect(inspectorSource).not.toContain('该人物没有同时具备我的评分与有效全站评分的作品')
		expect(preferenceListSource).not.toContain('workNoun')
		expect(preferenceListSource).toContain("没有高于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}")
		expect(preferenceListSource).toContain("没有低于全站{{ seriesMode ? '均分的系列' : '评分的作品' }}")
	})
})

import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./SinglePersonCooperation.vue', import.meta.url), 'utf8')
const selectedPersonSource = readFileSync(new URL('./SelectedPersonCard.vue', import.meta.url), 'utf8')
const styles = readFileSync(new URL('../styles/modules/single-person-cooperation.css', import.meta.url), 'utf8')
const selectedPeopleStyles = readFileSync(new URL('../styles/modules/selected-people.css', import.meta.url), 'utf8')

describe('SinglePersonCooperation focus invariant', () => {
	it('keeps the focused partner independent from local search results', () => {
		const candidateBlock = source.match(/const cooperationCandidates[\s\S]*?\n\}\)\n\nconst cooperationPeople/)?.[0] ?? ''
		const visiblePeopleBlock = source.match(/const cooperationPeople[\s\S]*?\n\}\)\n\nconst cooperationMetricValue/)?.[0] ?? ''
		const focusWatcher = source.match(/watch\(cooperationPeople[\s\S]*?\}, \{ immediate: true \}\)/)?.[0] ?? ''

		expect(candidateBlock).not.toContain('partnerSearch.value')
		expect(visiblePeopleBlock).toContain('cooperationCandidates.value')
		expect(visiblePeopleBlock).toContain('partnerSearch.value')
		expect(source).toMatch(/const focusedPartner = computed\(\(\) => cooperationCandidates\.value/)
		expect(focusWatcher).toContain('if (people.length)')
		expect(focusWatcher).toContain('if (cooperationCandidates.value.some')
		expect(focusWatcher).toContain('focusedPartnerId.value = cooperationCandidates.value[0]?.person.id ?? 0')
	})

	it('does not render a cancelable no-focus state', () => {
		expect(source).not.toContain('请选择一位合作人物')
		expect(source).not.toContain('当前职位下没有可展示的合作作品。')
		expect(source).toContain('<div v-if="focusedPartner" class="single-cooperation__works">')
		expect(source).toContain("'single-cooperation__workspace--empty': !focusedPartner")
		expect(styles).toMatch(/\.single-cooperation__workspace--empty\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s)
	})

	it('reuses the compact read-only card inside one divider-backed overview slab', () => {
		const selectionStart = source.indexOf('class="single-cooperation__selection-content"')
		const cardStart = source.indexOf('<SelectedPersonCard', selectionStart)
		const summaryStart = source.indexOf('class="single-cooperation__summary-grid metric-grid"', cardStart)

		expect(selectionStart).toBeGreaterThan(-1)
		expect(cardStart).toBeGreaterThan(selectionStart)
		expect(summaryStart).toBeGreaterThan(cardStart)
		expect(source).not.toContain('@remove-position=')
		expect(source).not.toContain('@remove-person=')
		expect(selectedPersonSource).not.toContain('<button')
		expect(selectedPersonSource).not.toContain('defineEmits')
		expect(selectedPersonSource).toContain("{{ workbench.query.mergeSeries ? '参与系列' : workbench.query.isGlobal ? '参与作品' : '收藏作品' }}")
		expect(selectedPersonSource).toContain('<dt class="metric-unit__label">均分</dt>')
		expect(styles).toMatch(/\.single-cooperation__selection-content\s*\{[^}]*gap:\s*1px;[^}]*padding:\s*0;[^}]*background:\s*var\(--divider\);/s)
		expect(selectedPeopleStyles).toMatch(/\.selected-person-card\s*\{[^}]*grid-template-columns:\s*84px minmax\(0, 1fr\);[^}]*min-height:\s*112px;/s)
	})
})

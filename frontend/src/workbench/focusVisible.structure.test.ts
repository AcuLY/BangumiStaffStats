import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const foundationStyles = readWorkbenchFile('./styles/modules/foundation.css')
const pickerStyles = readWorkbenchFile('./styles/modules/people-picker.css')
const preferenceStyles = readWorkbenchFile('./styles/modules/preference-ranking.css')
const characterRoleStyles = readWorkbenchFile('./styles/modules/character-role-list.css')
const inspectorStyles = readWorkbenchFile('./styles/modules/ranking-inspector.css')
const subjectWorkStyles = readWorkbenchFile('./styles/modules/subject-work-list.css')
const rankingRefinementStyles = readWorkbenchFile('./styles/modules/ranking-refinements.css')
const adaptiveRoleSource = readWorkbenchFile('./components/AdaptiveRoleList.vue')
const inspectorSource = readWorkbenchFile('./components/PersonInspector.vue')
const querySource = readWorkbenchFile('./components/QueryWorkspace.vue')

describe('workbench focus-visible boundary', () => {
	it('does not globally erase browser or Naive UI focus indicators', () => {
		expect(foundationStyles).not.toMatch(/(^|\n)\s*:focus-visible\s*\{[^}]*outline\s*:\s*(?:0|none)/s)
		expect(foundationStyles).not.toMatch(/(^|\n)\s*:focus-visible\s*\{[^}]*box-shadow\s*:\s*none/s)
	})

	it('gives the shared project-owned interactives the canonical visible ring', () => {
		for (const selector of [
			'.workbench-brand',
			'.header-edit-card',
			'.query-advanced-collapse__trigger',
			'.person-row--ranking',
			'.person-row--candidate',
			'.preference-work',
			'.person-profile__bio-toggle',
			'.subject-work-row__primary-link',
			'.adaptive-role-list',
			'.character-role-card__appearances',
			'.score-bar',
			'.workbench-footer a',
		]) {
			expect(foundationStyles).toContain(selector)
		}

		expect(foundationStyles).toMatch(/outline:\s*2px solid var\(--focus\);/)
		expect(foundationStyles).toMatch(/outline-offset:\s*2px;/)
		expect(foundationStyles).not.toContain('.n-')
	})

	it('reserves enough space for rings at the known clipping boundaries', () => {
		expect(pickerStyles).toMatch(/\.person-list--candidate\s*\{[^}]*padding:\s*4px;/s)
		expect(preferenceStyles).toMatch(/\.preference-columns li\s*\{[^}]*overflow:\s*visible;/s)
		expect(characterRoleStyles).toMatch(/\.character-role-card__appearance\s*\{[^}]*overflow:\s*visible;/s)
	})

	it('keeps custom info controls visually compact with a 44px hit area', () => {
		expect(inspectorStyles).toMatch(/\.profile-metric__info\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s)
		expect(inspectorStyles).toMatch(/\.profile-metric__info::before\s*\{[^}]*inset:\s*-10px;/s)
		expect(inspectorStyles).toMatch(/\.profile-metric__info \.app-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
		expect(foundationStyles).toMatch(/\.field-help-trigger \.app-icon\s*\{[^}]*width:\s*16px;[^}]*height:\s*16px;/s)
		expect(inspectorSource).not.toMatch(/<AppIcon name="info" :size="13"/)
		expect(querySource).not.toMatch(/<AppIcon name="info" :size="15"/)
	})

	it('keeps text and overflow triggers at least 44px tall without enlarging the bio label', () => {
		expect(foundationStyles).toMatch(/\.workbench-footer a\s*\{[^}]*min-height:\s*var\(--touch-target-min\);/s)
		expect(rankingRefinementStyles).toMatch(/\.person-profile__bio-toggle\s*\{[^}]*min-height:\s*32px;/s)
		expect(rankingRefinementStyles).toMatch(/\.person-profile__bio-toggle::before\s*\{[^}]*inset:\s*-6px 0;/s)
		expect(adaptiveRoleSource).toMatch(/\.adaptive-role-list\[tabindex="0"\]\s*\{[^}]*min-height:\s*var\(--touch-target-min\);/s)
		expect(characterRoleStyles).toMatch(/\.character-role-card__appearances\[tabindex="0"\]\s*\{[^}]*min-height:\s*var\(--touch-target-min\);/s)
	})

	it('expands the inspector bio by default and exposes the toggle on every surface', () => {
		expect(inspectorSource).toContain('const profileBioExpanded = ref(true)')
		expect(inspectorSource).toContain('profileBioExpanded.value = true')
		expect(rankingRefinementStyles).toMatch(/\.person-profile__bio:not\(\.is-expanded\) p\s*\{[^}]*-webkit-line-clamp:\s*2;/s)
		expect(rankingRefinementStyles).not.toMatch(/\.person-profile__bio-toggle\s*\{[^}]*display:\s*none;/s)
	})

	it('extends primary text links to transparent 44px pointer targets', () => {
		for (const [styles, selector] of [
			[subjectWorkStyles, '.subject-work-row__primary-link'],
			[characterRoleStyles, '.character-role-card__name-link'],
			[inspectorStyles, '.person-profile__name-link'],
		] as const) {
			const escapedSelector = selector.replace('.', '\\.')
			expect(styles).toMatch(new RegExp(`${escapedSelector}::before\\s*\\{[^}]*min-width:\\s*var\\(--touch-target-min\\);[^}]*height:\\s*var\\(--touch-target-min\\);`, 's'))
		}
	})

	it('keeps compact picker actions visually small while exposing 44px targets', () => {
		for (const selector of [
			'.picker-heading__close-hit',
			'.selected-position-tag__remove-hit',
			'.selected-person-row__remove-hit',
		]) {
			const escapedSelector = selector.replace('.', '\\.')
			expect(pickerStyles).toMatch(new RegExp(`${escapedSelector}\\s*\\{[^}]*width:\\s*var\\(--touch-target-min\\);[^}]*height:\\s*var\\(--touch-target-min\\);`, 's'))
		}
	})
})

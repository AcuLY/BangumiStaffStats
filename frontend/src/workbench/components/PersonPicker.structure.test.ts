import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const componentSource = readWorkbenchFile('./PersonPicker.vue')
const rankedPersonSource = readWorkbenchFile('./RankedPersonList.vue')
const pickerStyles = readWorkbenchFile('../styles/modules/people-picker.css')
const responsiveStyles = readWorkbenchFile('../styles/modules/workspace-responsive.css')

describe('PersonPicker selected people register', () => {
	it('uses semantic ordered rows without avatars or identity add controls', () => {
		expect(componentSource).toMatch(/<ol id="selected-people-list" class="selected-people-list">/)
		expect(componentSource).toMatch(/<li\s+v-for="\(item, index\) in workbench\.selectedPeople\.value"[\s\S]*class="selected-person-row"/)
		expect(componentSource).toContain('class="selected-person-row__ordinal" aria-hidden="true">{{ index + 1 }}')
		expect(componentSource).not.toContain('selected-position-pill')
		expect(componentSource).not.toContain('position-add-select')
		expect(componentSource).not.toContain('availablePositionOptions')
		expect(componentSource).not.toContain('addIdentity')
		expect(componentSource).toContain('class="selected-position-action__surface"')
		expect(componentSource).toContain('class="selected-person-row__remove-visual"')
		expect(componentSource).toMatch(/class="selected-position-tag__label" :title="workbench\.positionLabel\(positionId\)"/)
	})

	it('keeps identity removal and whole-person removal as separate native buttons', () => {
		expect(componentSource).toMatch(/<button[\s\S]*class="selected-position-action"[\s\S]*type="button"[\s\S]*@click="workbench\.toggleScope\(item\.person\.id, positionId\)"/)
		expect(componentSource).toMatch(/<button[\s\S]*class="selected-person-row__remove"[\s\S]*type="button"[\s\S]*@click="workbench\.removePerson\(item\.person\.id\)"/)
		expect(componentSource).not.toMatch(/<span[^>]+@click="workbench\.(?:toggleScope|removePerson)/)
	})

	it('keeps close glyphs sized by visual hierarchy while the controls retain full hit targets', () => {
		expect(componentSource).toContain('<AppIcon name="close" :size="12" />')
		expect(componentSource).toContain('<AppIcon name="close" :size="14" />')
		expect(componentSource).toContain('<AppIcon name="close" :size="16" />')
		expect(pickerStyles).toMatch(/\.selected-position-action\s*\{[^}]*min-width:\s*var\(--touch-target-min\);[^}]*min-height:\s*var\(--touch-target-min\);/s)
		expect(pickerStyles).toMatch(/\.selected-person-row__remove\s*\{[^}]*width:\s*var\(--touch-target-min\);[^}]*height:\s*var\(--touch-target-min\);/s)
	})

	it('renders independently bordered rows without a list-container frame', () => {
		expect(pickerStyles).toMatch(/\.selected-person-row\s*\{[^}]*display:\s*grid;[^}]*width:\s*100%;[^}]*min-height:\s*var\(--touch-target-min\);[^}]*border:\s*1px solid var\(--divider\);[^}]*background:\s*transparent;/s)
		expect(pickerStyles).not.toMatch(/\.selected-person-row\s*\{[^}]*border-radius:\s*999px;/s)
		expect(pickerStyles).toMatch(/\.selected-people-list\s*\{[^}]*gap:\s*var\(--space-1\);[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s)
		expect(pickerStyles).not.toContain('.selected-person-row::after')
		expect(pickerStyles).toMatch(/\.selected-person-row__name\s*\{[^}]*font-size:\s*var\(--text-body\);[^}]*font-weight:\s*600;/s)
		expect(pickerStyles).toMatch(/\.selected-position-action\s*\{[^}]*font-size:\s*var\(--text-caption\);[^}]*font-weight:\s*600;/s)
		expect(pickerStyles).toMatch(/\.selected-position-action__surface\s*\{[^}]*min-height:\s*28px;[^}]*border-radius:\s*var\(--workbench-tag-radius\);/s)
	})

	it('reserves a 166px viewport for three and a half bordered rows plus gaps', () => {
		expect(pickerStyles).toMatch(/\.person-picker--drawer\s*\{[^}]*--selected-tray-list-height:\s*166px;/s)
		expect(responsiveStyles).toMatch(/\.person-picker:not\(\.person-picker--drawer\)\s*\{[^}]*--selected-tray-list-height:\s*166px;/s)
		expect(pickerStyles).toMatch(/\.selected-people-list\s*\{[^}]*grid-auto-rows:\s*minmax\(var\(--touch-target-min\), auto\);/s)
	})

	it('omits selected-list guidance and reports candidate search misses without suggestions', () => {
		expect(componentSource).not.toContain('从下方候选中选择至少两个人物。')
		expect(componentSource).not.toContain('没有匹配的人物')
		expect(componentSource).not.toContain('换一个搜索词。')
		expect(componentSource).toContain('v-if="workbench.candidateSearch.value.trim() && !workbench.candidatePeople.value.length"')
		expect(componentSource).toContain('{{ SEARCH_EMPTY_COPY.person }}')
		expect(componentSource).toContain('role="status"')
		expect(componentSource).toContain('aria-live="polite"')
		expect(pickerStyles).not.toContain('.selected-empty')
		expect(rankedPersonSource).not.toContain('换一个搜索词或筛选条件。')
		expect(rankedPersonSource).toContain("emptyDescription: ''")
	})
})

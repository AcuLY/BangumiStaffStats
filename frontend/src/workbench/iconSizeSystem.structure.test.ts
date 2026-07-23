import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const appSource = readWorkbenchFile('./WorkbenchApp.vue')
const headerSource = readWorkbenchFile('./components/WorkbenchHeader.vue')
const querySource = readWorkbenchFile('./components/QueryWorkspace.vue')
const querySkeletonSource = readWorkbenchFile('./components/QueryMobilePickerSkeleton.vue')
const queryStyles = readWorkbenchFile('./styles/modules/query-workspace.css')
const responsiveStyles = readWorkbenchFile('./styles/modules/workspace-responsive.css')
const toolbarSource = readWorkbenchFile('./components/WorkListToolbar.vue')
const pickerSource = readWorkbenchFile('./components/PersonPicker.vue')
const inspectorSource = readWorkbenchFile('./components/PersonInspector.vue')
const analysisSource = readWorkbenchFile('./components/AnalysisDashboard.vue')
const rankingListSource = readWorkbenchFile('./components/RankedPersonList.vue')
const safeImageSource = readWorkbenchFile('./components/SafeImage.vue')
const foundationStyles = readWorkbenchFile('./styles/modules/foundation.css')
const pickerStyles = readWorkbenchFile('./styles/modules/people-picker.css')

describe('confirmed workbench icon size system', () => {
	it('aligns every Header action glyph to the 18px theme-toggle reference', () => {
		expect(headerSource).toContain(`<AppIcon :name="workbench.theme.value === 'dark' ? 'sun' : 'moon'" :size="18" />`)
		expect(querySource).toContain('<AppIcon name="chevron" :size="18" />')
		expect(querySource).toContain(`<AppIcon :name="workbench.hasAppliedQuery.value ? 'edit' : 'search'" :size="18" />`)
		expect(appSource).toContain('<AppIcon name="edit" :size="18" />')
		expect(querySkeletonSource).toContain('width="18px" height="18px" round')
		expect(queryStyles).toMatch(/\.header-edit-card__action\s*\{[^}]*display:\s*inline-grid;[^}]*place-items:\s*center;[^}]*justify-self:\s*end;/s)
		expect(responsiveStyles).toMatch(/\.query-summary__action,[\s\S]*?\.query-editor__collapse,[\s\S]*?\.mobile-picker-entry__action\s*\{[^}]*align-self:\s*center;[^}]*width:\s*var\(--touch-target-min\);[^}]*height:\s*28px;/s)
	})

	it('preserves contextual compact, empty-state, selection, and fallback sizes', () => {
		expect(toolbarSource).toContain('<AppIcon name="search" :size="16" />')
		expect(pickerSource).toContain('<AppIcon name="search" :size="16" />')
		expect(pickerSource).toContain('<AppIcon name="search" :size="22" />')
		expect(rankingListSource).toContain('<AppIcon name="search" :size="22" />')
		expect(appSource.match(/<AppIcon name="(?:brand|image|search)" :size="28" \/>/g)).toHaveLength(3)
		expect(inspectorSource).toContain('<AppIcon name="search" :size="28" />')
		expect(analysisSource).toContain('<AppIcon name="info" :size="28" />')
		expect(analysisSource).toContain('<AppIcon name="people" :size="30" />')
		expect(foundationStyles).toMatch(/\.state-icon,\s*\.analysis-empty__icon\s*\{[^}]*width:\s*56px;[^}]*height:\s*56px;/s)
		expect(pickerSource).toContain('<AppIcon name="check" :size="11" />')
		expect(pickerStyles).toMatch(/\.candidate-row__selected-state\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s)
		expect(safeImageSource.match(/:size="portraitKind \? 28 : 24"/g)).toHaveLength(2)
	})
})

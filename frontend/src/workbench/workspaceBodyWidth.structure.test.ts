import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readWorkbenchFile = (relativePath: string) => readFileSync(
	new URL(relativePath, import.meta.url),
	'utf8',
)

const tokensSource = readWorkbenchFile('./styles/tokens.css')
const foundationSource = readWorkbenchFile('./styles/modules/foundation.css')
const responsiveSource = readWorkbenchFile('./styles/modules/foundation-responsive.css')
const workspaceResponsiveSource = readWorkbenchFile('./styles/modules/workspace-responsive.css')
const querySource = readWorkbenchFile('./styles/modules/query-workspace.css')
const appSource = readWorkbenchFile('./WorkbenchApp.vue')

describe('workbench workspace width preview', () => {
	it('uses one 1280px workspace token without a separate body cap', () => {
		expect(tokensSource).toContain('--workspace-max: 1280px;')
		expect(tokensSource).not.toContain('--workspace-body-max:')
		expect(foundationSource).toMatch(
			/\.workbench-body\s*\{[^}]*width:\s*min\(calc\(100% - 32px\), var\(--workspace-max\)\);/s,
		)
		expect(responsiveSource).toMatch(
			/\.workbench-body\s*\{[^}]*width:\s*min\(calc\(100% - 24px\), var\(--workspace-max\)\);/s,
		)
	})

	it('aligns header, query, body, and footer to the shared workspace content line', () => {
		expect(foundationSource).toMatch(
			/\.workbench-header__bar\s*\{[^}]*width:\s*min\(100%, calc\(var\(--workspace-max\) \+ 32px\)\);/s,
		)
		expect(querySource).toMatch(
			/\.query-summary,\s*\.query-editor\s*\{[^}]*width:\s*min\(100%, calc\(var\(--workspace-max\) \+ 32px\)\);/s,
		)
		expect(foundationSource).toMatch(
			/\.workbench-footer\s*\{[^}]*width:\s*min\(calc\(100% - 24px\), var\(--workspace-max\)\);/s,
		)
		expect(responsiveSource).toMatch(
			/\.workbench-header__bar\s*\{[^}]*width:\s*min\(100%, calc\(var\(--workspace-max\) \+ 24px\)\);/s,
		)
		expect(workspaceResponsiveSource).toMatch(
			/\.query-summary,\s*\.mobile-picker-entry\s*\{[^}]*width:\s*min\(100%, calc\(var\(--workspace-max\) \+ 32px\)\);/s,
		)
		expect(workspaceResponsiveSource).toMatch(
			/@media \(width >= 780px\)\s*\{[\s\S]*?\.workbench-page-scroll\s*\{[^}]*scrollbar-gutter:\s*stable both-edges;/,
		)
	})

	it('does not widen the body by mode or selected-person count', () => {
		expect(workspaceResponsiveSource).not.toContain('workbench-app--co-star-comparison')
		expect(workspaceResponsiveSource).not.toContain('workbench-app--co-star-many')
		expect(workspaceResponsiveSource).not.toContain('--workspace-max: 1600px')
		expect(workspaceResponsiveSource).not.toContain('--workspace-max: 1920px')
		expect(appSource).not.toContain('workbench-app--co-star-comparison')
		expect(appSource).not.toContain('workbench-app--co-star-many')
	})
})

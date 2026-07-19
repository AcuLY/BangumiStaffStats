import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(new URL('./QueryWorkspace.vue', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('../styles/modules/query-workspace.css', import.meta.url), 'utf8')
const responsiveStyleSource = readFileSync(new URL('../styles/modules/workspace-responsive.css', import.meta.url), 'utf8')

describe('QueryWorkspace position selector structure', () => {
	it('lets selected positions wrap and grow without widening the query stage', () => {
		expect(componentSource).toContain('class="query-position-select"')
		expect(componentSource).not.toContain('max-tag-count="responsive"')
		expect(styleSource).toMatch(/\.query-stage--positions \.field--positions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
		expect(styleSource).toMatch(/\.query-position-select\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s)
	})

	it('keeps compact header actions and tag triggers on their canonical hit targets', () => {
		expect(styleSource).toMatch(/\.header-edit-card__action\s*\{[^}]*width:\s*34px;[^}]*height:\s*34px;/s)
		expect(responsiveStyleSource).toMatch(/\.query-summary__action,[\s\S]*?\.mobile-picker-entry__action\s*\{[^}]*width:\s*28px;[^}]*height:\s*28px;/s)
		expect(componentSource.match(/class="query-tag-trigger-hit"/g)).toHaveLength(2)
		expect(styleSource).toMatch(/\.query-tag-trigger-hit\s*\{[^}]*min-width:\s*var\(--touch-target-min\);[^}]*min-height:\s*var\(--touch-target-min\);/s)
	})
})

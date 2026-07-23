import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const componentSource = readFileSync(new URL('./QueryWorkspace.vue', import.meta.url), 'utf8')
const workbenchSource = readFileSync(new URL('../composables/useWorkbench.ts', import.meta.url), 'utf8')
const styleSource = readFileSync(new URL('../styles/modules/query-workspace.css', import.meta.url), 'utf8')
const responsiveStyleSource = readFileSync(new URL('../styles/modules/workspace-responsive.css', import.meta.url), 'utf8')

describe('QueryWorkspace position selector structure', () => {
	it('states query validation conditions without imperatives or terminal periods', () => {
		for (const copy of [
			'用户 UID 未填写',
			'条目类型未选择',
			'排行职位未选择',
			'参与职位未选择',
			'收藏类型未选择',
			'${label}起点大于终点',
			'我的评分超出 0–10',
			'${globalRateLabel}超出 0–10',
			'我的评分与全站评分差超出 -10–10',
			'评分人数小于 0',
			'查询条件存在错误',
		]) {
			expect(workbenchSource).toContain(copy)
			expect(workbenchSource).not.toContain(`${copy}。`)
		}

		for (const imperative of ['请输入', '请选择', '请至少选择', '请先修正']) {
			expect(workbenchSource).not.toContain(imperative)
		}
	})

	it('lets selected positions wrap and grow without widening the query stage', () => {
		expect(componentSource).toContain('class="query-position-select"')
		expect(componentSource).not.toContain('max-tag-count="responsive"')
		expect(styleSource).toMatch(/\.query-stage--positions \.field--positions\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/s)
		expect(styleSource).toMatch(/\.query-position-select\s*\{[^}]*width:\s*100%[^}]*min-width:\s*0/s)
	})

	it('keeps compact header actions and tag triggers on their canonical hit targets', () => {
		expect(styleSource).toMatch(/\.header-edit-card__action\s*\{[^}]*width:\s*38px;[^}]*height:\s*38px;/s)
		expect(responsiveStyleSource).toMatch(/\.query-summary__action,[\s\S]*?\.query-editor__collapse,[\s\S]*?\.mobile-picker-entry__action\s*\{[^}]*width:\s*var\(--touch-target-min\);[^}]*height:\s*28px;/s)
		expect(componentSource.match(/class="query-tag-trigger-hit"/g)).toHaveLength(2)
		expect(styleSource).toMatch(/\.query-tag-trigger-hit\s*\{[^}]*min-width:\s*var\(--touch-target-min\);[^}]*min-height:\s*var\(--touch-target-min\);/s)
		expect(componentSource).toContain("const tagTriggerButtonSize = computed<'tiny' | 'small'>(() => controlSize.value === 'small' ? 'tiny' : 'small')")
		expect(componentSource.match(/:size="tagTriggerButtonSize"/g)).toHaveLength(2)
		expect(componentSource.match(/class="query-tag-control-row"/g)).toHaveLength(2)
		expect(componentSource.match(/:input-props="\{ size: controlSize,/g)).toHaveLength(2)
		expect(styleSource).toMatch(/\.query-tag-control-row\s*\{[^}]*min-height:\s*var\(--touch-target-min\);[^}]*align-items:\s*center;/s)
		expect(responsiveStyleSource).toMatch(/@media \(max-width: 480px\)[\s\S]*?\.query-editor__actions > \*\s*\{[^}]*flex:\s*0 0 auto;/s)
	})

	it('preserves keyboard focus restoration while releasing pointer focus', () => {
		expect(componentSource).toContain('let restoreEditorButtonFocus = true')
		expect(componentSource).toContain('let editorButtonPointerActivated = false')
		expect(componentSource).toContain('if (restoreEditorButtonFocus && document.activeElement !== editorButton.value) editorButton.value?.focus()')
		expect(componentSource).toContain('const pointerActivated = editorButtonPointerActivated || event.detail > 0')
		expect(componentSource).toContain('closeEditor(!pointerActivated)')
		expect(componentSource).toContain('if (pointerActivated) editorButton.value?.blur()')
		expect(componentSource).toContain('@pointerdown="markEditorPointerActivation"')
		expect(componentSource).toContain('@pointercancel="clearEditorPointerActivation"')
		expect(componentSource).toContain('@click="toggleEditor"')
	})

	it('wraps the collapsed query summary between complete values', () => {
		expect(componentSource).toContain('const appliedQuerySummaryParts = computed(() => querySummaryPartsFor(workbench.query))')
		expect(componentSource).toContain('const draftQuerySummaryParts = computed(() => querySummaryPartsFor(workbench.queryDraft))')
		expect(componentSource).toContain('const appliedQuerySummary = computed(() => appliedQuerySummaryParts.value.join(\' · \'))')
		expect(componentSource).toContain('v-for="(part, index) in collapsedQuerySummaryParts"')
		expect(componentSource).toContain('class="query-summary__value"')
		expect(styleSource).toMatch(/\.query-summary__value\s*\{[^}]*display:\s*inline-block;[^}]*max-width:\s*100%;[^}]*word-break:\s*keep-all;[^}]*overflow-wrap:\s*anywhere;/s)
		expect(styleSource).toMatch(/\.query-summary__value:not\(:last-child\)::after\s*\{[^}]*content:\s*" ·";/s)
		expect(responsiveStyleSource).toMatch(/\.query-summary__stage-copy strong\s*\{[^}]*overflow-wrap:\s*normal;/s)
		expect(responsiveStyleSource).toMatch(/\.query-summary,\s*\.mobile-picker-entry\s*\{[^}]*padding-block:\s*var\(--space-2\);/s)
	})
})

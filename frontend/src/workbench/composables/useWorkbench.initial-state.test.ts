import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const composableSource = readFileSync(new URL('./useWorkbench.ts', import.meta.url), 'utf8')
const appSource = readFileSync(new URL('../WorkbenchApp.vue', import.meta.url), 'utf8')
const queryWorkspaceSource = readFileSync(new URL('../components/QueryWorkspace.vue', import.meta.url), 'utf8')

describe('workbench initial query boundary', () => {
	it('uses the dedicated empty path for the unapplied query state', () => {
		expect(composableSource).toContain("window.location.pathname.endsWith('/person-workbench-empty.html')")
		expect(composableSource).toContain('const hasAppliedQuery = ref(!showsInitialQueryState)')
		expect(composableSource).toContain('const queryEditing = ref(showsInitialQueryState)')
		expect(composableSource).toContain("userId: requestedUserId || (showsInitialQueryState ? '' : 'lucay126')")
		expect(composableSource).toMatch(/const queryScopeIds = computed\(\(\) => \{\s*if \(!hasAppliedQuery\.value\) return new Set<number>\(\)/)
	})

	it('crosses the applied boundary only after the simulated query succeeds', () => {
		expect(composableSource).toMatch(/Object\.assign\(query, cloneQuery\(next\)\)\s*hasAppliedQuery\.value = true/)
		expect(composableSource).toContain("hasAppliedQuery.value ? '已取消 · 结果未变' : '已取消 · 尚未查询'")
	})

	it('keeps result workbenches hidden behind a first-run state', () => {
		expect(appSource).toContain('v-else-if="!workbench.hasAppliedQuery.value"')
		expect(appSource).toContain('尚未开始查询')
		expect(appSource).toContain('结果只会在你提交查询后出现。')

		const initialState = appSource.match(/<section v-else-if="!workbench\.hasAppliedQuery\.value"[\s\S]*?<\/section>/)?.[0] ?? ''
		expect(initialState).not.toContain('<n-button')
	})

	it('opens the initial editor with first-query labels and a measured overlay', () => {
		expect(queryWorkspaceSource).toContain('aria-level="2">编辑查询</span>')
		expect(queryWorkspaceSource).toContain("'暂无查询'")
		expect(composableSource).toContain("if (!hasAppliedQuery.value) return ''")
		expect(queryWorkspaceSource).toContain('v-if="workbench.queryDraftStatus.value"')
		expect(queryWorkspaceSource).toContain('onMounted(async () => {')
		expect(queryWorkspaceSource).toMatch(/if \(!workbench\.queryEditing\.value\) return\s*await nextTick\(\)\s*syncQueryOverlayTop\(\)/)
	})
})

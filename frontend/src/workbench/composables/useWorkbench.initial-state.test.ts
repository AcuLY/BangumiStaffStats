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
		expect(composableSource).toContain("'co-star': [102, 3, 10, 6]")
		expect(composableSource).toMatch(/const queryScopeIds = computed\(\(\) => \{\s*if \(!hasAppliedQuery\.value\) return new Set<number>\(\)/)
	})

	it('crosses the applied boundary only after the simulated query succeeds', () => {
		expect(composableSource).toMatch(/Object\.assign\(query, cloneQuery\(next\)\)[\s\S]*?hasAppliedQuery\.value = true/)
		expect(composableSource).toContain("hasAppliedQuery.value ? '已取消 · 结果未变' : '已取消 · 尚未查询'")
	})

	it('initializes series results from the route and syncs only the applied query back to it', () => {
		expect(composableSource).toContain('const routeSearch = new URLSearchParams(window.location.search)')
		expect(composableSource).toContain("mergeSeries: routeSearch.get('result') === 'series'")

		const resultRouteWatch = appSource.match(/watch\(\(\) => workbench\.query\.mergeSeries,[\s\S]*?\}, \{ immediate: true \}\)/)?.[0] ?? ''
		expect(resultRouteWatch).toContain("url.searchParams.set('result', 'series')")
		expect(resultRouteWatch).toContain("url.searchParams.delete('result')")
		expect(resultRouteWatch).toContain("window.history.replaceState({}, '', url)")
		expect(resultRouteWatch).not.toContain('queryDraft')
	})

	it('reconciles selected identities after a new co-star position query succeeds', () => {
		expect(composableSource).toMatch(/Object\.assign\(query, cloneQuery\(next\)\)[\s\S]*?selectedScopes\.value = retainSelectedScopesForPositions\(selectedScopes\.value, nextCoStarPositionIds\)[\s\S]*?hasAppliedQuery\.value = true/)
		expect(composableSource).not.toContain('新的参与职位未包含已选人物的')
		expect(composableSource).not.toContain('请先处理已选身份')
	})

	it('starts the prototype with a mixed-position co-star selection from the lucay126 fixture', () => {
		for (const scope of [
			'{ personId: 5745, positionId: 102 }',
			'{ personId: 262, positionId: 3 }',
			'{ personId: 262, positionId: 10 }',
			'{ personId: 9962, positionId: 6 }',
		]) {
			expect(composableSource).toContain(scope)
		}
	})

	it('keeps result workbenches hidden behind a first-run state', () => {
		expect(appSource).toContain('v-else-if="!workbench.hasAppliedQuery.value"')
		expect(appSource).toContain('尚未开始查询')

		const initialState = appSource.match(/<section v-else-if="!workbench\.hasAppliedQuery\.value"[\s\S]*?<\/section>/)?.[0] ?? ''
		expect(initialState).not.toContain('结果只会在你提交查询后出现。')
		expect(initialState).toContain('<n-button')
		expect(initialState).toContain('@click="openQueryEditor"')
		expect(initialState).toContain('设置查询条件')
	})

	it('opens the initial editor with first-query labels and a measured overlay', () => {
		expect(queryWorkspaceSource).toContain('aria-level="2">编辑查询</span>')
		expect(queryWorkspaceSource).toContain("'暂无查询'")
		expect(composableSource).toContain("if (!hasAppliedQuery.value) return ''")
		expect(queryWorkspaceSource).toContain('v-if="workbench.queryDraftStatus.value"')
		expect(queryWorkspaceSource).toContain('defineExpose({ openEditor })')
		expect(queryWorkspaceSource).toContain('onMounted(async () => {')
		expect(queryWorkspaceSource).toMatch(/if \(!workbench\.queryEditing\.value\) return\s*await nextTick\(\)\s*syncQueryOverlayTop\(\)/)
	})
})

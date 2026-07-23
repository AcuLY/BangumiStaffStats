import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./AnalysisDashboard.vue', import.meta.url), 'utf8')
const coStarSource = readFileSync(new URL('./CoStarWorkbench.vue', import.meta.url), 'utf8')
const summarySource = readFileSync(new URL('./SharedRatingSummary.vue', import.meta.url), 'utf8')
const selectedPersonSource = readFileSync(new URL('./SelectedPersonCard.vue', import.meta.url), 'utf8')
const coStarSkeletonSource = readFileSync(new URL('./CoStarQuerySkeleton.vue', import.meta.url), 'utf8')
const dashboardStyles = readFileSync(new URL('../styles/modules/analysis-dashboard.css', import.meta.url), 'utf8')
const peoplePickerStyles = readFileSync(new URL('../styles/modules/people-picker.css', import.meta.url), 'utf8')
const querySkeletonStyles = readFileSync(new URL('../styles/modules/query-skeleton.css', import.meta.url), 'utf8')
const selectedPeopleStyles = readFileSync(new URL('../styles/modules/selected-people.css', import.meta.url), 'utf8')

const extractCssBlock = (styles: string, prelude: string) => {
	const start = styles.indexOf(prelude)
	const openingBrace = styles.indexOf('{', start)
	if (start < 0 || openingBrace < 0) return ''

	let depth = 0
	for (let index = openingBrace; index < styles.length; index += 1) {
		if (styles[index] === '{') depth += 1
		if (styles[index] === '}') depth -= 1
		if (depth === 0) return styles.slice(start, index + 1)
	}

	return ''
}

describe('AnalysisDashboard section structure', () => {
	it('offers one person-selection CTA only in the no-selection state', () => {
		const noSelectionState = source.match(/<div v-if="!workbench\.selectedPeople\.value\.length"[\s\S]*?<\/div>/)?.[0] ?? ''
		const noSharedWorksState = source.match(/<section v-if="!workbench\.sharedSubjects\.value\.length"[\s\S]*?<\/section>/)?.[0] ?? ''

		expect(noSelectionState).toContain('<n-button')
		expect(noSelectionState).toContain('<h2>尚未选择人物</h2>')
		expect(noSelectionState).not.toContain('选择一位人物开始分析')
		expect(noSelectionState).toContain("@click=\"emit('request-person-selection')\"")
		expect(noSelectionState).toContain('>选择人物</n-button>')
		expect(noSelectionState).not.toContain('<p>')
		expect(noSharedWorksState).toContain("<h2>没有共同{{ seriesMode ? '系列' : '作品' }}</h2>")
		expect(noSharedWorksState).not.toContain('没有共同参与的作品')
		expect(noSharedWorksState).not.toContain('<n-button')
		expect(noSharedWorksState).not.toContain('<p>')
	})

	it('opens the mobile picker and briefly highlights the desktop people rail', () => {
		expect(coStarSource).toContain('@request-person-selection="requestPersonSelection"')
		expect(coStarSource).toContain("if (isMobile.value) {")
		expect(coStarSource).toContain('workbench.peopleDrawerOpen.value = true')
		expect(coStarSource).toContain("'people-rail--attention': peopleRailHighlighted")
		expect(coStarSource).toContain('window.setTimeout(clearPeopleRailHighlight, 900)')
		expect(peoplePickerStyles).toMatch(/\.people-rail--attention\s*\{[^}]*box-shadow:\s*inset 0 0 0 2px var\(--focus\);/s)
		expect(peoplePickerStyles).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.people-rail,[\s\S]*?transition-duration:\s*0s;/)
	})

	it('places work tags before ratings and uses the ranking-style preference section', () => {
		const tagsIndex = source.indexOf('heading-id="analysis-tags-title"')
		const ratingsIndex = source.indexOf('aria-label="评分表现"')

		expect(tagsIndex).toBeGreaterThan(-1)
		expect(ratingsIndex).toBeGreaterThan(-1)
		expect(tagsIndex).toBeLessThan(ratingsIndex)
		expect(source).toContain(":title=\"seriesMode ? '代表条目标签' : '作品标签'\"")
		expect(source).toContain('<h2 id="shared-preference-title">相对偏好</h2>')
		expect(source).toContain('workbench.sharedSubjects.value.length && !workbench.query.isGlobal')
		expect(source).not.toContain('preference-model-info')
		expect(source).not.toContain('仅基于当前人物的共同作品')
		expect(source).not.toContain('class="preference-overview"')
	})

	it('states the missing all-member work condition without extra guidance', () => {
		expect(source).toContain(">暂无全员共同{{ seriesMode ? '系列' : '作品' }}</p>")
		expect(source).not.toContain('以下仅比较仍然存在的两两组合')
	})

	it('places one shared-work summary after the read-only selected-person list', () => {
		const panelStart = source.indexOf('class="analysis-section relationship-hero selected-people-panel"')
		const gridStart = source.indexOf('<ol class="selected-people-grid">', panelStart)
		const gridEnd = source.indexOf('</ol>', gridStart)
		const summaryStart = source.indexOf('<SharedRatingSummary', gridEnd)
		const panelEnd = source.indexOf('</section>', summaryStart)

		expect(source).not.toContain('id="rating-title"')
		expect(source).not.toContain('aria-labelledby="rating-title"')
		expect(source).not.toContain('从总体评分、分布和多人组合三个层次比较共同作品。')
		expect(source).not.toContain('class="profile-metrics profile-metrics--extended rating-summary"')
		expect([...source.matchAll(/<SharedRatingSummary/g)]).toHaveLength(1)
		expect(panelStart).toBeGreaterThan(-1)
		expect(gridStart).toBeGreaterThan(panelStart)
		expect(gridEnd).toBeGreaterThan(gridStart)
		expect(summaryStart).toBeGreaterThan(gridEnd)
		expect(panelEnd).toBeGreaterThan(summaryStart)
		expect(source).not.toContain('placement=')

		const labels = [...summarySource.matchAll(/<dt[^>]*>([^<]+)<\/dt>/g)]
			.map((item) => item[1])

		expect(labels).toEqual([
			"{{ props.seriesMode ? '共同系列' : '共同作品' }}",
			"{{ props.seriesMode ? '已评系列' : '已评作品' }}",
			"{{ props.showPersonal ? '全站均分' : '均分' }}",
			'我的均分',
			"{{ props.seriesMode ? '最高均分' : '最高评分' }}",
			"{{ props.seriesMode ? '最低均分' : '最低评分' }}",
		])
	})

	it('uses a compact read-only horizontal card while preserving works and average context', () => {
		const mediaIndex = selectedPersonSource.indexOf('class="selected-person-card__media"')
		const mediaEnd = selectedPersonSource.indexOf('</div>', mediaIndex)
		const bodyIndex = selectedPersonSource.indexOf('class="selected-person-card__body"')
		const headerIndex = selectedPersonSource.indexOf('class="selected-person-card__header"', bodyIndex)
		const headerEnd = selectedPersonSource.indexOf('</header>', headerIndex)
		const mediaBlock = selectedPersonSource.slice(mediaIndex, mediaEnd)
		const headerBlock = selectedPersonSource.slice(headerIndex, headerEnd)
		const metricUnits = [...selectedPersonSource.matchAll(/<div class="metric-unit">([\s\S]*?)<\/div>/g)]
			.map((match) => match[1])

		expect(source).toContain("import SelectedPersonCard from './SelectedPersonCard.vue'")
		expect(source).toContain('<ol class="selected-people-grid">')
		expect(source).toContain('<SelectedPersonCard')
		expect(source).not.toContain('@remove-position=')
		expect(source).not.toContain('@remove-person=')
		expect(selectedPersonSource).toContain('class="selected-person-card"')
		expect(mediaIndex).toBeGreaterThan(-1)
		expect(bodyIndex).toBeGreaterThan(mediaIndex)
		expect(mediaBlock).not.toContain('selected-person-card__ordinal')
		expect(headerBlock).toContain('class="selected-person-card__ordinal"')
		expect(headerBlock).toContain("String(props.index + 1).padStart(2, '0')")
		expect(headerBlock).toContain('class="selected-person-card__signature-rule"')
		expect(headerBlock).toContain('class="selected-person-card__signature"')
		expect(headerBlock.indexOf('class="selected-person-card__ordinal"')).toBeLessThan(headerBlock.indexOf('class="selected-person-card__signature-rule"'))
		expect(headerBlock.indexOf('class="selected-person-card__signature-rule"')).toBeLessThan(headerBlock.indexOf('class="selected-person-card__signature"'))
		expect(selectedPersonSource).toContain('class="selected-person-card__identities"')
		expect(selectedPersonSource).toContain('class="selected-person-card__identity-separator"')
		expect(selectedPersonSource).not.toContain('defineEmits')
		expect(selectedPersonSource).not.toContain('<button')
		expect(selectedPersonSource).not.toContain('selected-person-card__identity-action')
		expect(selectedPersonSource).not.toContain('selected-person-card__remove')
		expect(selectedPersonSource).toContain('class="selected-person-card__metrics metric-grid"')
		expect(selectedPersonSource).toContain("{{ workbench.query.mergeSeries ? '参与系列' : workbench.query.isGlobal ? '参与作品' : '收藏作品' }}")
		expect(selectedPersonSource).toContain('<dt class="metric-unit__label">均分</dt>')
		expect(metricUnits).toHaveLength(2)
		for (const unit of metricUnits) {
			expect(unit.indexOf('<dd class="metric-unit__value">')).toBeGreaterThan(-1)
			expect(unit.indexOf('<dd class="metric-unit__value">')).toBeLessThan(unit.indexOf('<dt class="metric-unit__label">'))
		}
		expect(selectedPersonSource).not.toContain('analysis-profile__content')
	})

	it('keeps the loading profile skeleton structurally aligned with the editorial card signature', () => {
		const mediaIndex = coStarSkeletonSource.indexOf('class="selected-person-card__media query-skeleton__analysis-media"')
		const mediaEnd = coStarSkeletonSource.indexOf('</span>', mediaIndex)
		const headerIndex = coStarSkeletonSource.indexOf('class="selected-person-card__header"', mediaEnd)
		const headerEnd = coStarSkeletonSource.indexOf('</header>', headerIndex)
		const mediaBlock = coStarSkeletonSource.slice(mediaIndex, mediaEnd)
		const headerBlock = coStarSkeletonSource.slice(headerIndex, headerEnd)

		expect(mediaIndex).toBeGreaterThan(-1)
		expect(headerIndex).toBeGreaterThan(mediaEnd)
		expect(mediaBlock).not.toContain('selected-person-card__ordinal')
		expect(mediaBlock).toContain('height="100%" sharp')
		expect(mediaBlock).not.toContain(':sharp="false"')
		expect(headerBlock).toContain('class="selected-person-card__ordinal"')
		expect(headerBlock).toContain('class="selected-person-card__signature-rule"')
		expect(headerBlock).toContain('class="selected-person-card__signature"')
		expect(coStarSkeletonSource).toContain('class="selected-person-card__metrics metric-grid"')
		expect(querySkeletonStyles).toContain('.query-skeleton__analysis-media {\n\theight: 112px;')
		expect(querySkeletonStyles).toContain('.query-skeleton__profile .selected-person-card__signature {')
	})

	it('uses the current query source for every value in the pair matrix', () => {
		expect(source).toContain('const profileModeAverage = (ids: number[]) => workbench.query.isGlobal ? profileGlobalAverage(ids) : profileAverage(ids)')
		expect(source).toContain('const pairModeAverage = (pair: PairStat | undefined) => workbench.query.isGlobal ? pair?.globalAverage : pair?.userAverage')
		expect(source).toContain('formatScore(profileModeAverage(row.subjectIds))')
		expect(source).toContain('formatScore(pairModeAverage(pairFor(row.person.id, column.person.id)))')
		expect(source).not.toContain('formatScore(profileGlobalAverage(row.subjectIds))')
		expect(source).not.toContain("pairFor(row.person.id, column.person.id)?.globalAverage")
	})

	it('keeps series terminology short in dense analysis surfaces and preserves normal terms', () => {
		expect(source).toContain('const seriesMode = computed(() => workbench.query.mergeSeries)')
		expect(source).toContain("label: seriesMode.value ? '共同系列' : '共同作品'")
		expect(source).toContain(':series-mode="seriesMode"')
		expect(source).toContain("{{ seriesMode ? `${workbench.resultSubjectCount(row.subjectIds)} 个系列` : `${row.subjectIds.length} 部作品` }}")
		expect(source).toContain("{{ seriesMode ? `共同 ${pairFor(row.person.id, column.person.id)?.count ?? 0} 个` : `${pairFor(row.person.id, column.person.id)?.count ?? 0} 部共同` }}")
		expect(source).toContain(":title=\"seriesMode ? '共同系列' : '共同作品'\"")
		expect(source).toContain(":heading-meta=\"`${sharedWorks.length}${sharedSearch.trim() ? ` / ${workbench.sharedSubjects.value.length}` : ''} ${seriesMode ? '个系列' : '部'}`\"")
	})

	it('keeps compact cards horizontal, flush with the summary, and capped at two columns', () => {
		const baseGridRule = extractCssBlock(selectedPeopleStyles, '.selected-people-grid')
		const cardRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card')
		const bodyRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__body')
		const headerRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__header')
		const nameRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__name')
		const ordinalRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__ordinal')
		const signatureRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__signature-rule')
		const metricsRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__metrics')
		const metricDividerRule = extractCssBlock(selectedPeopleStyles, '.selected-person-card__metrics > div + div')
		const roomyRule = extractCssBlock(selectedPeopleStyles, '@container selected-people-panel (min-width: 544px)')
		const gridColumns = [...selectedPeopleStyles.matchAll(/\.selected-people-grid(?:--single)?\s*\{([^}]*)\}/g)]
			.map((match) => match[1].match(/grid-template-columns:\s*([^;]+);/)?.[1])
			.filter((value): value is string => Boolean(value))

		expect(selectedPeopleStyles).toContain('container: selected-people-panel / inline-size;')
		expect(baseGridRule).toContain('grid-template-columns: minmax(0, 1fr);')
		expect(baseGridRule).toContain('gap: 1px;')
		expect(baseGridRule).toContain('padding: 0;')
		expect(baseGridRule).toContain('background: var(--divider);')
		expect(cardRule).toContain('grid-template-columns: 84px minmax(0, 1fr);')
		expect(cardRule).toContain('min-height: 112px;')
		expect(cardRule).not.toContain('border:')
		expect(cardRule).not.toContain('border-radius:')
		expect(bodyRule).toContain('grid-template-rows: minmax(0, 1fr) auto;')
		expect(bodyRule).toContain('height: 112px;')
		expect(bodyRule).toContain('color-mix(in oklab, var(--primary) 4%, var(--surface))')
		expect(headerRule).toContain('grid-template-columns: auto 1px minmax(0, 1fr);')
		expect(nameRule).toContain('min-width: 0;')
		expect(nameRule).toContain('max-width: 100%;')
		expect(nameRule).toContain('overflow: hidden;')
		expect(nameRule).toContain('text-overflow: ellipsis;')
		expect(nameRule).toContain('white-space: nowrap;')
		expect(selectedPersonSource).toContain(':title="workbench.personName(props.person)"')
		expect(ordinalRule).toContain('min-width: 2ch;')
		expect(ordinalRule).not.toContain('position: absolute;')
		expect(ordinalRule).not.toContain('background:')
		expect(ordinalRule).not.toContain('box-shadow:')
		expect(signatureRule).toContain('width: 1px;')
		expect(metricsRule).toContain('width: 100%;')
		expect(metricsRule).toContain('padding: 0;')
		expect(metricsRule).toContain('border-top: 1px solid var(--divider);')
		expect(metricsRule).toContain('border-radius: 0;')
		expect(metricDividerRule).toContain('border-inline-start: 1px solid var(--divider);')
		expect(roomyRule).toContain('.selected-people-grid {\n\t\tgrid-template-columns: repeat(2, minmax(0, 1fr));')
		expect(selectedPeopleStyles).toContain('.selected-people-panel > .shared-rating-summary--below {\n\twidth: 100%;\n\tborder-top: 1px solid var(--divider);')
		expect(new Set(gridColumns)).toEqual(new Set([
			'minmax(0, 1fr)',
			'repeat(2, minmax(0, 1fr))',
		]))
		expect(selectedPeopleStyles).not.toContain('text-shadow:')
	})

	it('uses the roomy odd-person track as a subtle, non-interactive relationship canvas', () => {
		const roomyRule = extractCssBlock(selectedPeopleStyles, '@container selected-people-panel (min-width: 544px)')

		expect(roomyRule).toContain('.selected-people-grid:has(> li:last-child:nth-child(odd))::after')
		expect(roomyRule).toContain('.selected-people-grid:not(.selected-people-grid--single):has(> li:last-child:nth-child(odd))::after')
		expect(roomyRule).toContain('--relationship-canvas:')
		expect(roomyRule).toContain('radial-gradient(circle at 47% 50%')
		expect(roomyRule).toContain('radial-gradient(circle at 53% 50%')
		expect(roomyRule).toContain('linear-gradient(var(--relationship-line), var(--relationship-line)) center / 54% 1px no-repeat')
		expect(roomyRule).toContain('pointer-events: none;')
		expect(roomyRule).toContain('user-select: none;')
		expect(roomyRule).not.toContain('cursor: pointer;')
	})

	it('drops connector and per-count topology markup while retaining the bounded analysis surface', () => {
		expect(source).not.toContain('profile-stage__connector')
		expect(source).not.toContain('data-profile-count')
		expect(source).not.toContain('--profile-connector-count')
		expect(source).not.toContain('profile-stage--many')
		expect(source).not.toContain('analysis-profile__content')
		expect(dashboardStyles).toMatch(/\.analysis-main > \.analysis-dashboard--unified \{[^}]*width: 100%;[^}]*max-width: 1440px;[^}]*justify-self: center;/s)
	})

	it('delegates rating comparison with shared works first', () => {
		expect(source).toContain("import ComparisonRatingDistribution from './ComparisonRatingDistribution.vue'")
		expect(source).toContain("import { categoricalPaletteForTheme } from '../categoricalPalette'")
		expect(source).toContain('<ComparisonRatingDistribution')
		expect(source).toContain('const seriesColors = computed(() => categoricalPaletteForTheme(workbench.theme.value))')
		expect(source).toContain('color: seriesColors.value[(index + 1) % seriesColors.value.length]')
		expect(source).toContain("color: seriesColors.value[0],\n\t\tsubjects: workbench.sharedSubjects.value")
		expect(source).toContain('return [sharedWorks, ...people]')
		expect(source).not.toContain('人物与共同作品 · 1–10 分同组同轴对比。')
		expect(source).not.toContain('均分 {{ formatScore(series.average) }} · {{ series.ratedCount }} 部已评')
	})
})

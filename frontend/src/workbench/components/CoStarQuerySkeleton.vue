<script setup lang="ts">
import { useMediaQuery } from '../composables/useMediaQuery'
import QueryPaginationSkeleton from './QueryPaginationSkeleton.vue'
import QueryPreferenceSkeleton from './QueryPreferenceSkeleton.vue'
import QueryTagSummarySkeleton from './QueryTagSummarySkeleton.vue'
import QueryWorkBrowserSkeleton from './QueryWorkBrowserSkeleton.vue'

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const compactViewport = useMediaQuery('(width < 780px)')
const candidates = Array.from({ length: 10 }, (_, index) => index)
const profiles = Array.from({ length: 3 }, (_, index) => index)
const summaryMetrics = Array.from({ length: 6 }, (_, index) => index)
const scoreRows = Array.from({ length: 10 }, (_, index) => index)
const series = Array.from({ length: 4 }, (_, index) => index)
</script>

<template>
	<section
		id="mode-panel-co-star"
		class="co-star-workbench query-skeleton query-skeleton--co-star"
		role="tabpanel"
		aria-labelledby="mode-tab-co-star"
		aria-busy="true"
		aria-live="polite"
	>
		<p class="sr-only">正在查询候选人物与共演分析</p>

		<aside class="people-rail query-skeleton__people-rail" aria-hidden="true">
			<div class="person-picker query-skeleton__picker">
				<section class="selected-tray is-expanded query-skeleton__selected-tray">
					<div class="query-skeleton__selected-tray-header">
						<n-skeleton :animated="!reducedMotion" width="72px" height="16px" :sharp="false" />
						<n-skeleton :animated="!reducedMotion" width="92px" height="18px" :sharp="false" />
					</div>
					<ol class="selected-people-list query-skeleton__selected-people-list">
						<li v-for="profile in profiles" :key="profile" class="selected-person-row query-skeleton__selected-person-row">
							<span class="selected-person-row__ordinal"><n-skeleton :animated="!reducedMotion" width="12px" height="12px" :sharp="false" /></span>
							<strong class="selected-person-row__name"><n-skeleton :animated="!reducedMotion" :width="profile % 2 ? '74%' : '88%'" height="13px" :sharp="false" /></strong>
							<span class="selected-person-row__positions"><n-skeleton :animated="!reducedMotion" width="64px" height="28px" :sharp="false" /></span>
							<span class="selected-person-row__remove"><n-skeleton :animated="!reducedMotion" width="28px" height="28px" :sharp="false" /></span>
						</li>
					</ol>
				</section>

				<section class="candidate-browser">
					<div class="picker-section-heading query-skeleton__picker-heading">
						<n-skeleton :animated="!reducedMotion" width="64px" height="14px" :sharp="false" />
						<n-skeleton :animated="!reducedMotion" width="112px" height="12px" :sharp="false" />
					</div>

					<div class="candidate-position-browser query-skeleton__position-browser">
						<span class="query-skeleton__position-label"><n-skeleton :animated="!reducedMotion" width="56px" height="12px" :sharp="false" /></span>
						<n-skeleton :animated="!reducedMotion" width="100%" height="34px" :sharp="false" />
					</div>

					<div class="candidate-position-results query-skeleton__candidate-results">
					<div class="candidate-search query-skeleton__candidate-search">
						<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						<span class="query-skeleton__toolbar-order">
							<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						</span>
						</div>

						<div class="person-list person-list--candidate query-skeleton__candidate-list">
							<div v-for="candidate in candidates" :key="candidate" class="person-row person-row--candidate query-skeleton__candidate-card">
								<span class="candidate-row__portrait safe-image safe-image--person">
									<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
								</span>
								<span class="person-row__identity candidate-row__identity query-skeleton__candidate-identity">
									<n-skeleton :animated="!reducedMotion" :width="candidate % 3 === 0 ? '76%' : '58%'" height="14px" :sharp="false" />
									<n-skeleton :animated="!reducedMotion" width="48%" height="11px" :sharp="false" />
								</span>
							</div>
						</div>

						<footer><QueryPaginationSkeleton :show-summary="false" /></footer>
					</div>
				</section>
			</div>
		</aside>

		<section class="analysis-main" aria-hidden="true">
			<article class="analysis-dashboard analysis-dashboard--unified surface-panel query-skeleton__analysis">
				<section class="analysis-section relationship-hero selected-people-panel query-skeleton__hero">
					<ol class="selected-people-grid query-skeleton__profiles">
						<li v-for="profile in profiles" :key="profile">
							<article class="selected-person-card query-skeleton__profile">
								<span class="selected-person-card__media query-skeleton__analysis-media">
									<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
								</span>
								<div class="selected-person-card__body">
									<header class="selected-person-card__header">
										<span class="selected-person-card__ordinal"><n-skeleton :animated="!reducedMotion" width="18px" height="12px" :sharp="false" /></span>
										<span class="selected-person-card__signature-rule"></span>
										<div class="selected-person-card__signature">
											<n-skeleton :animated="!reducedMotion" :width="profile % 2 ? '62%' : '74%'" height="18px" :sharp="false" />
											<n-skeleton :animated="!reducedMotion" width="46%" height="12px" :sharp="false" />
										</div>
									</header>
									<dl class="selected-person-card__metrics metric-grid">
										<div v-for="metric in 2" :key="metric" class="metric-unit">
											<dd class="metric-unit__value"><n-skeleton :animated="!reducedMotion" width="42px" height="16px" :sharp="false" /></dd>
											<dt class="metric-unit__label"><n-skeleton :animated="!reducedMotion" width="54px" height="11px" :sharp="false" /></dt>
										</div>
									</dl>
								</div>
							</article>
						</li>
					</ol>
					<dl class="analysis-profile-summary shared-rating-summary shared-rating-summary--below metric-grid query-skeleton__summary-grid" data-metric-count="6">
						<div v-for="metric in summaryMetrics" :key="metric" class="metric-unit">
							<dd class="metric-unit__value"><n-skeleton :animated="!reducedMotion" width="48px" height="22px" :sharp="false" /></dd>
							<dt class="metric-unit__label"><n-skeleton :animated="!reducedMotion" width="62px" height="11px" :sharp="false" /></dt>
						</div>
					</dl>
				</section>

				<section class="analysis-section analysis-domain work-profile-domain query-skeleton__tag-section">
					<QueryTagSummarySkeleton />
				</section>

				<section class="analysis-section analysis-domain rating-domain query-skeleton__rating-domain">
					<div class="analysis-domain__block rating-distribution-panel">
						<div class="section-heading rating-distribution-panel__heading">
							<span class="query-skeleton__rating-title"><n-skeleton :animated="!reducedMotion" width="84px" height="20px" :sharp="false" /></span>
							<div class="rating-distribution-panel__controls">
								<n-skeleton :animated="!reducedMotion" width="143px" :height="compactViewport ? '28px' : '34px'" :sharp="false" />
								<n-skeleton :animated="!reducedMotion" width="171px" :height="compactViewport ? '28px' : '34px'" :sharp="false" />
							</div>
						</div>

						<div class="distribution-legend query-skeleton__distribution-legend">
							<span v-for="item in series" :key="item">
								<span class="query-skeleton__checkbox">
									<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
								</span>
								<n-skeleton
									:animated="!reducedMotion"
									:width="item === 0 ? '60px' : item === 1 ? '79px' : '81px'"
									height="12px"
									:sharp="false"
								/>
							</span>
						</div>

						<div class="data-scroll-x query-skeleton__score-table-scroll">
							<table class="matrix-table query-skeleton__score-table">
								<colgroup>
									<col class="query-skeleton__score-column">
									<col v-for="seriesIndex in series" :key="seriesIndex">
								</colgroup>
								<thead>
									<tr>
										<th><n-skeleton :animated="!reducedMotion" width="34px" height="12px" :sharp="false" /></th>
										<th v-for="seriesIndex in series" :key="seriesIndex">
											<span class="query-skeleton__score-table-heading">
												<n-skeleton :animated="!reducedMotion" width="14px" height="14px" :sharp="false" />
												<n-skeleton :animated="!reducedMotion" :width="seriesIndex === 0 ? '72px' : '58px'" height="12px" :sharp="false" />
											</span>
										</th>
									</tr>
								</thead>
								<tbody>
									<tr v-for="rowIndex in scoreRows" :key="rowIndex">
										<th><n-skeleton :animated="!reducedMotion" width="20px" height="14px" :sharp="false" /></th>
										<td v-for="seriesIndex in series" :key="seriesIndex">
											<span class="query-skeleton__score-table-cell">
												<n-skeleton
													:animated="!reducedMotion"
													:width="`${30 + ((rowIndex + seriesIndex) % 3) * 6}px`"
													height="14px"
													:sharp="false"
												/>
												<n-skeleton :animated="!reducedMotion" width="46px" height="10px" :sharp="false" />
											</span>
										</td>
									</tr>
								</tbody>
							</table>
						</div>
					</div>

					<div class="analysis-domain__block query-skeleton__matrix-block">
						<div class="section-heading section-heading--compact">
							<div><n-skeleton :animated="!reducedMotion" width="104px" height="17.5px" :sharp="false" /></div>
						</div>
						<div class="matrix-details matrix-details--direct">
							<div class="data-scroll-x">
								<table class="matrix-table query-skeleton__matrix">
									<thead>
										<tr><th v-for="cell in 4" :key="cell"><n-skeleton :animated="!reducedMotion" :width="cell === 1 ? '64px' : '72%'" height="13px" :sharp="false" /></th></tr>
									</thead>
									<tbody>
										<tr v-for="row in 3" :key="row">
											<th><n-skeleton :animated="!reducedMotion" width="72%" height="13px" :sharp="false" /></th>
							<td v-for="cell in 3" :key="cell">
								<span class="query-skeleton__matrix-cell">
									<n-skeleton :animated="!reducedMotion" width="42px" height="14px" :sharp="false" />
									<n-skeleton :animated="!reducedMotion" width="56px" height="10px" :sharp="false" />
								</span>
							</td>
										</tr>
									</tbody>
								</table>
							</div>
						</div>
					</div>
				</section>

				<section class="analysis-section analysis-domain preference-domain query-skeleton__preference-section">
					<div class="section-heading">
						<n-skeleton :animated="!reducedMotion" width="84px" height="20px" :sharp="false" />
					</div>
					<QueryPreferenceSkeleton variant="shared" />
				</section>

				<section class="analysis-section shared-works-section query-skeleton__works-section">
					<QueryWorkBrowserSkeleton variant="shared" />
				</section>
			</article>
		</section>
	</section>
</template>

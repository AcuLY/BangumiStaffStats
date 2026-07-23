<script setup lang="ts">
import { useMediaQuery } from '../composables/useMediaQuery'
import QueryPaginationSkeleton from './QueryPaginationSkeleton.vue'
import QueryPreferenceSkeleton from './QueryPreferenceSkeleton.vue'
import QueryTagSummarySkeleton from './QueryTagSummarySkeleton.vue'
import QueryWorkBrowserSkeleton from './QueryWorkBrowserSkeleton.vue'

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const isMobile = useMediaQuery('(width < 780px)')
const rows = Array.from({ length: 10 }, (_, index) => index)
const metrics = Array.from({ length: 4 }, (_, index) => index)
const profileMetrics = Array.from({ length: 8 }, (_, index) => index)
const distributionBars = [34, 48, 67, 82, 100, 76, 58, 42, 28, 18]
</script>

<template>
	<section
		id="mode-panel-ranking"
		class="ranking-workbench query-skeleton query-skeleton--ranking"
		role="tabpanel"
		aria-labelledby="mode-tab-ranking"
		aria-busy="true"
		aria-live="polite"
	>
		<p class="sr-only">正在查询人物排行与人物详情</p>

		<aside class="ranking-pane query-skeleton__ranking-pane" aria-hidden="true">
			<div class="ranking-controls">
				<div class="ranking-result-stats query-skeleton__ranking-stats">
					<div v-for="stat in 3" :key="stat" class="query-skeleton__statistic">
						<n-skeleton v-if="stat === 1" :animated="!reducedMotion" width="56px" height="17px" :sharp="false" />
						<span v-else class="query-skeleton__statistic-label-placeholder" />
						<n-skeleton :animated="!reducedMotion" :width="stat === 1 ? '92px' : stat === 2 ? '76px' : '68px'" height="24px" :sharp="false" />
					</div>
				</div>

				<div class="ranking-toolbar">
					<div class="work-list-toolbar query-skeleton__toolbar">
						<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						<span class="query-skeleton__toolbar-order">
							<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
						</span>
					</div>
				</div>
			</div>

			<div class="ranking-list-scroll">
				<div class="list-columns list-columns--ranking query-skeleton__list-columns">
					<n-skeleton :animated="!reducedMotion" width="12px" height="12px" :sharp="false" />
					<span />
					<span class="query-skeleton__person-column">
						<n-skeleton :animated="!reducedMotion" width="32px" height="12px" :sharp="false" />
					</span>
					<span class="list-columns__metrics">
						<n-skeleton v-for="metric in metrics" :key="metric" :animated="!reducedMotion" width="28px" height="12px" :sharp="false" />
					</span>
				</div>

				<div class="person-list person-list--ranking query-skeleton__ranking-list">
					<div v-for="row in rows" :key="row" class="person-row person-row--ranking query-skeleton__ranking-row">
						<span class="person-row__rank"><n-skeleton :animated="!reducedMotion" width="18px" height="14px" :sharp="false" /></span>
						<span class="person-row__avatar safe-image safe-image--person query-skeleton__avatar">
							<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
						</span>
						<span class="person-row__identity query-skeleton__identity">
							<n-skeleton :animated="!reducedMotion" :width="row % 3 === 0 ? '72%' : '58%'" height="14px" :sharp="false" />
							<n-skeleton :animated="!reducedMotion" :width="row % 2 === 0 ? '50%' : '64%'" height="11px" :sharp="false" />
						</span>
						<span class="person-row__metrics">
							<span v-for="metric in metrics" :key="metric" class="person-row__metric">
								<n-skeleton :animated="!reducedMotion" width="32px" :height="isMobile ? '14.4px' : '16.8px'" :sharp="false" />
							</span>
						</span>
					</div>
				</div>
			</div>

			<footer><QueryPaginationSkeleton /></footer>
		</aside>

		<section class="ranking-detail surface-panel query-skeleton__inspector" aria-hidden="true">
			<article class="person-inspector">
				<header class="person-profile">
					<div class="person-profile__intro">
						<div class="person-profile__portrait safe-image safe-image--person query-skeleton__portrait">
							<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
						</div>
						<div class="person-profile__content query-skeleton__profile-copy">
							<div class="person-profile__name-row">
								<n-skeleton :animated="!reducedMotion" width="72%" height="22px" :sharp="false" />
							</div>
							<span class="person-profile__career"><n-skeleton :animated="!reducedMotion" width="100%" height="12px" :sharp="false" /></span>
							<span class="person-profile__secondary"><n-skeleton :animated="!reducedMotion" width="58%" height="12px" :sharp="false" /></span>
						</div>
						<section class="person-profile__bio query-skeleton__bio">
							<p class="query-skeleton__bio-lines">
								<n-skeleton :animated="!reducedMotion" width="100%" height="13px" :sharp="false" />
								<n-skeleton :animated="!reducedMotion" width="82%" height="13px" :sharp="false" />
							</p>
							<span class="person-profile__bio-toggle"><n-skeleton :animated="!reducedMotion" width="44px" height="16px" :sharp="false" /></span>
						</section>
					</div>
					<div class="profile-metrics profile-metrics--extended metric-grid query-skeleton__profile-metrics">
						<span v-for="metric in profileMetrics" :key="metric" class="metric-unit">
							<small class="metric-unit__label"><n-skeleton :animated="!reducedMotion" width="68%" height="11px" :sharp="false" /></small>
							<b class="metric-unit__value"><n-skeleton :animated="!reducedMotion" width="44%" height="18px" :sharp="false" /></b>
						</span>
					</div>
				</header>

				<section class="inspector-section analysis-domain query-skeleton__tag-section">
					<QueryTagSummarySkeleton />
				</section>

				<section class="inspector-section query-skeleton__rating-section">
					<div class="rating-distribution-panel">
						<div class="section-heading rating-distribution-panel__heading">
							<span class="query-skeleton__rating-title"><n-skeleton :animated="!reducedMotion" width="84px" height="20px" :sharp="false" /></span>
							<div class="rating-distribution-panel__controls">
								<n-skeleton :animated="!reducedMotion" width="143px" :height="isMobile ? '28px' : '34px'" :sharp="false" />
								<n-skeleton :animated="!reducedMotion" width="171px" :height="isMobile ? '28px' : '34px'" :sharp="false" />
							</div>
						</div>
						<div class="score-distribution query-skeleton__score-distribution" style="--distribution-steps: 4">
							<div class="score-distribution__axis" />
							<div v-for="(height, index) in distributionBars" :key="index" class="score-bar">
								<span class="score-bar__track">
								<i class="query-skeleton__score-fill" :style="{ height: `${height}%` }">
									<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
									</i>
								</span>
								<small><n-skeleton :animated="!reducedMotion" width="16px" height="10px" :sharp="false" /></small>
							</div>
						</div>
					</div>
				</section>

				<section class="inspector-section analysis-domain preference-domain query-skeleton__preference-section">
					<div class="section-heading">
						<n-skeleton :animated="!reducedMotion" width="84px" height="20px" :sharp="false" />
					</div>
					<QueryPreferenceSkeleton variant="ranking" />
				</section>

				<section class="inspector-section query-skeleton__works-section">
					<QueryWorkBrowserSkeleton variant="ranking" />
				</section>
			</article>
		</section>
	</section>
</template>

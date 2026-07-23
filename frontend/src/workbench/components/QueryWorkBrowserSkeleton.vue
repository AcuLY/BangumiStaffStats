<script setup lang="ts">
import { computed } from 'vue'
import { useMediaQuery } from '../composables/useMediaQuery'
import QueryPaginationSkeleton from './QueryPaginationSkeleton.vue'

const props = defineProps<{
	variant: 'ranking' | 'shared'
}>()

const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const workRows = computed(() => Array.from({ length: props.variant === 'ranking' ? 4 : 3 }, (_, index) => index))
const factColumns = computed(() => props.variant === 'ranking' ? 3 : 2)
const participantRows = [[0, 1], [2]]
</script>

<template>
	<div class="subject-work-browser query-skeleton__work-browser" :class="`query-skeleton__work-browser--${variant}`">
		<div class="section-heading subject-work-browser__heading">
			<div class="subject-work-browser__heading-copy">
				<n-skeleton :animated="!reducedMotion" width="88px" height="20px" :sharp="false" />
				<n-skeleton :animated="!reducedMotion" width="54px" height="12px" :sharp="false" />
			</div>
			<div class="subject-work-browser__density-toggle">
				<span class="query-skeleton__density-control"><n-skeleton :animated="!reducedMotion" width="104px" height="100%" :sharp="false" /></span>
			</div>
		</div>

		<div class="work-list-toolbar query-skeleton__work-toolbar">
			<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
			<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
			<span class="query-skeleton__toolbar-order">
				<n-skeleton :animated="!reducedMotion" width="100%" height="100%" :sharp="false" />
			</span>
		</div>

		<ul class="subject-work-list person-work-list query-skeleton__subject-work-list" :class="`query-skeleton__subject-work-list--${variant}`">
			<li
				v-for="row in workRows"
				:key="row"
				class="subject-work-row person-work-row query-skeleton__subject-work-row"
				:class="variant === 'ranking' ? 'subject-work-row--with-role' : 'subject-work-row--with-participants'"
			>
				<div class="subject-work-row__work person-work-row__work work-cell">
					<span class="subject-work-row__cover-media">
						<span class="subject-work-row__cover safe-image safe-image--subject query-skeleton__subject-cover">
							<n-skeleton :animated="!reducedMotion" width="100%" height="100%" sharp />
						</span>
					</span>
					<div class="subject-work-row__copy work-cell__copy query-skeleton__subject-work-copy">
						<span class="query-skeleton__subject-work-title"><n-skeleton :animated="!reducedMotion" :width="row % 2 ? '68%' : '82%'" height="14px" :sharp="false" /></span>
						<span class="query-skeleton__subject-work-secondary"><n-skeleton :animated="!reducedMotion" width="54%" height="10px" :sharp="false" /></span>
						<div class="subject-work-row__meta query-skeleton__subject-work-tags">
							<n-skeleton
								v-for="tag in 3"
								:key="tag"
								class="query-skeleton__meta-tag"
								:animated="!reducedMotion"
								:width="tag === 2 ? '52px' : '44px'"
								height="var(--query-skeleton-meta-tag-height)"
								round
							/>
						</div>
					</div>
				</div>

				<dl
					class="subject-work-row__facts person-work-row__facts"
					:class="{ 'subject-work-row__facts--with-role': variant === 'ranking' }"
				>
					<div v-for="fact in factColumns" :key="fact" :class="{ 'subject-work-row__role-fact': variant === 'ranking' && fact === 3 }">
						<dt><n-skeleton :animated="!reducedMotion" width="46px" height="10px" :sharp="false" /></dt>
						<dd>
							<n-skeleton
								:class="{ 'query-skeleton__role-tag': fact === 3 }"
								:animated="!reducedMotion"
								:width="fact === 3 ? '72%' : '54px'"
								:height="fact === 3 ? '18px' : '15px'"
								:round="fact === 3"
								:sharp="false"
							/>
						</dd>
					</div>
				</dl>

				<div v-if="variant === 'shared'" class="subject-work-row__participants">
					<div class="shared-work-participants query-skeleton__participants">
						<div v-for="(participants, rowIndex) in participantRows" :key="rowIndex" class="shared-work-participant-row">
							<div v-for="participant in participants" :key="participant" class="shared-work-participant">
								<n-skeleton :animated="!reducedMotion" width="20px" height="20px" round />
								<span class="shared-work-participant__body query-skeleton__participant-body">
									<n-skeleton :animated="!reducedMotion" :width="participant === 2 ? '56%' : '72%'" height="12px" :sharp="false" />
									<n-skeleton class="query-skeleton__role-tag" :animated="!reducedMotion" width="44%" height="18px" round />
								</span>
							</div>
						</div>
					</div>
				</div>
			</li>
		</ul>

		<QueryPaginationSkeleton v-if="variant === 'ranking'" />
	</div>
</template>

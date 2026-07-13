<script setup lang="ts">
import { computed, ref } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const showAllSharedWorks = ref(false)

const ratedShared = computed(() => workbench.sharedSubjects.value.filter((subject) => Number(subject.collection?.rate || 0) > 0))
const personalAverage = computed(() => ratedShared.value.length
	? ratedShared.value.reduce((sum, subject) => sum + Number(subject.collection?.rate || 0), 0) / ratedShared.value.length
	: 0)
const globallyRatedShared = computed(() => workbench.sharedSubjects.value.filter((subject) => Number(subject.score || 0) > 0))
const globalAverage = computed(() => globallyRatedShared.value.length
	? globallyRatedShared.value.reduce((sum, subject) => sum + Number(subject.score || 0), 0) / globallyRatedShared.value.length
	: 0)
const visibleSharedWorks = computed(() => showAllSharedWorks.value
	? workbench.sharedSubjects.value
	: workbench.sharedSubjects.value.slice(0, 16))
const maxDistribution = computed(() => Math.max(1, ...workbench.ratingDistribution.value.map((item) => item.value)))
const distributionLabel = computed(() => `共同作品评分分布：${workbench.ratingDistribution.value
	.map((item) => `${item.label} ${item.value} 部`)
	.join('，')}`)

const profileAverage = (ids: number[]) => {
	const rates = ids
		.map((id) => Number(workbench.subjectsById.value.get(id)?.collection?.rate || 0))
		.filter((value) => value > 0)
	return rates.length ? rates.reduce((sum, value) => sum + value, 0) / rates.length : 0
}

const timeline = computed(() => {
	const years = new Map<string, number>()
	for (const subject of workbench.sharedSubjects.value) {
		const year = subject.date?.slice(0, 4) || '未知'
		years.set(year, (years.get(year) ?? 0) + 1)
	}
	return [...years.entries()]
		.sort(([a], [b]) => b.localeCompare(a))
		.slice(0, 8)
		.map(([year, count]) => ({ year, count }))
})
const maxTimeline = computed(() => Math.max(1, ...timeline.value.map((item) => item.count)))

const commonTags = computed(() => {
	const counts = new Map<string, number>()
	for (const subject of workbench.sharedSubjects.value) {
		for (const rawTag of [...(subject.metaTags ?? []), ...(subject.tags ?? [])].slice(0, 8)) {
			const tag = typeof rawTag === 'string' ? rawTag : rawTag?.name
			if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1)
		}
	}
	return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
})
</script>

<template>
	<div v-if="workbench.selectedPeople.value.length < 2" class="analysis-empty surface-panel">
		<span class="analysis-empty__icon"><AppIcon name="people" :size="30" /></span>
		<h1>再选择一位共同参与者</h1>
		<p>至少需要两个人物，才能计算共同作品、评分分布和关系矩阵。</p>
		<n-button type="primary" @click="workbench.peopleDrawerOpen.value = true">打开人物选择</n-button>
	</div>

	<div v-else class="analysis-dashboard">
		<section class="relationship-hero surface-panel" aria-labelledby="analysis-title">
			<div class="analysis-title-row">
				<div>
					<span class="section-context">当前选择 · {{ workbench.selectedPeople.value.length }} 人</span>
					<h1 id="analysis-title">共同参与画像</h1>
					<p>从 {{ workbench.selectedUnionCount.value }} 部关联作品中找到 {{ workbench.sharedSubjects.value.length }} 部共同作品。</p>
				</div>
				<span class="analysis-status"><span aria-hidden="true" />{{ workbench.analysisStatus.value }}</span>
			</div>

			<div class="profile-stage">
				<article v-for="(item, index) in workbench.selectedPeople.value" :key="item.person.id" class="analysis-profile">
					<SafeImage
						class="analysis-profile__media"
						:sources="workbench.personImageSources(item.person, 'medium')"
						:alt="workbench.personName(item.person)"
						kind="person"
						decorative
						:loading="index < 2 ? 'eager' : 'lazy'"
						:width="132"
						:height="180"
					/>
					<div class="analysis-profile__content">
						<span class="identity-marker">{{ String.fromCharCode(65 + index) }}</span>
						<h2>{{ workbench.personName(item.person) }}</h2>
						<p>{{ item.positionIds.map(workbench.positionLabel).join(' · ') }}</p>
						<div><b>{{ item.subjectIds.length }}</b><small>关联作品</small><b>{{ profileAverage(item.subjectIds).toFixed(2) }}</b><small>我的均分</small></div>
					</div>
				</article>
			</div>
		</section>

		<section class="metric-ledger surface-panel" aria-label="共同参与关键统计">
			<div><small>共同作品</small><strong>{{ workbench.sharedSubjects.value.length }}</strong><span>部</span></div>
			<div><small>合作默契</small><strong>{{ workbench.cooperationIndex.value }}</strong><span>% · 本站计算</span></div>
			<div><small>我的均分</small><strong>{{ personalAverage ? personalAverage.toFixed(2) : '—' }}</strong><span>{{ ratedShared.length }} 部已评</span></div>
			<div><small>全站均分</small><strong>{{ globalAverage ? globalAverage.toFixed(2) : '—' }}</strong><span>Bangumi 口径</span></div>
		</section>

		<div class="analysis-grid">
			<section class="analysis-section surface-panel" aria-labelledby="shared-rating-title">
				<div class="section-heading">
					<div><h2 id="shared-rating-title">共同作品评分分布</h2><p>1–10 分与未评分作品，数值均保留。</p></div>
				</div>
					<div class="score-distribution score-distribution--large" role="img" :aria-label="distributionLabel">
					<div v-for="item in workbench.ratingDistribution.value" :key="item.label" class="score-bar">
						<span class="score-bar__value">{{ item.value }}</span>
						<span class="score-bar__track"><i :style="{ height: `${Math.max(4, item.value / maxDistribution * 100)}%` }" /></span>
						<small>{{ item.label }}</small>
					</div>
				</div>
			</section>

			<section class="analysis-section surface-panel" aria-labelledby="timeline-title">
				<div class="section-heading">
					<div><h2 id="timeline-title">合作时间线</h2><p>按共同作品首播年份汇总。</p></div>
				</div>
				<div class="timeline-list">
					<div v-for="item in timeline" :key="item.year">
						<small>{{ item.year }}</small><span><i :style="{ width: `${item.count / maxTimeline * 100}%` }" /></span><b>{{ item.count }}</b>
					</div>
					<p v-if="!timeline.length">当前选择没有共同作品。</p>
				</div>
				<div class="tag-summary" aria-label="共同作品标签">
					<span v-for="([tag, count]) in commonTags" :key="tag"><b>{{ tag }}</b><small>{{ count }}</small></span>
				</div>
			</section>
		</div>

		<section class="analysis-section surface-panel" aria-labelledby="matrix-title">
			<div class="section-heading">
				<div><h2 id="matrix-title">人物关系矩阵</h2><p>对角线是该人物关联作品数，其他单元格是两人的交集。</p></div>
			</div>
			<div class="data-scroll-x">
				<table class="matrix-table">
					<thead><tr><th scope="col">人物</th><th v-for="item in workbench.selectedPeople.value" :key="item.person.id" scope="col">{{ workbench.personName(item.person) }}</th></tr></thead>
					<tbody>
						<tr v-for="row in workbench.relationshipMatrix.value" :key="row.person.id">
							<th scope="row">{{ workbench.personName(row.person) }}</th>
							<td v-for="(value, index) in row.values" :key="index" :class="{ 'is-diagonal': row.person.id === workbench.selectedPeople.value[index]?.person.id }">{{ value }}</td>
						</tr>
					</tbody>
				</table>
			</div>
		</section>

		<section class="analysis-section surface-panel" aria-labelledby="common-works-title">
			<div class="section-heading">
				<div><h2 id="common-works-title">共同作品</h2><p>{{ workbench.sharedSubjects.value.length }} 部 · 按个人评分与站评分排序</p></div>
			</div>
			<div class="data-scroll-x">
				<table class="works-table works-table--common">
					<thead><tr><th>作品</th><th>日期</th><th>Bangumi Rank</th><th>全站评分</th><th>我的评分</th></tr></thead>
					<tbody>
						<tr v-for="subject in visibleSharedWorks" :key="subject.id">
							<td><span class="work-cell"><SafeImage :sources="workbench.subjectImageSources(subject)" :alt="`${workbench.subjectName(subject)}封面`" kind="subject" :width="38" :height="52" decorative /><strong>{{ workbench.subjectName(subject) }}</strong></span></td>
							<td>{{ subject.date || '—' }}</td>
							<td>{{ subject.rank ? `#${subject.rank}` : '—' }}</td>
							<td>{{ subject.score?.toFixed(1) ?? '—' }}</td>
							<td><b>{{ subject.collection?.rate || '—' }}</b></td>
						</tr>
						<tr v-if="!workbench.sharedSubjects.value.length"><td colspan="5" class="table-empty">当前选择没有共同作品。</td></tr>
					</tbody>
					</table>
				</div>
				<div v-if="workbench.sharedSubjects.value.length > 16" class="table-disclosure">
					<span>已展示 {{ visibleSharedWorks.length }} / {{ workbench.sharedSubjects.value.length }} 部</span>
					<n-button text type="primary" @click="showAllSharedWorks = !showAllSharedWorks">{{ showAllSharedWorks ? '收起列表' : '展示全部' }}</n-button>
				</div>
			</section>
	</div>
</template>

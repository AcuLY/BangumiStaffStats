<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import AppIcon from './AppIcon.vue'

const workbench = useWorkbench()
const showAllWorks = ref(false)

const person = computed(() => workbench.focusedPerson.value)
const maxDistribution = computed(() => Math.max(1, ...workbench.focusedDistribution.value.map((item) => item.value)))
const distributionLabel = computed(() => `${workbench.personName(person.value)}的评分分布：${workbench.focusedDistribution.value
	.map((item) => `${item.label} ${item.value} 部`)
	.join('，')}`)
const visibleWorks = computed(() => showAllWorks.value
	? workbench.focusedSubjects.value
	: workbench.focusedSubjects.value.slice(0, 10))

const preference = computed(() => workbench.focusedAllSubjects.value
	.map((subject) => ({
		subject,
		delta: Number(subject.collection?.rate || 0) - Number(subject.score || 0),
	}))
	.filter((item) => Number(item.subject.collection?.rate || 0) > 0 && Number(item.subject.score || 0) > 0)
	.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)))

const morePreferred = computed(() => preference.value.filter((item) => item.delta > 0).slice(0, 3))
const moreConservative = computed(() => preference.value.filter((item) => item.delta < 0).slice(0, 3))

watch([workbench.focusedPersonId, workbench.focusedWorkSearch], () => { showAllWorks.value = false })
</script>

<template>
	<article v-if="person" class="person-inspector" aria-labelledby="inspector-person-name">
		<header class="person-profile">
				<SafeImage
					class="person-profile__portrait"
					:sources="workbench.personImageSources(person)"
					:alt="workbench.personName(person)"
					kind="person"
					loading="eager"
					priority
				:width="160"
				:height="196"
			/>
			<div class="person-profile__content">
				<span class="section-context">{{ workbench.positionLabel(workbench.query.positionId) }} · 当前焦点</span>
				<h1 id="inspector-person-name">{{ workbench.personName(person) }}</h1>
				<p v-if="workbench.personSecondaryName(person)">{{ workbench.personSecondaryName(person) }}</p>
				<div class="profile-metrics" aria-label="人物统计">
					<span><b>{{ person.subjectCount ?? person.subjectIds?.length ?? 0 }}</b><small>参与作品</small></span>
					<span><b>{{ person.ratedSubjectCount ?? '—' }}</b><small>已评分</small></span>
					<span><b>{{ person.userAverage?.toFixed(2) ?? '—' }}</b><small>我的均分</small></span>
					<span><b>{{ person.globalAverage?.toFixed(2) ?? '—' }}</b><small>全站均分</small></span>
				</div>
			</div>
		</header>

		<section class="inspector-section" aria-labelledby="rating-distribution-title">
			<div class="section-heading">
				<div>
					<h2 id="rating-distribution-title">个人评分分布</h2>
					<p>未评分作品计入作品数，但不计入均分。</p>
				</div>
				<span class="derived-label"><AppIcon name="info" :size="14" />本地快照</span>
			</div>
				<div class="score-distribution" role="img" :aria-label="distributionLabel">
				<div v-for="item in workbench.focusedDistribution.value" :key="item.label" class="score-bar">
					<span class="score-bar__value">{{ item.value }}</span>
					<span class="score-bar__track"><i :style="{ height: `${Math.max(4, item.value / maxDistribution * 100)}%` }" /></span>
					<small>{{ item.label }}</small>
				</div>
			</div>
		</section>

		<section class="inspector-section" aria-labelledby="preference-title">
			<div class="section-heading">
				<div>
					<h2 id="preference-title">评分偏好</h2>
					<p>比较我的评分与 Bangumi 全站评分。</p>
				</div>
			</div>
			<div class="preference-columns">
				<div>
					<h3>我更喜欢</h3>
					<ul>
						<li v-for="item in morePreferred" :key="item.subject.id">
							<span>{{ workbench.subjectName(item.subject) }}</span><b>+{{ item.delta.toFixed(1) }}</b>
						</li>
						<li v-if="!morePreferred.length" class="muted-row">没有明显高于站评的作品</li>
					</ul>
				</div>
				<div>
					<h3>我更保守</h3>
					<ul>
						<li v-for="item in moreConservative" :key="item.subject.id">
							<span>{{ workbench.subjectName(item.subject) }}</span><b>{{ item.delta.toFixed(1) }}</b>
						</li>
						<li v-if="!moreConservative.length" class="muted-row">没有明显低于站评的作品</li>
					</ul>
				</div>
			</div>
		</section>

			<section class="inspector-section" aria-labelledby="person-works-title">
			<div class="section-heading section-heading--tools">
				<div>
					<h2 id="person-works-title">参与作品</h2>
					<p>{{ workbench.focusedSubjects.value.length }} 部匹配当前列表</p>
				</div>
				<n-input v-model:value="workbench.focusedWorkSearch.value" clearable placeholder="搜索作品…" aria-label="搜索参与作品">
					<template #prefix><AppIcon name="search" :size="16" /></template>
				</n-input>
			</div>
				<div class="data-scroll-x">
				<table class="works-table">
					<thead><tr><th>作品</th><th>日期</th><th>Bangumi</th><th>我的评分</th></tr></thead>
					<tbody>
						<tr v-for="subject in visibleWorks" :key="subject.id">
							<td>
								<span class="work-cell">
									<SafeImage :sources="workbench.subjectImageSources(subject)" :alt="`${workbench.subjectName(subject)}封面`" kind="subject" :width="36" :height="48" decorative />
									<strong>{{ workbench.subjectName(subject) }}</strong>
								</span>
							</td>
							<td>{{ subject.date || '—' }}</td>
							<td>{{ subject.score?.toFixed(1) ?? '—' }}</td>
							<td><b>{{ subject.collection?.rate || '—' }}</b></td>
						</tr>
						<tr v-if="!visibleWorks.length"><td colspan="4" class="table-empty">没有匹配的作品。</td></tr>
					</tbody>
					</table>
				</div>
				<div v-if="workbench.focusedSubjects.value.length > 10" class="table-disclosure">
					<span>已展示 {{ visibleWorks.length }} / {{ workbench.focusedSubjects.value.length }} 部</span>
					<n-button text type="primary" @click="showAllWorks = !showAllWorks">{{ showAllWorks ? '收起列表' : '展示全部' }}</n-button>
				</div>
			</section>
		</article>
		<div v-else class="analysis-empty person-inspector-empty">
			<span class="analysis-empty__icon"><AppIcon name="search" :size="28" /></span>
			<h1>当前查询没有匹配人物</h1>
			<p>请调整 UID、条目类型、职位或收藏范围。</p>
		</div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Subject } from '../types'

const props = withDefaults(defineProps<{
	subjects: Subject[]
	title: string
	headingId: string
	emptyText?: string
}>(), {
	emptyText: '这些作品暂无可用标签。',
})

const tagGroups = computed(() => {
	const meta = new Map<string, number>()
	const community = new Map<string, number>()
	const personal = new Map<string, number>()
	for (const subject of props.subjects) {
		for (const rawTag of subject.metaTags ?? []) {
			const tag = typeof rawTag === 'string' ? rawTag : rawTag?.name
			if (tag) meta.set(tag, (meta.get(tag) ?? 0) + 1)
		}
		for (const rawTag of subject.tags ?? []) {
			const tag = typeof rawTag === 'string' ? rawTag : rawTag?.name
			if (tag) community.set(tag, (community.get(tag) ?? 0) + 1)
		}
		for (const tag of subject.collection?.tags ?? []) {
			if (tag) personal.set(tag, (personal.get(tag) ?? 0) + 1)
		}
	}
	const top = (source: Map<string, number>, limit: number) => [...source.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
		.slice(0, limit)
	return { meta: top(meta, 6), community: top(community, 8), personal: top(personal, 6) }
})
const tagCount = computed(() => tagGroups.value.meta.length
	+ tagGroups.value.community.length
	+ tagGroups.value.personal.length)
</script>

<template>
	<div class="section-heading">
		<div><h2 :id="headingId">{{ title }}</h2></div>
		<strong v-if="tagCount" class="section-heading__meta">{{ tagCount }} 个高频标签</strong>
	</div>
	<div v-if="tagCount" class="tag-groups">
		<div class="tag-row"><strong>条目属性</strong><div><span v-for="([tag, count]) in tagGroups.meta" :key="`meta-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!tagGroups.meta.length">无</span></div></div>
		<div class="tag-row"><strong>社区标签</strong><div><span v-for="([tag, count]) in tagGroups.community" :key="`community-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!tagGroups.community.length">无</span></div></div>
		<div class="tag-row"><strong>我的收藏标签</strong><div><span v-for="([tag, count]) in tagGroups.personal" :key="`personal-${tag}`">{{ tag }} · {{ count }}</span><span v-if="!tagGroups.personal.length">未设置</span></div></div>
	</div>
	<p v-else class="analysis-domain__empty">{{ emptyText }}</p>
</template>

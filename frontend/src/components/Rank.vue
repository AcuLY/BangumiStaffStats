<script setup lang="ts"></script>

<template>
	<DisplaySettings />
	<ResponseStats />
	<Pagination />
	<DataTable />
	<Pagination bottom />
	<p class="note">
		注：<br />
        ① “作品均分” 为用户评分的平均分 <br />
		② 如果条目数量过多（几千个）开启显示图片时请勿设置过大的分页值，可能会崩溃 <br />
		③ 加权综合分的公式：作品数/(作品数+5)*均分+25/(作品数+5)<br />
		④
		合并续作后作品的分数是该人物参与制作的该系列作品的均分，现在对续作的判断方式可能会不准确<br />
		⑤ 目前对全站查询的优化较差，如果查询太慢请设置较高的最低收藏人数
	</p>
</template>

<style scoped>
.note {
    width: 90vw;
    color: gray;
}
</style>

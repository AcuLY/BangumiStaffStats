<script setup lang="ts">

</script>

<template>
	<n-flex class="content-wrapper" vertical align="center">
		<Input />
		<MoreOptions />
		<n-divider class="divider"/>
		<Rank />
	</n-flex>
</template>

<style scoped>
.content-wrapper {
	padding: 20px;
}

.divider {
	width: 100vw;
	margin: 10px 0 10px 0;
}
</style>

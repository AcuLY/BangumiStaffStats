<script setup lang="ts">
import { useGlobalStore } from '@/stores/global';

const globalStore = useGlobalStore()
</script>

<template>
	<n-flex justify="center" class="footer-wrapper" :class="globalStore.darkMode && 'dark-mode'">
		<a href="https://beian.miit.gov.cn/" target="_blank" class="link">
			粤ICP备2024321317号
		</a>
	</n-flex>
</template>

<style scoped>
.footer-wrapper {
	padding: 10px;
	width: 100vw;
	background-color: #f8f8f8;
}

.dark-mode {
    background-color: #0f0f0f;
}

.link {
	color: grey;
	text-decoration: none;
}

@media (max-width: 768px) {
    .footer-wrapper {
        padding: 8px;
        font-size: 12px;
    }
}
</style>

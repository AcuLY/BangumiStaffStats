<script setup lang="ts">
import { useGlobalStore } from '@/stores/global'
import Dark from '@/assets/svgs/dark.svg'
import Light from '@/assets/svgs/light.svg'
import Github from '@/assets/svgs/github.svg'

const globalStore = useGlobalStore()
const { switchMode } = globalStore

const controlSize = computed(() => (globalStore.isMobile ? 'medium' : 'large'))
const iconSize = computed(() => (globalStore.isMobile ? 24 : 40))
</script>

<template>
	<header class="header-wrapper">
		<n-flex justify="space-between" align="center">
			<n-flex align="center">
				<img src="/bgmss.png" class="bgmss-icon" />
				<div>Bangumi Staff Statistics</div>
			</n-flex>

			<n-flex justify="end" align="center">
				<a href="https://github.com/AcuLY/BangumiStaffStats" target="_blank" class="github-icon">
					<Github />
				</a>

				<n-button
					text
					:size="controlSize"
					@click="switchMode"
					color="white"
					aria-label="切换明暗主题"
				>
					<transition name="fade" mode="out-in">
						<n-icon v-if="globalStore.darkMode" :size="iconSize">
							<Light />
						</n-icon>
						<n-icon v-else :size="iconSize">
							<Dark />
						</n-icon>
					</transition>
				</n-button>
			</n-flex>
		</n-flex>
	</header>
</template>

<style scoped>
.header-wrapper {
	padding: 15px 20px 15px 20px;
	border-style: solid none none none;
	border-color: var(--color-primary);
	border-width: 5px;
	font-size: 24px;
	font-weight: bold;
	color: white;
	background-color: #242424;
	user-select: none;
}

.bgmss-icon {
	width: 40px;
	height: 40px;
	transform: translateY(-5px);
}

.github-icon {
	width: 40px;
	height: 40px;
	color: white;
	transition: color 0.2s ease;
}

.github-icon:hover {
	color: var(--color-primary);
}

@media (max-width: 768px) {
	.header-wrapper {
		padding: 10px;
		font-size: 16px;
	}

	.bgmss-icon {
		width: 24px;
		height: 24px;
		transform: translateY(-2px);
	}

	.github-icon {
		width: 24px;
		height: 24px;
	}
}
</style>

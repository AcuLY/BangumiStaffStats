<script setup lang="ts">
import { useGlobalStore } from '@/stores/global'
import Dark from '@/assets/svgs/dark.svg'
import Light from '@/assets/svgs/light.svg'
import Github from '@/assets/svgs/github.svg'

const globalStore = useGlobalStore()
const { switchMode } = globalStore
</script>

<template>
	<n-flex class="header-wrapper" justify="space-between">
		<n-flex>
			<img src="/bgmss.png" class="bgmss-icon" />
			<div>Bangumi Staff Statistics</div>
		</n-flex>

		<n-flex justify="end">
			<a href="https://github.com/AcuLY/BangumiStaffStats" target="_blank" class="github-icon">
				<Github />
			</a>

			<n-button text class="dark-mode-icon" @click="switchMode" color="white">
				<transition name="fade" mode="out-in">
					<n-icon v-if="globalStore.darkMode">
						<Light />
					</n-icon>
					<n-icon v-else>
						<Dark />
					</n-icon>
				</transition>
			</n-button>
		</n-flex>
	</n-flex>
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

.dark-mode-icon {
	color: white;
	font-size: 40px;
	transition: color 0.2s ease;
}

.dark-mode-icon:hover {
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

	.dark-mode-icon {
		font-size: 24px;
	}

	.github-icon {
		width: 24px;
		height: 24px;
	}
}
</style>

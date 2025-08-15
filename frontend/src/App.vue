<script setup lang="ts">
import { darkTheme, zhCN, type GlobalTheme } from 'naive-ui'
import { ThemeOverrides } from '@/constants/themes'
import { useGlobalStore } from '@/stores/global'

const globalStore = useGlobalStore()
const { init } = globalStore
onMounted(() => {
    init()
})

const currentTheme = computed<GlobalTheme | null>(() =>
	globalStore.darkMode ? darkTheme : null
)
</script>

<template>
	<n-config-provider
		:theme="currentTheme"
		:theme-overrides="ThemeOverrides"
		:locale="zhCN"
	>
		<n-notification-provider>
			<n-layout>
				<n-layout-header>
					<Header />
				</n-layout-header>

				<n-layout-content>
					<Main />
				</n-layout-content>

				<n-layout-footer class="footer-wrapper">
					<Footer />
				</n-layout-footer>
			</n-layout>
		</n-notification-provider>
	</n-config-provider>
</template>

<style scoped>
.content-wrapper {
	min-height: calc(100vh - 75px - 43px);
}

.footer-wrapper {
	position: relative;
	bottom: 0;
}

@media (max-width: 768px) {
	.content-wrapper {
		min-height: calc(100vh - 55px - 42.39px);
	}
}
</style>

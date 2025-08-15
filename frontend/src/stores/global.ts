import { MAX_MOBILE_WINDOW_WIDTH } from '@/constants/themes'
import { defineStore } from 'pinia'

export const useGlobalStore = defineStore('global', () => {
	const isMobile = ref<boolean>(window.innerWidth < MAX_MOBILE_WINDOW_WIDTH)
	const updateIsMobile = (): void => {
		isMobile.value = window.innerWidth < MAX_MOBILE_WINDOW_WIDTH
	}

	const matchMedia = window.matchMedia('(prefers-color-scheme: dark)')
	const darkMode = ref<boolean>(
		matchMedia.matches
	)
	const switchMode = (): void => {
		darkMode.value = !darkMode.value
	}
	const updateDarkMode = (): void => {
		darkMode.value = matchMedia.matches
	}

	const isLoading = ref<boolean>(false)
	const startLoading = (): void => {
		isLoading.value = true
	}
	const stopLoading = (): void => {
		isLoading.value = false
	}

	const init = (): void => {
		updateIsMobile()
		updateDarkMode()
		window.addEventListener('resize', updateIsMobile)
		matchMedia.addEventListener('change', updateDarkMode)
	}

	return {
		isMobile,
		darkMode,
		switchMode,
		isLoading,
		startLoading,
		stopLoading,
		init,
	}
})

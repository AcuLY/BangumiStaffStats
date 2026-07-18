import { computed } from 'vue'
import { useMediaQuery } from './useMediaQuery'

export type WorkbenchControlSize = 'small' | 'medium'

export function useWorkbenchControlSize() {
	const isMobile = useMediaQuery('(max-width: 780px)')
	const controlSize = computed<WorkbenchControlSize>(() => isMobile.value ? 'small' : 'medium')

	return { controlSize, isMobile }
}

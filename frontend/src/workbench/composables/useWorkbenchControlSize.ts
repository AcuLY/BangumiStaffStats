import { computed } from 'vue'
import { useMediaQuery } from './useMediaQuery'

export type WorkbenchControlSize = 'small' | 'medium'

export const WORKBENCH_COMPACT_CONTROL_MEDIA_QUERY = '(width < 780px)'

export function useWorkbenchControlSize() {
	const isMobile = useMediaQuery(WORKBENCH_COMPACT_CONTROL_MEDIA_QUERY)
	const controlSize = computed<WorkbenchControlSize>(() => isMobile.value ? 'small' : 'medium')

	return { controlSize, isMobile }
}

import { onBeforeUnmount, onMounted, ref } from 'vue'

export function useMediaQuery(query: string) {
	const matches = ref(typeof window !== 'undefined' && window.matchMedia(query).matches)
	let media: MediaQueryList | undefined

	const update = (event?: MediaQueryListEvent) => {
		matches.value = event ? event.matches : Boolean(media?.matches)
	}

	onMounted(() => {
		media = window.matchMedia(query)
		update()
		media.addEventListener('change', update)
	})

	onBeforeUnmount(() => media?.removeEventListener('change', update))

	return matches
}

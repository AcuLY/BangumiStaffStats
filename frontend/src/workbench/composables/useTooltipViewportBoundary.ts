import { nextTick, onBeforeUnmount, onMounted } from 'vue'

const TOOLTIP_SELECTOR = '.n-workbench-viewport-tooltip'
const VIEWPORT_GUTTER = 12

let activeConsumers = 0
let clampQueued = false
let clampFrame: number | null = null

type RectEdges = {
	left: number
	top: number
	right: number
	bottom: number
}

export const calculateTooltipViewportShift = (rect: RectEdges, bounds: RectEdges) => {
	let x = 0
	let y = 0
	if (rect.left < bounds.left) x = bounds.left - rect.left
	else if (rect.right > bounds.right) x = bounds.right - rect.right
	if (rect.top < bounds.top) y = bounds.top - rect.top
	else if (rect.bottom > bounds.bottom) y = bounds.bottom - rect.bottom
	return { x, y }
}

const clampVisibleTooltips = () => {
	clampFrame = null
	clampQueued = false

	const viewport = window.visualViewport
	const viewportLeft = viewport?.offsetLeft ?? 0
	const viewportTop = viewport?.offsetTop ?? 0
	const viewportWidth = viewport?.width ?? document.documentElement.clientWidth
	const viewportHeight = viewport?.height ?? document.documentElement.clientHeight
	const minLeft = viewportLeft + VIEWPORT_GUTTER
	const minTop = viewportTop + VIEWPORT_GUTTER
	const maxRight = viewportLeft + viewportWidth - VIEWPORT_GUTTER
	const maxBottom = viewportTop + viewportHeight - VIEWPORT_GUTTER

	document.querySelectorAll<HTMLElement>(TOOLTIP_SELECTOR).forEach((tooltip) => {
		const follower = tooltip.closest<HTMLElement>('.v-binder-follower-content')
		if (!follower) return
		follower.style.left = '0px'
		follower.style.top = '0px'

		const rect = tooltip.getBoundingClientRect()
		if (!rect.width || !rect.height) return

		const shift = calculateTooltipViewportShift(rect, {
			left: minLeft,
			top: minTop,
			right: maxRight,
			bottom: maxBottom,
		})

		follower.style.left = `${Math.round(shift.x)}px`
		follower.style.top = `${Math.round(shift.y)}px`
	})
}

export const scheduleTooltipViewportClamp = () => {
	if (typeof window === 'undefined' || clampQueued) return
	clampQueued = true
	void nextTick(() => {
		clampFrame = window.requestAnimationFrame(clampVisibleTooltips)
	})
}

const handleViewportChange = () => scheduleTooltipViewportClamp()

export const useTooltipViewportBoundary = () => {
	onMounted(() => {
		activeConsumers += 1
		if (activeConsumers !== 1) return
		window.addEventListener('resize', handleViewportChange)
		window.visualViewport?.addEventListener('resize', handleViewportChange)
		window.visualViewport?.addEventListener('scroll', handleViewportChange)
	})

	onBeforeUnmount(() => {
		activeConsumers -= 1
		if (activeConsumers !== 0) return
		window.removeEventListener('resize', handleViewportChange)
		window.visualViewport?.removeEventListener('resize', handleViewportChange)
		window.visualViewport?.removeEventListener('scroll', handleViewportChange)
		if (clampFrame !== null) window.cancelAnimationFrame(clampFrame)
		clampFrame = null
		clampQueued = false
	})
}

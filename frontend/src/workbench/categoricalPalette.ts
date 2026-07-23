import type { WorkbenchTheme } from './types'

export const WORKBENCH_CATEGORICAL_PALETTES = {
	light: [
		'#C82A70', '#288183', '#C05852', '#916FC8', '#A07703',
		'#579459', '#368FC4', '#5B62AB', '#D96D92', '#C97F4E',
	],
	dark: [
		'#F16A9C', '#61A8AA', '#EF8E86', '#BEA0F2', '#D2AB59',
		'#87BD87', '#6FB7E9', '#8992D6', '#FFA9C3', '#FDB78C',
	],
} as const satisfies Record<WorkbenchTheme, readonly string[]>

export const categoricalPaletteForTheme = (theme: WorkbenchTheme) => (
	WORKBENCH_CATEGORICAL_PALETTES[theme]
)

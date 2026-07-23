import type { GlobalThemeOverrides } from 'naive-ui'

export const PRIMARY_PALETTE = {
	base: '#FF2075',
	hover: '#FF69B4',
	pressed: '#C71585',
	suppl: '#FF2075',
} as const

export const ThemeOverrides: GlobalThemeOverrides = {
	common: {
		primaryColor: PRIMARY_PALETTE.base,
		primaryColorHover: PRIMARY_PALETTE.hover,
		primaryColorPressed: PRIMARY_PALETTE.pressed,
		primaryColorSuppl: PRIMARY_PALETTE.suppl,
		borderRadius: '8px',
	},
}

export const PRIMARY_COLOR = PRIMARY_PALETTE.base
export const SECONDARY_COLOR = PRIMARY_PALETTE.base

export const MAX_MOBILE_WINDOW_WIDTH = 768

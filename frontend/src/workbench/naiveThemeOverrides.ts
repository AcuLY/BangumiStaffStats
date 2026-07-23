import type { GlobalThemeOverrides } from 'naive-ui'

export const WORKBENCH_PRIMARY_PALETTES = {
	light: {
		base: '#C82A70',
		hover: '#D23978',
		pressed: '#AD215F',
		suppl: '#C82A70',
		onPrimary: '#FFFFFF',
	},
	dark: {
		base: '#F16A9C',
		hover: '#FC85AF',
		pressed: '#DA578A',
		suppl: '#F16A9C',
		onPrimary: '#17171B',
	},
} as const

const LIGHT_PRIMARY_PALETTE = WORKBENCH_PRIMARY_PALETTES.light

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'
const THEME_FONT_SIZE = {
	control: '0.875rem',
	subheading: '1rem',
	statisticIntermediate: '1.125rem',
	section: '1.25rem',
} as const

const scrollbarThemeBase = {
	borderRadius: 'var(--scrollbar-radius)',
	color: 'var(--scrollbar-thumb)',
	colorHover: 'var(--scrollbar-thumb-hover)',
	railColor: 'var(--scrollbar-track)',
}

const componentScrollbarThemeOverrides = {
	...scrollbarThemeBase,
	height: 'var(--scrollbar-component-size)',
	width: 'var(--scrollbar-component-size)',
}

const selectTriggerThemeOverrides = { borderRadius: '6px' }

const tagThemeOverrides = {
	borderRadius: 'var(--workbench-tag-radius)',
	borderPrimary: '1px solid var(--workbench-tag-border)',
	textColorPrimary: 'var(--workbench-tag-text)',
	colorPrimary: 'var(--workbench-tag-background)',
	colorBorderedPrimary: 'var(--workbench-tag-background)',
	closeIconColorPrimary: 'var(--workbench-tag-text)',
	closeIconColorHoverPrimary: 'var(--primary-hover)',
	closeIconColorPressedPrimary: 'var(--primary-pressed)',
	closeColorHoverPrimary: 'color-mix(in oklab, var(--primary) 14%, transparent)',
	closeColorPressedPrimary: 'color-mix(in oklab, var(--primary) 22%, transparent)',
}

const getPrimaryButtonTextThemeOverrides = (color: string) => ({
	textColorPrimary: color,
	textColorHoverPrimary: color,
	textColorPressedPrimary: color,
	textColorFocusPrimary: color,
	textColorDisabledPrimary: color,
})

export const shellScrollbarThemeOverrides = {
	...scrollbarThemeBase,
	height: 'var(--scrollbar-shell-size)',
	width: 'var(--scrollbar-shell-size)',
}

export const workbenchThemeOverrides: GlobalThemeOverrides = {
	common: {
		fontFamily: FONT_STACK,
		fontFamilyMono: FONT_STACK,
		primaryColor: LIGHT_PRIMARY_PALETTE.base,
		primaryColorHover: LIGHT_PRIMARY_PALETTE.hover,
		primaryColorPressed: LIGHT_PRIMARY_PALETTE.pressed,
		primaryColorSuppl: LIGHT_PRIMARY_PALETTE.suppl,
		borderRadius: '6px',
		borderRadiusSmall: '6px',
	},
	Button: {
		borderRadiusMedium: '6px',
		...getPrimaryButtonTextThemeOverrides(LIGHT_PRIMARY_PALETTE.onPrimary),
	},
	Radio: {
		buttonColorActive: LIGHT_PRIMARY_PALETTE.base,
		buttonBorderColorActive: LIGHT_PRIMARY_PALETTE.base,
		buttonTextColorActive: LIGHT_PRIMARY_PALETTE.onPrimary,
	},
	Input: { borderRadius: '6px' },
	Select: { peers: { InternalSelection: selectTriggerThemeOverrides } },
	Tag: tagThemeOverrides,
	Pagination: { itemBorderRadius: '6px' },
	Drawer: { color: 'transparent' },
	Scrollbar: componentScrollbarThemeOverrides,
	Skeleton: {
		color: 'var(--surface-sunken)',
		colorEnd: 'color-mix(in oklab, var(--surface-sunken) 58%, var(--divider))',
		borderRadius: 'min(var(--query-skeleton-radius-cap, 6px), var(--query-skeleton-radius-ratio, 20%))',
	},
	Tabs: {
		tabColorSegment: LIGHT_PRIMARY_PALETTE.base,
		tabFontSizeSmall: THEME_FONT_SIZE.control,
		tabTextColorActiveSegment: LIGHT_PRIMARY_PALETTE.onPrimary,
	},
}

export const getWorkbenchThemeOverrides = (isDark: boolean): GlobalThemeOverrides => {
	const palette = isDark
		? WORKBENCH_PRIMARY_PALETTES.dark
		: WORKBENCH_PRIMARY_PALETTES.light

	return {
		...workbenchThemeOverrides,
		common: {
			...workbenchThemeOverrides.common,
			primaryColor: palette.base,
			primaryColorHover: palette.hover,
			primaryColorPressed: palette.pressed,
			primaryColorSuppl: palette.suppl,
		},
		Button: {
			...workbenchThemeOverrides.Button,
			...getPrimaryButtonTextThemeOverrides(palette.onPrimary),
		},
		Radio: {
			...workbenchThemeOverrides.Radio,
			buttonColorActive: palette.base,
			buttonBorderColorActive: palette.base,
			buttonTextColorActive: palette.onPrimary,
		},
		Skeleton: {
			...workbenchThemeOverrides.Skeleton,
			...(isDark ? {
				color: 'color-mix(in oklab, var(--text-3) 16%, var(--surface))',
				colorEnd: 'color-mix(in oklab, var(--text-3) 28%, var(--surface))',
			} : {}),
		},
		Tabs: {
			...workbenchThemeOverrides.Tabs,
			tabColorSegment: palette.base,
			tabTextColorActiveSegment: palette.onPrimary,
		},
	}
}

const desktopThemeToggleThemeOverrides = { heightMedium: '38px' } // naive-size-token-exception: desktop header controls follow the annotated 38px compact-control specification.

export const inspectorDrawerThemeOverrides = {
	headerPadding: '0',
}

export const getThemeToggleThemeOverrides = (isMobile: boolean) => (
	isMobile ? undefined : desktopThemeToggleThemeOverrides
)

export const getResultStatisticThemeOverrides = (isVoiceActorQuery: boolean, isMobile: boolean) => ({
	valueFontSize: isVoiceActorQuery
		? THEME_FONT_SIZE.subheading
		: (isMobile ? THEME_FONT_SIZE.statisticIntermediate : THEME_FONT_SIZE.section),
})

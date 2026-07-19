import type { GlobalThemeOverrides } from 'naive-ui'

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'
const ARCHIVE_PALETTE = { base: '#c60475', hover: '#d42281', pressed: '#b40069' }
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

export const shellScrollbarThemeOverrides = {
	...scrollbarThemeBase,
	height: 'var(--scrollbar-shell-size)',
	width: 'var(--scrollbar-shell-size)',
}

export const workbenchThemeOverrides: GlobalThemeOverrides = {
	common: {
		fontFamily: FONT_STACK,
		fontFamilyMono: FONT_STACK,
		primaryColor: ARCHIVE_PALETTE.base,
		primaryColorHover: ARCHIVE_PALETTE.hover,
		primaryColorPressed: ARCHIVE_PALETTE.pressed,
		borderRadius: '6px',
		borderRadiusSmall: '6px',
	},
	Button: {
		borderRadiusMedium: '6px',
		textColorPrimary: '#fff',
		textColorHoverPrimary: '#fff',
		textColorPressedPrimary: '#fff',
		textColorFocusPrimary: '#fff',
		textColorDisabledPrimary: '#fff',
	},
	Radio: {
		buttonColorActive: ARCHIVE_PALETTE.base,
		buttonBorderColorActive: ARCHIVE_PALETTE.base,
		buttonTextColorActive: '#fff',
	},
	Input: { borderRadius: '6px' },
	Select: { peers: { InternalSelection: { borderRadius: '6px' } } },
	Pagination: { itemBorderRadius: '6px' },
	Drawer: { color: 'transparent' },
	Scrollbar: componentScrollbarThemeOverrides,
	Tabs: {
		tabColorSegment: ARCHIVE_PALETTE.base,
		tabFontSizeSmall: THEME_FONT_SIZE.control,
		tabTextColorActiveSegment: '#fff',
	},
}

export const getWorkbenchThemeOverrides = (isDark: boolean): GlobalThemeOverrides => ({
	...workbenchThemeOverrides,
	Tabs: {
		...workbenchThemeOverrides.Tabs,
		...(isDark ? {} : { colorSegment: '#efeff3' }),
	},
})

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

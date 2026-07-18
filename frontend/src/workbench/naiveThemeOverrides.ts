import type { GlobalThemeOverrides } from 'naive-ui'

const FONT_STACK = '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif'
const ARCHIVE_PALETTE = { base: '#c60475', hover: '#d42281', pressed: '#b40069' }

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
	Tabs: {
		tabColorSegment: ARCHIVE_PALETTE.base,
		tabFontSizeSmall: '14px',
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

const mobileControlThemeOverrides = {
	common: { fontSizeSmall: '12px' }, // naive-size-token-exception: keep the native 28px small control height while applying the 12px mobile type spec.
} satisfies GlobalThemeOverrides

const mobileSelectThemeOverrides = {
	peers: {
		InternalSelection: { fontSizeSmall: '12px' }, // naive-size-token-exception: NSelect trigger text does not inherit the provider's common small font size.
		InternalSelectMenu: { optionFontSizeSmall: '12px' }, // naive-size-token-exception: keep expanded menu options aligned with the mobile toolbar type spec.
	},
}

const desktopThemeToggleThemeOverrides = { heightMedium: '38px' } // naive-size-token-exception: desktop header controls follow the annotated 38px compact-control specification.

export const inspectorDrawerThemeOverrides = {
	headerPadding: '12px 14px',
}

export const getWorkbenchControlThemeOverrides = (isMobile: boolean) => (
	isMobile ? mobileControlThemeOverrides : undefined
)

export const getWorkbenchSelectThemeOverrides = (isMobile: boolean) => (
	isMobile ? mobileSelectThemeOverrides : undefined
)

export const getThemeToggleThemeOverrides = (isMobile: boolean) => (
	isMobile ? undefined : desktopThemeToggleThemeOverrides
)

export const getResultStatisticThemeOverrides = (isVoiceActorQuery: boolean, isMobile: boolean) => ({
	valueFontSize: isVoiceActorQuery ? '16px' : (isMobile ? '18px' : '20px'),
})

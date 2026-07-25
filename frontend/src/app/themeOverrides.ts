import type { GlobalThemeOverrides } from 'naive-ui';

import type { AppTheme } from './theme';

const palettes = {
  dark: {
    base: '#F16A9C',
    hover: '#FC85AF',
    onPrimary: '#17171B',
    pressed: '#DA578A',
  },
  light: {
    base: '#C82A70',
    hover: '#D23978',
    onPrimary: '#FFFFFF',
    pressed: '#AD215F',
  },
} as const;

const scrollbarThemeBase = {
  borderRadius: 'var(--scrollbar-radius)',
  color: 'var(--scrollbar-thumb)',
  colorHover: 'var(--scrollbar-thumb-hover)',
  railColor: 'var(--scrollbar-track)',
} as const;

export const shellScrollbarThemeOverrides = Object.freeze({
  ...scrollbarThemeBase,
  height: 'var(--scrollbar-shell-size)',
  width: 'var(--scrollbar-shell-size)',
});

export function appThemeOverrides(theme: AppTheme): GlobalThemeOverrides {
  const palette = palettes[theme];
  const primaryButtonText = {
    textColorPrimary: palette.onPrimary,
    textColorHoverPrimary: palette.onPrimary,
    textColorPressedPrimary: palette.onPrimary,
    textColorFocusPrimary: palette.onPrimary,
    textColorDisabledPrimary: palette.onPrimary,
  };

  return {
    common: {
      borderRadius: '6px',
      borderRadiusSmall: '6px',
      fontFamily:
        '"Source Han Sans SC VF", "Source Han Sans SC", "Noto Sans CJK SC", "PingFang SC", sans-serif',
      primaryColor: palette.base,
      primaryColorHover: palette.hover,
      primaryColorPressed: palette.pressed,
      primaryColorSuppl: palette.base,
      textColorBase: theme === 'dark' ? '#F1F0F4' : '#2E2B32',
    },
    Button: {
      borderRadiusMedium: '6px',
      ...primaryButtonText,
    },
    Drawer: {
      color: 'transparent',
    },
    Input: {
      borderRadius: '6px',
    },
    Pagination: {
      itemBorderRadius: '6px',
    },
    Radio: {
      buttonBorderColorActive: palette.base,
      buttonColorActive: palette.base,
      buttonTextColorActive: palette.onPrimary,
    },
    Scrollbar: {
      ...scrollbarThemeBase,
      height: 'var(--scrollbar-component-size)',
      width: 'var(--scrollbar-component-size)',
    },
    Select: {
      peers: {
        InternalSelection: {
          borderRadius: '6px',
        },
      },
    },
    Skeleton: {
      borderRadius:
        'min(var(--query-skeleton-radius-cap, 6px), var(--query-skeleton-radius-ratio, 20%))',
      color:
        theme === 'dark'
          ? 'color-mix(in oklab, var(--text-tertiary) 16%, var(--surface))'
          : 'var(--surface-sunken)',
      colorEnd:
        theme === 'dark'
          ? 'color-mix(in oklab, var(--text-tertiary) 28%, var(--surface))'
          : 'color-mix(in oklab, var(--surface-sunken) 58%, var(--divider))',
    },
    Tabs: {
      tabColorSegment: palette.base,
      tabFontSizeSmall: '0.875rem',
      tabTextColorActiveSegment: palette.onPrimary,
    },
    Tag: {
      borderPrimary: '1px solid var(--query-tag-border)',
      borderRadius: 'var(--radius-control)',
      closeColorHoverPrimary:
        'color-mix(in oklab, var(--brand) 14%, transparent)',
      closeColorPressedPrimary:
        'color-mix(in oklab, var(--brand) 22%, transparent)',
      closeIconColorHoverPrimary: palette.hover,
      closeIconColorPressedPrimary: palette.pressed,
      closeIconColorPrimary: palette.base,
      colorBorderedPrimary: 'var(--query-tag-background)',
      colorPrimary: 'var(--query-tag-background)',
      textColorPrimary: palette.base,
    },
  };
}

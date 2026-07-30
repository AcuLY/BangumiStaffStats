import { describe, expect, it } from 'vitest';

import {
  appThemeOverrides,
  shellScrollbarThemeOverrides,
} from '../../src/app/themeOverrides';

describe('application oracle theme overrides', () => {
  it('keeps light segmented, radio, tag, and primary controls on the oracle palette', () => {
    const theme = appThemeOverrides('light');

    expect(theme.Tabs).toMatchObject({
      tabColorSegment: '#C82A70',
      tabFontSizeSmall: '0.875rem',
      tabTextColorActiveSegment: '#FFFFFF',
    });
    expect(theme.Radio).toMatchObject({
      buttonBorderColorActive: '#C82A70',
      buttonColorActive: '#C82A70',
      buttonTextColorActive: '#FFFFFF',
    });
    expect(theme.Input).not.toHaveProperty('heightMedium');
    expect(theme.Radio).not.toHaveProperty('buttonHeightMedium');
    expect(theme.Tag).toMatchObject({
      borderPrimary: '1px solid var(--query-tag-border)',
      colorPrimary: 'var(--query-tag-background)',
      textColorPrimary: '#C82A70',
    });
    expect(theme.Button).toMatchObject({
      textColorPrimary: '#FFFFFF',
      textColorHoverPrimary: '#FFFFFF',
      textColorPressedPrimary: '#FFFFFF',
    });
  });

  it('uses the oracle dark on-primary contrast and component scrollbar tokens', () => {
    const theme = appThemeOverrides('dark');

    expect(theme.Button).toMatchObject({
      textColorDisabledPrimary: '#17171B',
      textColorFocusPrimary: '#17171B',
      textColorPrimary: '#17171B',
    });
    expect(theme.Tabs).toMatchObject({
      tabColorSegment: '#F16A9C',
      tabTextColorActiveSegment: '#17171B',
    });
    expect(theme.Scrollbar).toMatchObject({
      borderRadius: 'var(--scrollbar-radius)',
      color: 'var(--scrollbar-thumb)',
      height: 'var(--scrollbar-component-size)',
      width: 'var(--scrollbar-component-size)',
    });
    expect(shellScrollbarThemeOverrides).toMatchObject({
      borderRadius: 'var(--scrollbar-radius)',
      color: 'var(--scrollbar-thumb)',
      colorHover: 'var(--scrollbar-thumb-hover)',
      height: 'var(--scrollbar-shell-size)',
      railColor: 'var(--scrollbar-track)',
      width: 'var(--scrollbar-shell-size)',
    });
  });
});

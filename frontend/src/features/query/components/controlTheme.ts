export type QueryControlSize = 'small' | 'medium';

export const queryInputThemeOverrides = Object.freeze({
  heightMedium: '34px',
  heightSmall: '28px',
});

export const queryRadioThemeOverrides = Object.freeze({
  buttonHeightMedium: '34px',
  buttonHeightSmall: '28px',
});

export const querySelectThemeOverrides = Object.freeze({
  peers: {
    InternalSelection: queryInputThemeOverrides,
  },
});

export const queryDatePickerThemeOverrides = Object.freeze({
  peers: {
    Input: queryInputThemeOverrides,
  },
});

export const queryInputNumberThemeOverrides = Object.freeze({
  peers: {
    Input: queryInputThemeOverrides,
  },
});

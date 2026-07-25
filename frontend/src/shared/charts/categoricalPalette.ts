export interface CategoricalSeriesSlot {
  readonly color: string;
  readonly contrast: string;
}

export const CATEGORICAL_SERIES_COLORS = Object.freeze(
  Array.from(
    { length: 10 },
    (_, index) => `var(--chart-series-${index + 1})`,
  ),
);

export const CATEGORICAL_SERIES_CONTRASTS = Object.freeze(
  Array.from(
    { length: 10 },
    (_, index) => `var(--chart-series-contrast-${index + 1})`,
  ),
);

export function categoricalSeriesSlot(index: number): CategoricalSeriesSlot {
  const length = CATEGORICAL_SERIES_COLORS.length;
  const normalized = ((Math.trunc(index) % length) + length) % length;
  return Object.freeze({
    color: CATEGORICAL_SERIES_COLORS[normalized]!,
    contrast: CATEGORICAL_SERIES_CONTRASTS[normalized]!,
  });
}

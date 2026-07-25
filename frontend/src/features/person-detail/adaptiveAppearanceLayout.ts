export interface AdaptiveAppearanceRow {
  entries: number[];
  hiddenCount?: number;
}

function fitsPair(
  firstWidth: number,
  secondWidth: number,
  availableWidth: number,
  columnGap: number,
): boolean {
  const columnWidth = availableWidth / 2;
  return (
    firstWidth + columnGap <= columnWidth &&
    secondWidth <= columnWidth
  );
}

function packEntries(
  widths: readonly number[],
  visibleCount: number,
  availableWidth: number,
  columnGap: number,
): AdaptiveAppearanceRow[] {
  const packed: AdaptiveAppearanceRow[] = [];
  let index = 0;
  while (index < visibleCount) {
    const pair =
      index + 1 < visibleCount &&
      fitsPair(
        widths[index]!,
        widths[index + 1]!,
        availableWidth,
        columnGap,
      );
    packed.push({ entries: pair ? [index, index + 1] : [index] });
    index += pair ? 2 : 1;
  }
  return packed;
}

export function packAdaptiveAppearanceRows(
  widths: readonly number[],
  availableWidth: number,
  columnGap: number,
  overflowWidth: number,
  maxRows = 2,
): AdaptiveAppearanceRow[] {
  const complete = packEntries(
    widths,
    widths.length,
    availableWidth,
    columnGap,
  );
  if (complete.length <= maxRows) {
    return complete;
  }

  for (
    let visibleCount = widths.length - 1;
    visibleCount >= 1;
    visibleCount -= 1
  ) {
    const packed = packEntries(
      widths,
      visibleCount,
      availableWidth,
      columnGap,
    );
    if (packed.length > maxRows) {
      continue;
    }
    const lastRow = packed.at(-1);
    if (
      lastRow?.entries.length === 1 &&
      fitsPair(
        widths[lastRow.entries[0]!]!,
        overflowWidth,
        availableWidth,
        columnGap,
      )
    ) {
      lastRow.hiddenCount = widths.length - visibleCount;
      return packed;
    }
  }

  return widths.length
    ? [{ entries: [0], hiddenCount: widths.length - 1 }]
    : [];
}

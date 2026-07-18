export interface AdaptiveOverflowRow {
	entries: number[]
	hiddenCount?: number
}

const fitsPair = (
	firstWidth: number,
	secondWidth: number,
	availableWidth: number,
	columnGap: number,
) => {
	const columnWidth = availableWidth / 2
	return firstWidth + columnGap <= columnWidth && secondWidth <= columnWidth
}

const packEntries = (
	widths: number[],
	visibleCount: number,
	availableWidth: number,
	columnGap: number,
) => {
	const rows: AdaptiveOverflowRow[] = []
	let index = 0
	while (index < visibleCount) {
		const pair = index + 1 < visibleCount
			&& fitsPair(widths[index], widths[index + 1], availableWidth, columnGap)
		rows.push({ entries: pair ? [index, index + 1] : [index] })
		index += pair ? 2 : 1
	}
	return rows
}

export const packAdaptiveOverflowRows = ({
	widths,
	availableWidth,
	columnGap,
	overflowWidth,
	maxRows,
}: {
	widths: number[]
	availableWidth: number
	columnGap: number
	overflowWidth: number
	maxRows: number
}): AdaptiveOverflowRow[] => {
	const fullRows = packEntries(widths, widths.length, availableWidth, columnGap)
	if (fullRows.length <= maxRows) return fullRows

	for (let visibleCount = widths.length - 1; visibleCount >= 1; visibleCount -= 1) {
		const rows = packEntries(widths, visibleCount, availableWidth, columnGap)
		if (rows.length > maxRows) continue

		const hiddenCount = widths.length - visibleCount
		const lastRow = rows[rows.length - 1]
		if (lastRow?.entries.length === 1) {
			const finalEntryWidth = widths[lastRow.entries[0]]
			if (fitsPair(finalEntryWidth, overflowWidth, availableWidth, columnGap)) {
				lastRow.hiddenCount = hiddenCount
				return rows
			}
		}
	}

	if (!widths.length) return []

	// The counter may not own a row in ranking lists. If even the first natural
	// copy is wider than a half-cell, keep it beside the counter and let the
	// rendered copy ellipsize inside its reserved half instead of dropping all
	// visible context.
	return [{ entries: [0], hiddenCount: widths.length - 1 }]
}

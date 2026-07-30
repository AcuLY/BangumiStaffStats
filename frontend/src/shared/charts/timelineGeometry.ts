export interface TimelinePointGeometry {
  readonly x: number;
  readonly y: number;
}

export interface TimelineHitSize {
  readonly height: number;
  readonly width: number;
}

export function timelineHitSizeInViewBox(
  renderedWidth: number,
  renderedHeight: number,
  viewBoxWidth = 440,
  viewBoxHeight = 236,
  minimumCssSize = 44,
): TimelineHitSize {
  if (renderedWidth <= 0 || renderedHeight <= 0) {
    return { height: minimumCssSize, width: minimumCssSize };
  }
  return {
    height: Math.min(
      viewBoxHeight,
      (minimumCssSize * viewBoxHeight) / renderedHeight,
    ),
    width: Math.min(
      viewBoxWidth,
      (minimumCssSize * viewBoxWidth) / renderedWidth,
    ),
  };
}

export function closestTimelinePointIndex(
  clientX: number,
  clientY: number,
  svgBounds: Readonly<{
    height: number;
    left: number;
    top: number;
    width: number;
  }>,
  points: readonly TimelinePointGeometry[],
  maximumDistance = 22,
  viewBoxWidth = 440,
  viewBoxHeight = 236,
): number | null {
  if (svgBounds.width <= 0 || svgBounds.height <= 0) {
    return null;
  }
  let closest: { distanceSquared: number; index: number } | null = null;
  for (const [index, point] of points.entries()) {
    const pointX =
      svgBounds.left + (point.x / viewBoxWidth) * svgBounds.width;
    const pointY =
      svgBounds.top + (point.y / viewBoxHeight) * svgBounds.height;
    const distanceSquared =
      (clientX - pointX) ** 2 + (clientY - pointY) ** 2;
    if (!closest || distanceSquared < closest.distanceSquared) {
      closest = { distanceSquared, index };
    }
  }
  return closest &&
    closest.distanceSquared <= maximumDistance ** 2
    ? closest.index
    : null;
}

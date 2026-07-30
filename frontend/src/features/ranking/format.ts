import type {
  RankingItem,
  RankingMetricScale,
  RankingRational,
  RankingSort,
} from './model';

function rationalParts(
  value: RankingRational,
): { denominator: bigint; numerator: bigint } | null {
  try {
    const numerator = BigInt(value.numerator);
    const denominator = BigInt(value.denominator);
    return denominator > 0n ? { denominator, numerator } : null;
  } catch {
    return null;
  }
}

export function formatHundredths(value: number | null): string {
  return value === null ? '—' : (value / 100).toFixed(2);
}

export function formatRational(
  value: RankingRational | null | undefined,
): string {
  if (!value) {
    return '—';
  }
  const parts = rationalParts(value);
  if (!parts) {
    return '—';
  }
  const negative = parts.numerator < 0n;
  const magnitude = negative ? -parts.numerator : parts.numerator;
  const scaled = (magnitude * 100n + parts.denominator / 2n) / parts.denominator;
  const integer = scaled / 100n;
  const fraction = String(scaled % 100n).padStart(2, '0');
  const sign = parts.numerator === 0n ? '' : negative ? '−' : '+';
  return `${sign}${integer}.${fraction}`;
}

export function rankingMetricValue(
  item: RankingItem,
  metric: RankingSort,
): number | RankingRational | null {
  if (metric === 'count') {
    return item.workCount;
  }
  if (metric === 'average') {
    return item.average;
  }
  if (metric === 'overall') {
    return item.overall;
  }
  return item.preference?.score ?? null;
}

export function rankingProgress(
  item: RankingItem,
  scale: RankingMetricScale,
): { direction: 'negative' | 'neutral' | 'positive'; percent: number } {
  const value = rankingMetricValue(item, scale.metric);
  if (value === null || scale.max === null) {
    return { direction: 'neutral', percent: 0 };
  }

  if (typeof value === 'number' && typeof scale.max === 'number') {
    if (scale.max <= 0) {
      return { direction: 'neutral', percent: 0 };
    }
    return {
      direction: value > 0 ? 'positive' : 'neutral',
      percent: Math.min(100, Math.max(0, (value / scale.max) * 100)),
    };
  }

  if (typeof value === 'object' && typeof scale.max === 'object') {
    const valueParts = rationalParts(value);
    const maximumParts = rationalParts(scale.max);
    if (
      !valueParts ||
      !maximumParts ||
      maximumParts.numerator <= 0n
    ) {
      return { direction: 'neutral', percent: 0 };
    }
    const direction =
      valueParts.numerator < 0n
        ? 'negative'
        : valueParts.numerator > 0n
          ? 'positive'
          : 'neutral';
    const magnitude =
      valueParts.numerator < 0n
        ? -valueParts.numerator
        : valueParts.numerator;
    const ratioBasisPoints =
      (magnitude *
        maximumParts.denominator *
        10_000n) /
      (valueParts.denominator * maximumParts.numerator);
    return {
      direction,
      percent: Math.min(100, Number(ratioBasisPoints) / 100),
    };
  }

  return { direction: 'neutral', percent: 0 };
}

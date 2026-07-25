export type {
  RankingItem,
  RankingMetricScale,
  RankingPayload,
  RankingPreference,
  RankingRational,
} from '../../api/adapters/rankings';
import type { RankingsViewState } from '../query/coordinator';

export type RankingOrder = 'asc' | 'desc';
export type RankingSort = 'average' | 'count' | 'overall' | 'preference';
export type RankingPageSize = 5 | 10 | 20;
export type RankingView = RankingsViewState;

export const defaultRankingView: RankingView = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'count',
});

export function updateRankingView(
  current: Readonly<RankingView>,
  patch: Partial<RankingView>,
): RankingView {
  const resetsPage =
    patch.search !== undefined ||
    patch.sort !== undefined ||
    patch.order !== undefined ||
    patch.pageSize !== undefined;
  return Object.freeze({
    ...current,
    ...patch,
    page: resetsPage ? 1 : (patch.page ?? current.page),
  });
}

export function rankingViewEquals(
  left: Readonly<RankingView>,
  right: Readonly<RankingView>,
): boolean {
  return (
    left.search === right.search &&
    left.sort === right.sort &&
    left.order === right.order &&
    left.page === right.page &&
    left.pageSize === right.pageSize
  );
}

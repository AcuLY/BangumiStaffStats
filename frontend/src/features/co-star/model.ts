import type { CandidatePayload } from '../../api/adapters/candidates';
import type { CandidatesViewState } from '../query/coordinator';

export interface CandidateInput {
  readonly positionKey: string;
}

export type CandidateOrder = CandidatesViewState['order'];
export type CandidatePageSize = CandidatesViewState['pageSize'];
export type CandidateSort = CandidatesViewState['sort'];
export type CandidateView = CandidatesViewState;

export const defaultCandidateView: Readonly<CandidateView> = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'count',
});

export interface CandidateResource {
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: Readonly<CandidateInput>;
  readonly payload: CandidatePayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly view: Readonly<Partial<CandidateView>>;
  readonly viewPending: boolean;
}

export interface SelectedIdentity {
  readonly person: Readonly<{
    id: number;
    name: string;
    nameCN: string | null;
  }>;
  readonly positionKey: string;
  readonly positionLabel: string;
}

export interface SelectedPerson {
  readonly identities: readonly SelectedIdentity[];
  readonly person: SelectedIdentity['person'];
}

export function primaryPersonName(
  person: Readonly<{ name: string; nameCN: string | null }>,
): string {
  return person.nameCN ?? person.name;
}

export function candidateSortOptions(
  scope: 'global' | 'personal',
  workUnit: 'series' | 'subject',
): readonly Readonly<{ label: string; value: CandidateSort }>[] {
  return Object.freeze([
    Object.freeze({
      label: workUnit === 'series' ? '系列数' : '作品数',
      value: 'count' as const,
    }),
    Object.freeze({
      label: scope === 'personal' ? '我的均分' : '均分',
      value: 'average' as const,
    }),
    ...(scope === 'personal'
      ? [
          Object.freeze({
            label: '全站均分',
            value: 'globalAverage' as const,
          }),
        ]
      : []),
  ]);
}

export function updateCandidateView(
  current: Readonly<CandidateView>,
  patch: Partial<CandidateView>,
): Readonly<CandidateView> {
  const resetPage =
    patch.search !== undefined ||
    patch.sort !== undefined ||
    patch.order !== undefined ||
    patch.pageSize !== undefined;
  return Object.freeze({
    ...current,
    ...patch,
    ...(resetPage && patch.page === undefined ? { page: 1 } : {}),
  });
}

export function candidateInput(positionKey: string): Readonly<CandidateInput> {
  return Object.freeze({ positionKey });
}

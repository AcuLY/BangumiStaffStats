import type {
  CoStarData,
  CoStarPayload,
} from '../../api/adapters/coStar';
import type { CoStarViewState } from '../query/coordinator';
import type { SelectedPerson } from './model';

export interface CoStarInput {
  readonly participants: readonly Readonly<{
    personId: number;
    positionKeys: readonly string[];
  }>[];
}

export type CoStarView = CoStarViewState;
export type CoStarSort = CoStarView['sort'];
type CoStarGroupData = Extract<
  CoStarData,
  { readonly kind: 'group' }
>;
export type CoStarParticipant = CoStarData['participants'][number];
export type CoStarMatrixMetrics =
  CoStarGroupData['matrix']['pairs'][number]['metrics'];
export type CoStarWorkItem = CoStarData['items'][number];
export type CoStarRatingDataset = CoStarData['ratings']['datasets'][number];
export type CoStarRatingDistribution = CoStarRatingDataset['global'];
export type CoStarPersonalData = Extract<
  CoStarData,
  { readonly preference: unknown }
>;
export type CoStarPreferenceItem =
  CoStarPersonalData['preference']['preferred'][number];
export type CoStarTag = CoStarData['tags']['meta'][number];

export interface CoStarResource {
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: Readonly<CoStarInput>;
  readonly payload: CoStarPayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly requestId?: string | null;
  readonly view: Readonly<Partial<CoStarView>>;
  readonly viewPending: boolean;
}

export interface CoStarMatrixCell {
  readonly column: CoStarParticipant;
  readonly kind: 'diagonal' | 'pair';
  readonly metrics: CoStarMatrixMetrics;
  readonly row: CoStarParticipant;
}

export interface CoStarMatrixRow {
  readonly cells: readonly CoStarMatrixCell[];
  readonly participant: CoStarParticipant;
}

export function defaultCoStarView(
  scope: 'global' | 'personal',
): Readonly<CoStarView> {
  return Object.freeze({
    order: 'desc',
    page: 1,
    pageSize: 10,
    search: '',
    sort: scope === 'personal' ? 'personalScore' : 'globalScore',
  });
}

export function coStarInput(
  people: readonly SelectedPerson[],
): Readonly<CoStarInput> {
  return Object.freeze({
    participants: Object.freeze(
      people.map((person) =>
        Object.freeze({
          personId: person.person.id,
          positionKeys: Object.freeze(
            person.identities.map((identity) => identity.positionKey),
          ),
        }),
      ),
    ),
  });
}

export function coStarInputMatchesSelection(
  input: Readonly<CoStarInput>,
  people: readonly SelectedPerson[],
): boolean {
  return (
    input.participants.length === people.length &&
    input.participants.every((participant, index) => {
      const selected = people[index];
      return (
        participant.personId === selected?.person.id &&
        participant.positionKeys.length === selected.identities.length &&
        participant.positionKeys.every(
          (positionKey, positionIndex) =>
            positionKey ===
            selected.identities[positionIndex]?.positionKey,
        )
      );
    })
  );
}

export function updateCoStarView(
  current: Readonly<CoStarView>,
  patch: Partial<CoStarView>,
): Readonly<CoStarView> {
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

export function coStarSortOptions(
  scope: 'global' | 'personal',
  workUnit: 'series' | 'subject',
): readonly Readonly<{ label: string; value: CoStarSort }>[] {
  return Object.freeze([
    ...(scope === 'personal'
      ? [
          Object.freeze({
            label: workUnit === 'series' ? '我的系列均分' : '我的评分',
            value: 'personalScore' as const,
          }),
        ]
      : []),
    Object.freeze({
      label: scope === 'personal' ? '全站评分' : '评分',
      value: 'globalScore' as const,
    }),
    ...(scope === 'personal'
      ? [
          Object.freeze({
            label: '收藏日期',
            value: 'collectionUpdatedAt' as const,
          }),
        ]
      : []),
    ...(workUnit === 'series'
      ? [
          Object.freeze({
            label: '系列规模',
            value: 'seriesSize' as const,
          }),
        ]
      : []),
  ]);
}

function pairKey(leftPersonId: number, rightPersonId: number): string {
  return `${leftPersonId}\u0000${rightPersonId}`;
}

/**
 * Mirrors the server's already-validated upper triangle for presentation.
 * No metric, ranking, leader, or aggregate is derived here.
 */
export function projectCoStarMatrix(
  data: CoStarGroupData,
): readonly CoStarMatrixRow[] {
  const pairs = new Map(
    data.matrix.pairs.map((pair) => [
      pairKey(pair.leftPersonId, pair.rightPersonId),
      pair.metrics,
    ]),
  );
  return Object.freeze(
    data.participants.map((row, rowIndex) =>
      Object.freeze({
        cells: Object.freeze(
          data.participants.map((column, columnIndex) => {
            if (row.person.id === column.person.id) {
              return Object.freeze({
                column,
                kind: 'diagonal' as const,
                metrics: row.metrics,
                row,
              });
            }
            const left =
              rowIndex < columnIndex ? row.person.id : column.person.id;
            const right =
              rowIndex < columnIndex ? column.person.id : row.person.id;
            const metrics = pairs.get(pairKey(left, right));
            if (!metrics) {
              throw new TypeError('Co-star matrix projection is incomplete');
            }
            return Object.freeze({
              column,
              kind: 'pair' as const,
              metrics,
              row,
            });
          }),
        ),
        participant: row,
      }),
    ),
  );
}

import type {
  PartnerCore,
  PartnerItem,
  PartnersPayload,
} from '../../api/adapters/partners';
import type { PartnersViewState } from '../query/coordinator';
import type {
  SelectedIdentity,
  SelectedPerson,
} from './model';
import type {
  CoStarSelection,
  SelectionResult,
} from './selection';

export interface PartnersInput {
  readonly candidatePositionKey?: string;
  readonly source: Readonly<{
    personId: number;
    positionKeys: readonly string[];
  }>;
}

export type PartnersOrder = PartnersViewState['order'];
export type PartnersPageSize = PartnersViewState['pageSize'];
export type PartnersSort = PartnersViewState['sort'];
export type PartnersView = PartnersViewState;

export const defaultPartnersView: Readonly<PartnersView> = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  sort: 'count',
});

export interface PartnersResource {
  readonly error: string | null;
  readonly feedback: string | null;
  readonly input: Readonly<PartnersInput>;
  readonly payload: PartnersPayload | null;
  readonly phase: 'error' | 'idle' | 'pending' | 'ready';
  readonly requestId?: string | null;
  readonly view: Readonly<Partial<PartnersView>>;
  readonly viewPending: boolean;
}

export function partnersInput(
  source: SelectedPerson,
  candidatePositionKey?: string,
): Readonly<PartnersInput> {
  return Object.freeze({
    source: Object.freeze({
      personId: source.person.id,
      positionKeys: Object.freeze(
        source.identities.map((identity) => identity.positionKey),
      ),
    }),
    ...(candidatePositionKey ? { candidatePositionKey } : {}),
  });
}

export function partnersInputMatchesSelection(
  input: Readonly<PartnersInput>,
  source: SelectedPerson,
): boolean {
  return (
    input.source.personId === source.person.id &&
    input.source.positionKeys.length === source.identities.length &&
    input.source.positionKeys.every(
      (positionKey, index) =>
        positionKey === source.identities[index]?.positionKey,
    )
  );
}

export function partnerSortOptions(
  scope: 'global' | 'personal',
  workUnit: 'series' | 'subject',
): readonly Readonly<{ label: string; value: PartnersSort }>[] {
  return Object.freeze([
    Object.freeze({
      label: workUnit === 'series' ? '系列数' : '作品数',
      value: 'count' as const,
    }),
    Object.freeze({
      label: '均分',
      value: 'average' as const,
    }),
    Object.freeze({
      label: '综合分',
      value: 'overall' as const,
    }),
    ...(scope === 'personal'
      ? [
          Object.freeze({
            label: '相对偏好',
            value: 'preference' as const,
          }),
        ]
      : []),
  ]);
}

export function updatePartnersView(
  current: Readonly<PartnersView>,
  patch: Partial<PartnersView>,
): Readonly<PartnersView> {
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

export function activatePartner(
  selection: CoStarSelection,
  item: PartnerCore | PartnerItem,
  positionLabel: (positionKey: string) => string,
): SelectionResult {
  const current = selection.identities.value;
  const existing = new Set(
    current.map(
      (identity) =>
        `${identity.person.id}\u0000${identity.positionKey}`,
    ),
  );
  const additions: SelectedIdentity[] = item.positionKeys.flatMap(
    (positionKey) => {
      const identity: SelectedIdentity = {
        person: item.person,
        positionKey,
        positionLabel: positionLabel(positionKey),
      };
      return existing.has(
        `${identity.person.id}\u0000${identity.positionKey}`,
      )
        ? []
        : [identity];
    },
  );
  return selection.replace([...current, ...additions]);
}

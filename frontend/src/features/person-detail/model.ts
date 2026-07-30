import type {
  PersonDetailPayload,
  PersonDetailRational,
} from '../../api/adapters/personDetail';
import type { PersonDetailViewState } from '../query/coordinator';

export type {
  PersonDetailCharacterItem,
  PersonDetailContribution,
  PersonDetailPayload,
  PersonDetailRational,
  PersonDetailRatingSet,
  PersonDetailSeriesItem,
  PersonDetailSubjectItem,
} from '../../api/adapters/personDetail';

export type PersonDetailPageSize = 5 | 10 | 20;
export type PersonDetailSection = 'characters' | 'works';
export type PersonDetailSort =
  | 'collectionUpdatedAt'
  | 'globalScore'
  | 'name'
  | 'personalScore'
  | 'role'
  | 'seriesSize'
  | 'workCount';
export type PersonDetailView = PersonDetailViewState;

export interface PersonPositionDisplay {
  readonly detail?: string;
  readonly label: string;
}

export type PersonPositionLabelResolver = (
  positionKey: string,
  exactPositionKey?: string,
) => PersonPositionDisplay;

export const defaultPersonDetailView: PersonDetailView = Object.freeze({
  order: 'desc',
  page: 1,
  pageSize: 10,
  search: '',
  section: 'works',
  sort: 'globalScore',
});

export function updatePersonDetailView(
  current: Readonly<PersonDetailView>,
  patch: Partial<PersonDetailView>,
): PersonDetailView {
  const resetsPage =
    patch.section !== undefined ||
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

export function primaryPersonName(
  person: PersonDetailPayload['person'],
): string {
  return person.nameCN ?? person.name;
}

export function secondaryPersonName(
  person: PersonDetailPayload['person'],
): string | null {
  return person.nameCN && person.nameCN !== person.name ? person.name : null;
}

export function primaryEntityName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string {
  return entity.nameCN ?? entity.name;
}

export function secondaryEntityName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string | null {
  return entity.nameCN && entity.nameCN !== entity.name ? entity.name : null;
}

export function formatHundredths(value: number | null | undefined): string {
  return value === null || value === undefined
    ? '—'
    : (value / 100).toFixed(2);
}

export function formatSignedHundredths(
  value: number | null | undefined,
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (value === 0) {
    return '0.00';
  }
  const sign = value < 0 ? '−' : '+';
  return `${sign}${(Math.abs(value) / 100).toFixed(2)}`;
}

export function rationalDecimal(
  value: PersonDetailRational | null | undefined,
  signed = false,
): string {
  if (!value) {
    return '—';
  }
  try {
    const numerator = BigInt(value.numerator);
    const denominator = BigInt(value.denominator);
    if (denominator <= 0n) {
      return '—';
    }
    const magnitude = numerator < 0n ? -numerator : numerator;
    const roundedHundredths =
      (magnitude * 100n + denominator / 2n) / denominator;
    if (roundedHundredths === 0n) {
      return '0.00';
    }
    const whole = roundedHundredths / 100n;
    const fraction = (roundedHundredths % 100n).toString().padStart(2, '0');
    const sign = numerator < 0n ? '−' : signed ? '+' : '';
    return `${sign}${whole}.${fraction}`;
  } catch {
    return '—';
  }
}

import { computed, readonly, ref, type ComputedRef, type Ref } from 'vue';

import type {
  SelectedIdentity,
  SelectedPerson,
} from './model';

export const MAX_SELECTED_PEOPLE = 10;
export const MAX_SELECTED_IDENTITIES = 20;

export type SelectionFailure =
  | 'identity-limit'
  | 'invalid-identity'
  | 'participant-limit';

export type SelectionResult =
  | Readonly<{ ok: true }>
  | Readonly<{ message: string; ok: false; reason: SelectionFailure }>;

export interface CoStarSelection {
  readonly identities: Readonly<Ref<readonly SelectedIdentity[]>>;
  readonly identityCount: ComputedRef<number>;
  readonly limitError: Readonly<Ref<string | null>>;
  readonly people: ComputedRef<readonly SelectedPerson[]>;
  readonly personCount: ComputedRef<number>;
  clear(): void;
  has(personId: number, positionKey: string): boolean;
  identitiesFor(personId: number): readonly SelectedIdentity[];
  removeIdentity(personId: number, positionKey: string): void;
  removePerson(personId: number): void;
  replace(identities: readonly SelectedIdentity[]): SelectionResult;
  toggle(identity: SelectedIdentity): SelectionResult;
}

function identityKey(personId: number, positionKey: string): string {
  return `${personId}\u0000${positionKey}`;
}

function frozenIdentity(identity: SelectedIdentity): SelectedIdentity {
  return Object.freeze({
    person: Object.freeze({
      id: identity.person.id,
      name: identity.person.name,
      nameCN: identity.person.nameCN,
    }),
    positionKey: identity.positionKey,
    positionLabel: identity.positionLabel,
  });
}

function validateIdentity(identity: SelectedIdentity): SelectionResult {
  if (
    !Number.isSafeInteger(identity.person.id) ||
    identity.person.id < 1 ||
    identity.person.name.length === 0 ||
    identity.positionKey.length === 0 ||
    identity.positionLabel.length === 0
  ) {
    return Object.freeze({
      message: '人物身份无效',
      ok: false,
      reason: 'invalid-identity',
    });
  }
  return Object.freeze({ ok: true });
}

function validateSet(identities: readonly SelectedIdentity[]): SelectionResult {
  if (identities.length > MAX_SELECTED_IDENTITIES) {
    return Object.freeze({
      message: `最多选择 ${MAX_SELECTED_IDENTITIES} 个身份`,
      ok: false,
      reason: 'identity-limit',
    });
  }
  const people = new Set(identities.map((identity) => identity.person.id));
  if (people.size > MAX_SELECTED_PEOPLE) {
    return Object.freeze({
      message: `最多选择 ${MAX_SELECTED_PEOPLE} 人`,
      ok: false,
      reason: 'participant-limit',
    });
  }
  const keys = new Set<string>();
  for (const identity of identities) {
    const valid = validateIdentity(identity);
    if (!valid.ok) {
      return valid;
    }
    const key = identityKey(identity.person.id, identity.positionKey);
    if (keys.has(key)) {
      return Object.freeze({
        message: '人物身份不能重复',
        ok: false,
        reason: 'invalid-identity',
      });
    }
    keys.add(key);
  }
  return Object.freeze({ ok: true });
}

export function createCoStarSelection(
  initial: readonly SelectedIdentity[] = [],
): CoStarSelection {
  const initialValidation = validateSet(initial);
  if (!initialValidation.ok) {
    throw new TypeError(initialValidation.message);
  }
  const identities = ref<readonly SelectedIdentity[]>(
    Object.freeze(initial.map(frozenIdentity)),
  );
  const personOrder = ref<readonly number[]>(
    Object.freeze([
      ...new Set(initial.map((identity) => identity.person.id)),
    ]),
  );
  const limitError = ref<string | null>(null);
  const people = computed<readonly SelectedPerson[]>(() => {
    const groups = new Map<number, SelectedIdentity[]>();
    for (const identity of identities.value) {
      const group = groups.get(identity.person.id);
      if (group) {
        group.push(identity);
      } else {
        groups.set(identity.person.id, [identity]);
      }
    }
    return Object.freeze(
      personOrder.value.flatMap((personId) => {
        const group = groups.get(personId);
        return group
          ? [
              Object.freeze({
                identities: Object.freeze([...group]),
                person: group[0]!.person,
              }),
            ]
          : [];
      }),
    );
  });
  const identityCount = computed(() => identities.value.length);
  const personCount = computed(() => people.value.length);

  function commit(
    next: readonly SelectedIdentity[],
    resetPersonOrder = false,
  ): SelectionResult {
    const result = validateSet(next);
    if (!result.ok) {
      limitError.value = result.message;
      return result;
    }
    const nextPersonIds = [
      ...new Set(next.map((identity) => identity.person.id)),
    ];
    personOrder.value = Object.freeze(
      resetPersonOrder
        ? nextPersonIds
        : [
            ...personOrder.value.filter((personId) =>
              nextPersonIds.includes(personId),
            ),
            ...nextPersonIds.filter(
              (personId) => !personOrder.value.includes(personId),
            ),
          ],
    );
    identities.value = Object.freeze(next.map(frozenIdentity));
    limitError.value = null;
    return Object.freeze({ ok: true });
  }

  function has(personId: number, positionKey: string): boolean {
    const key = identityKey(personId, positionKey);
    return identities.value.some(
      (identity) =>
        identityKey(identity.person.id, identity.positionKey) === key,
    );
  }

  function identitiesFor(personId: number): readonly SelectedIdentity[] {
    return Object.freeze(
      identities.value.filter((identity) => identity.person.id === personId),
    );
  }

  function removeIdentity(personId: number, positionKey: string): void {
    if (!has(personId, positionKey)) {
      return;
    }
    void commit(
      identities.value.filter(
        (identity) =>
          identity.person.id !== personId ||
          identity.positionKey !== positionKey,
      ),
    );
  }

  function removePerson(personId: number): void {
    if (!identities.value.some((identity) => identity.person.id === personId)) {
      return;
    }
    void commit(
      identities.value.filter((identity) => identity.person.id !== personId),
    );
  }

  function toggle(identity: SelectedIdentity): SelectionResult {
    const existing = has(identity.person.id, identity.positionKey);
    if (existing) {
      removeIdentity(identity.person.id, identity.positionKey);
      return Object.freeze({ ok: true });
    }
    return commit([...identities.value, identity]);
  }

  return {
    clear() {
      identities.value = Object.freeze([]);
      personOrder.value = Object.freeze([]);
      limitError.value = null;
    },
    has,
    identities: readonly(identities),
    identitiesFor,
    identityCount,
    limitError: readonly(limitError),
    people,
    personCount,
    removeIdentity,
    removePerson,
    replace(identities) {
      return commit(identities, true);
    },
    toggle,
  };
}

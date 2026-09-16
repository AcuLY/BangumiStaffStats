import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';

import { createDefaultDraft, draftFromEffective, type AppliedQuery } from '../../../src/features/query/model';
import { useQueryStore } from '../../../src/features/query/store';

const unrestricted: AppliedQuery = {
  scope: 'personal', uid: 'luca', subjectType: 'anime', positionScope: 'all', positionKeys: [],
  collectionStatuses: ['wish', 'completed'], includeNSFW: false, mergeSeries: false,
};

beforeEach(() => setActivePinia(createPinia()));

describe('query store unrestricted draft lifecycle', () => {
  it('detects query-scope-only edits independently of the co-star operation scope', () => {
    const store = useQueryStore();
    const legacy = { ...unrestricted };
    delete legacy.positionScope;
    store.replaceDraft(draftFromEffective(legacy));
    store.setCoStarPositionScope('all', true);
    store.commit(legacy, 1, 'all');
    expect(store.dirty).toBe(false);
    expect(store.coStarScopeDirty).toBe(false);

    store.patchDraft({ positionScope: 'all' });
    expect(store.dirty).toBe(true);
    expect(store.coStarScopeDirty).toBe(false);
    expect(store.applied).not.toHaveProperty('positionScope');
    store.restoreDraft();
    expect(store.draft).not.toHaveProperty('positionScope');
    expect(store.coStarPositionScope).toBe('all');
    expect(store.dirty).toBe(false);
  });

  it('preserves unrestricted wish through commit, concrete edit, undo and rollback restore', () => {
    const store = useQueryStore();
    const draft = Object.assign(createDefaultDraft('luca'), {
      positionScope: 'all' as const, collectionStatuses: ['wish', 'completed'] as const,
    });
    store.replaceDraft({ ...draft, collectionStatuses: [...draft.collectionStatuses] });
    store.commit(unrestricted, 3, 'query');
    expect(store.dirty).toBe(false);
    expect(store.applied).toEqual(unrestricted);
    expect(store.coStarPositionScope).toBe('query');

    const concrete = { ...unrestricted, positionKeys: ['staff:anime:2'] };
    delete concrete.positionScope;
    store.replaceDraft(draftFromEffective(concrete));
    store.setCoStarPositionScope('all');
    expect(store.dirty).toBe(true);
    expect(store.coStarScopeDirty).toBe(true);
    store.restoreDraft();
    expect(store.draft.positionScope).toBe('all');
    expect(store.draft.positionKeys).toEqual([]);
    expect(store.draft.collectionStatuses).toEqual(['wish', 'completed']);
    expect(store.coStarPositionScope).toBe('query');
    expect(store.dirty).toBe(false);

    store.commit(concrete, 4, 'all');
    store.restore(unrestricted, 3, 'query');
    store.restoreDraft();
    expect(store.applied).toEqual(unrestricted);
    expect(store.revision).toBe(3);
    expect(store.draft.positionScope).toBe('all');
    expect(store.dirty).toBe(false);
    expect(store.appliedCoStarPositionScope).toBe('query');
  });
});

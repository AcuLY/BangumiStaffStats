import { defineStore } from 'pinia';
import { computed, readonly, ref, shallowRef } from 'vue';

import {
  type AppliedQuery,
  cloneDraft,
  createDefaultDraft,
  draftSemanticSignature,
  draftFromEffective,
  type QueryDraft,
  type QueryFieldErrors,
  type QueryPositionScope,
} from './model';

export const useQueryStore = defineStore('query', () => {
  const draft = ref<QueryDraft>(createDefaultDraft());
  const applied = shallowRef<AppliedQuery | null>(null);
  const revision = ref(0);
  const fieldErrors = shallowRef<QueryFieldErrors>(Object.freeze({}));
  const appliedDraftSignature = ref<string | null>(null);
  const coStarPositionScope = ref<QueryPositionScope>('query');
  const appliedCoStarPositionScope = ref<QueryPositionScope>('query');
  const coStarScopeDirty = computed(
    () => coStarPositionScope.value !== appliedCoStarPositionScope.value,
  );

  const dirty = computed(
    () =>
      appliedDraftSignature.value === null ||
      draftSemanticSignature(draft.value) !== appliedDraftSignature.value,
  );

  function replaceDraft(next: QueryDraft): void {
    draft.value = cloneDraft(next);
    fieldErrors.value = Object.freeze({});
  }

  function patchDraft(patch: Partial<QueryDraft>): void {
    draft.value = {
      ...draft.value,
      ...structuredClone(patch),
    };
    fieldErrors.value = Object.freeze({});
  }

  function setErrors(errors: QueryFieldErrors): void {
    fieldErrors.value = Object.freeze({ ...errors });
  }

  function setCoStarPositionScope(
    scope: QueryPositionScope,
    accept = false,
  ): void {
    coStarPositionScope.value = scope;
    if (accept) {
      appliedCoStarPositionScope.value = scope;
    }
    fieldErrors.value = Object.freeze({});
  }

  function acceptCoStarPositionScope(
    scope: QueryPositionScope,
    draftScopeAtStart?: QueryPositionScope,
  ): void {
    appliedCoStarPositionScope.value = scope;
    if (draftScopeAtStart !== undefined &&
      coStarPositionScope.value === draftScopeAtStart) {
      coStarPositionScope.value = scope;
    }
  }

  function commit(
    query: AppliedQuery,
    nextRevision: number,
    acceptedCoStarScope?: QueryPositionScope,
  ): void {
    applied.value = Object.freeze(structuredClone(query));
    appliedDraftSignature.value = draftSemanticSignature(
      draftFromEffective(query),
    );
    revision.value = nextRevision;
    if (acceptedCoStarScope !== undefined) {
      appliedCoStarPositionScope.value = acceptedCoStarScope;
    }
    fieldErrors.value = Object.freeze({});
  }

  function restore(
    query: AppliedQuery | null,
    priorRevision: number,
    acceptedCoStarScope?: QueryPositionScope,
  ): void {
    applied.value = query ? Object.freeze(structuredClone(query)) : null;
    appliedDraftSignature.value = query
      ? draftSemanticSignature(draftFromEffective(query))
      : null;
    revision.value = priorRevision;
    if (acceptedCoStarScope !== undefined) {
      appliedCoStarPositionScope.value = acceptedCoStarScope;
    }
  }

  function restoreDraft(): void {
    coStarPositionScope.value = appliedCoStarPositionScope.value;
    draft.value = applied.value
      ? draftFromEffective(applied.value)
      : createDefaultDraft(draft.value.uid);
    appliedDraftSignature.value = applied.value
      ? draftSemanticSignature(draft.value)
      : null;
    fieldErrors.value = Object.freeze({});
  }

  return {
    acceptCoStarPositionScope,
    applied: readonly(applied),
    appliedCoStarPositionScope: readonly(appliedCoStarPositionScope),
    coStarPositionScope: readonly(coStarPositionScope),
    coStarScopeDirty,
    commit,
    dirty,
    draft,
    fieldErrors: readonly(fieldErrors),
    patchDraft,
    replaceDraft,
    restore,
    restoreDraft,
    revision: readonly(revision),
    setErrors,
    setCoStarPositionScope,
  };
});

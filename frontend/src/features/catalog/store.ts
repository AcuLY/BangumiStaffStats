import { defineStore } from 'pinia';
import { computed, readonly, ref, shallowRef } from 'vue';

import type { CatalogApi } from '../../api/catalog';
import type {
  CatalogGroup,
  CatalogPosition,
  CatalogSnapshot,
  PositionKey,
  SubjectType,
} from '../../api/adapters/catalog';

export type CatalogPhase = 'error' | 'idle' | 'pending' | 'ready';

function diagnostic(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '职位目录加载已取消';
  }
  return '职位目录暂时无法加载';
}

export const useCatalogStore = defineStore('catalog', () => {
  const phase = ref<CatalogPhase>('idle');
  const snapshot = shallowRef<CatalogSnapshot | null>(null);
  const errorMessage = ref<string | null>(null);
  let sequence = 0;
  let activeController: AbortController | null = null;

  const positions = computed<readonly CatalogPosition[]>(
    () => snapshot.value?.positions ?? [],
  );
  const subjectTypes = computed(
    () => snapshot.value?.subjectTypes ?? [],
  );
  const isReady = computed(() => phase.value === 'ready');

  function position(key: PositionKey): CatalogPosition | undefined {
    return snapshot.value?.positionsByKey.get(key);
  }

  function positionsFor(subjectType: SubjectType): readonly CatalogPosition[] {
    return positions.value.filter(
      (item) => item.subjectType === subjectType && item.selectable,
    );
  }

  function groupsFor(subjectType: SubjectType): readonly CatalogGroup[] {
    return (snapshot.value?.groups ?? []).filter(
      (group) => group.subjectType === subjectType,
    );
  }

  async function load(api: CatalogApi): Promise<boolean> {
    activeController?.abort();
    const controller = new AbortController();
    activeController = controller;
    const requestSequence = ++sequence;
    phase.value = 'pending';
    errorMessage.value = null;

    try {
      const next = await api.load(controller.signal);
      if (requestSequence !== sequence || controller.signal.aborted) {
        return false;
      }
      snapshot.value = next;
      phase.value = 'ready';
      return true;
    } catch (error) {
      if (requestSequence !== sequence) {
        return false;
      }
      if (controller.signal.aborted) {
        if (snapshot.value) {
          phase.value = 'ready';
        } else {
          phase.value = 'idle';
        }
        return false;
      }
      errorMessage.value = diagnostic(error);
      phase.value = 'error';
      return false;
    } finally {
      if (activeController === controller) {
        activeController = null;
      }
    }
  }

  function cancel(): void {
    activeController?.abort();
  }

  return {
    cancel,
    errorMessage: readonly(errorMessage),
    groupsFor,
    isReady,
    load,
    phase: readonly(phase),
    position,
    positions,
    positionsFor,
    snapshot: readonly(snapshot),
    subjectTypes,
  };
});

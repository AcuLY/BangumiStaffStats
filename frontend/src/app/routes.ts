import { ref, readonly, type Ref } from 'vue';

import type { AppliedQuery, QueryMode } from '../features/query/model';
import { readShare, type SharePayload } from '../features/query/share';

export type AppPath = '/co-star' | '/ranking';

function localHistoryHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function modeFor(path: string): QueryMode {
  return path === '/co-star' ? 'co-star' : 'ranking';
}

function pathFor(mode: QueryMode): AppPath {
  return mode === 'co-star' ? '/co-star' : '/ranking';
}

export interface RouteOwner {
  consumeInitialShare(
    replay: (payload: SharePayload) => Promise<boolean>,
  ): Promise<'absent' | 'applied' | 'deferred' | 'invalid'>;
  dispose(): void;
  readonly mode: Readonly<Ref<QueryMode>>;
  navigate(mode: QueryMode): void;
  prefilledUser(): string;
  updateSuccessfulQuery(query: AppliedQuery): void;
}

export function createRouteOwner(target: Window = window): RouteOwner {
  const initial = new URL(target.location.href);
  if (initial.pathname === '/' || initial.pathname === '/index.html') {
    initial.pathname = '/ranking';
    target.history.replaceState({}, '', localHistoryHref(initial));
  }
  const mode = ref<QueryMode>(modeFor(initial.pathname));
  let shareConsumed = false;

  const onPopState = () => {
    mode.value = modeFor(target.location.pathname);
  };
  target.addEventListener('popstate', onPopState);

  function navigate(nextMode: QueryMode): void {
    if (nextMode === mode.value) {
      return;
    }
    const url = new URL(target.location.href);
    url.pathname = pathFor(nextMode);
    target.history.pushState({}, '', localHistoryHref(url));
    mode.value = nextMode;
  }

  function prefilledUser(): string {
    return new URL(target.location.href).searchParams.get('user')?.trim() ?? '';
  }

  function updateSuccessfulQuery(query: AppliedQuery): void {
    const url = new URL(target.location.href);
    url.pathname = pathFor(mode.value);
    if (query.scope === 'personal') {
      url.searchParams.set('user', query.uid);
    } else {
      url.searchParams.delete('user');
    }
    url.hash = '';
    target.history.replaceState({}, '', localHistoryHref(url));
  }

  async function consumeInitialShare(
    replay: (payload: SharePayload) => Promise<boolean>,
  ): Promise<'absent' | 'applied' | 'deferred' | 'invalid'> {
    if (shareConsumed) {
      return 'absent';
    }
    shareConsumed = true;
    const url = new URL(target.location.href);
    if (!url.hash) {
      return 'absent';
    }
    const path = pathFor(mode.value);
    let payload: SharePayload;
    try {
      payload = readShare(path, url.hash);
    } catch {
      const current = new URL(target.location.href);
      current.hash = '';
      target.history.replaceState({}, '', localHistoryHref(current));
      return 'invalid';
    }
    let applied = false;
    try {
      applied = await replay(payload);
    } catch {
      applied = false;
    } finally {
      const current = new URL(target.location.href);
      current.hash = '';
      target.history.replaceState({}, '', localHistoryHref(current));
    }
    return applied ? 'applied' : 'deferred';
  }

  return {
    consumeInitialShare,
    dispose() {
      target.removeEventListener('popstate', onPopState);
    },
    mode: readonly(mode),
    navigate,
    prefilledUser,
    updateSuccessfulQuery,
  };
}

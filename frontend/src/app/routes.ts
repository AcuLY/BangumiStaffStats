import { ref, readonly, type Ref } from 'vue';

import type { AppliedQuery, QueryMode } from '../features/query/model';
import { parsePersonEntry, type PersonEntry } from './personEntry';
import {
  toLogicalAppPath,
  toPublicAppPath,
  type AppPath,
} from '../shared/navigation/basePath';

export type { AppPath } from '../shared/navigation/basePath';

function localHistoryHref(url: URL): string {
  return `${url.pathname}${url.search}${url.hash}`;
}

function modeFor(path: string): QueryMode {
  return toLogicalAppPath(path) === '/co-star' ? 'co-star' : 'ranking';
}

function pathFor(mode: QueryMode): AppPath {
  return mode === 'co-star' ? '/co-star' : '/ranking';
}

export interface RouteOwner {
  readonly personEntry: PersonEntry;
  dispose(): void;
  readonly mode: Readonly<Ref<QueryMode>>;
  navigate(mode: QueryMode): void;
  prefilledUser(): string;
  updateSuccessfulQuery(query: AppliedQuery): void;
}

export function createRouteOwner(target: Window = window): RouteOwner {
  const initial = new URL(target.location.href);
  const initialLogicalPath = toLogicalAppPath(initial.pathname);
  const personEntry = parsePersonEntry(initialLogicalPath, initial.search);
  if (personEntry.kind !== 'none') {
    initial.search = '';
    target.history.replaceState({}, '', localHistoryHref(initial));
  }
  if (
    initialLogicalPath === '/' ||
    initialLogicalPath === '/index.html'
  ) {
    initial.pathname = toPublicAppPath('/ranking');
    target.history.replaceState({}, '', localHistoryHref(initial));
  }
  if (initial.hash) {
    initial.hash = '';
    target.history.replaceState({}, '', localHistoryHref(initial));
  }
  const mode = ref<QueryMode>(modeFor(initial.pathname));

  const onPopState = () => {
    mode.value = modeFor(target.location.pathname);
  };
  target.addEventListener('popstate', onPopState);

  function navigate(nextMode: QueryMode): void {
    if (nextMode === mode.value) {
      return;
    }
    const url = new URL(target.location.href);
    url.pathname = toPublicAppPath(pathFor(nextMode));
    target.history.pushState({}, '', localHistoryHref(url));
    mode.value = nextMode;
  }

  function prefilledUser(): string {
    return new URL(target.location.href).searchParams.get('user')?.trim() ?? '';
  }

  function updateSuccessfulQuery(query: AppliedQuery): void {
    const url = new URL(target.location.href);
    url.pathname = toPublicAppPath(pathFor(mode.value));
    if (query.scope === 'personal') {
      url.searchParams.set('user', query.uid);
    } else {
      url.searchParams.delete('user');
    }
    url.hash = '';
    target.history.replaceState({}, '', localHistoryHref(url));
  }

  return {
    personEntry,
    dispose() {
      target.removeEventListener('popstate', onPopState);
    },
    mode: readonly(mode),
    navigate,
    prefilledUser,
    updateSuccessfulQuery,
  };
}

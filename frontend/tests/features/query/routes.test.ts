import { describe, expect, it, vi } from 'vitest';

import { createRouteOwner } from '../../../src/app/routes';
import type { AppliedQuery } from '../../../src/features/query/model';

const query: AppliedQuery = {
  scope: 'personal', uid: 'luca', collectionStatuses: ['completed'],
  subjectType: 'anime', positionKeys: ['staff:anime:2'],
  includeNSFW: false, mergeSeries: false,
};

describe('route owner', () => {
  it.each(['#q=v1.e30', '#q=v9.invalid', '#anything'])(
    'clears the inert initial fragment %s while preserving user prefill', (fragment) => {
      window.history.replaceState({}, '', `/ranking?user=other${fragment}`);
      const owner = createRouteOwner(window);
      expect(window.location.hash).toBe('');
      expect(owner.prefilledUser()).toBe('other');
      expect(owner.mode.value).toBe('ranking');
      owner.dispose();
    },
  );

  it('normalizes the root and supports mode navigation and browser history', () => {
    window.history.replaceState({}, '', '/?user=luca#q=v1.e30');
    const owner = createRouteOwner(window);
    expect(window.location.pathname).toBe('/ranking');
    expect(window.location.hash).toBe('');
    owner.navigate('co-star');
    expect(owner.mode.value).toBe('co-star');
    expect(window.location.pathname).toBe('/co-star');
    expect(owner.prefilledUser()).toBe('luca');
    window.history.replaceState({}, '', '/ranking?user=luca');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(owner.mode.value).toBe('ranking');
    owner.dispose();
  });

  it('updates personal/global URL without navigating or starting another action', () => {
    window.history.replaceState({}, '', `${window.location.origin}/ranking?user=old`);
    const owner = createRouteOwner(window);
    const replace = vi.spyOn(window.history, 'replaceState');

    owner.updateSuccessfulQuery(query);
    expect(window.location.search).toBe('?user=luca');
    owner.updateSuccessfulQuery({
      scope: 'global',
      subjectType: 'anime',
      positionKeys: ['staff:anime:2'],
      includeNSFW: false,
      mergeSeries: false,
    });
    expect(window.location.search).toBe('');
    expect(replace).toHaveBeenCalledTimes(2);
    owner.dispose();
  });

});

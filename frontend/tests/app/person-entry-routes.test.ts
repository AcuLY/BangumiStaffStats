import { describe, expect, it } from 'vitest';
import { createRouteOwner } from '../../src/app/routes';

describe('restricted person entry route', () => {
  it('captures an entry once before consuming its URL and ordinary navigation', () => {
    window.history.replaceState({}, '', '/ranking?entry=bangumi-person&user=luca&person=42&type=anime#ignored');
    const route = createRouteOwner(window);
    try {
      expect(window.location.search).toBe('');
      expect(window.location.hash).toBe('');
      expect(route.personEntry).toEqual({ kind: 'valid', intent: { uid: 'luca', personId: 42, subjectType: 'anime' } });
      route.navigate('co-star');
      expect(window.location.href).not.toContain('entry=');
      expect(window.location.href).not.toContain('person=');
    } finally { route.dispose(); }
  });
});

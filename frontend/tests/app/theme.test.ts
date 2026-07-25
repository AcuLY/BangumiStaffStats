import { describe, expect, it, vi } from 'vitest';

import {
  createThemeOwner,
  THEME_STORAGE_KEY,
} from '../../src/app/theme';

describe('theme owner', () => {
  it('restores and persists only the versioned light/dark key', () => {
    const storage = {
      getItem: vi.fn(() => 'dark'),
      setItem: vi.fn(),
    };
    const owner = createThemeOwner(document, storage);

    expect(owner.theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    owner.toggle();
    expect(owner.theme.value).toBe('light');
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(storage.setItem).toHaveBeenCalledWith(THEME_STORAGE_KEY, 'light');
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    owner.dispose();
  });

  it('falls back to Light when accessors, reads, or writes throw', () => {
    const accessorFailure = Object.defineProperty({}, 'getItem', {
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    }) as Pick<Storage, 'getItem' | 'setItem'>;
    const accessorOwner = createThemeOwner(document, accessorFailure);
    expect(accessorOwner.theme.value).toBe('light');
    accessorOwner.dispose();

    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
      setItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
    };
    const owner = createThemeOwner(document, storage);
    expect(owner.theme.value).toBe('light');
    expect(() => owner.toggle()).not.toThrow();
    expect(owner.theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    owner.dispose();
  });

  it('maps invalid stored values to Light without a query or URL side effect', () => {
    window.history.replaceState(
      {},
      '',
      `${window.location.origin}/ranking?user=luca`,
    );
    const before = window.location.href;
    const owner = createThemeOwner(document, {
      getItem: () => 'system',
      setItem: () => undefined,
    });
    expect(owner.theme.value).toBe('light');
    owner.toggle();
    expect(window.location.href).toBe(before);
    owner.dispose();
  });
});

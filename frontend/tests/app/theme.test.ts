import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createThemeOwner,
  THEME_STORAGE_KEY,
} from '../../src/app/theme';

const originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');

function createStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) {
    values.set(THEME_STORAGE_KEY, initial);
  }
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    value: () => values.get(THEME_STORAGE_KEY) ?? null,
  };
}

function installSystemTheme(initialDark: boolean) {
  let matches = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    addEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.add(listener);
      },
    ),
    dispatchEvent: vi.fn(() => true),
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    removeEventListener: vi.fn(
      (_type: string, listener: (event: MediaQueryListEvent) => void) => {
        listeners.delete(listener);
      },
    ),
  } as unknown as MediaQueryList;
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn(() => media),
  });
  return {
    listenerCount: () => listeners.size,
    setDark(value: boolean) {
      matches = value;
      const event = { matches: value } as MediaQueryListEvent;
      for (const listener of [...listeners]) {
        listener(event);
      }
    },
  };
}

function dispatchPreference(value: string | null): void {
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: THEME_STORAGE_KEY,
      newValue: value,
    }),
  );
}

beforeEach(() => {
  document.head.innerHTML = '<meta name="theme-color" content="#f4f4f6">';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.removeProperty('color-scheme');
  window.localStorage.clear();
});

afterEach(() => {
  window.localStorage.clear();
  if (originalMatchMedia) {
    Object.defineProperty(window, 'matchMedia', originalMatchMedia);
  } else {
    Reflect.deleteProperty(window, 'matchMedia');
  }
});

describe('theme owner', () => {
  it('initializes from and follows the system without writing a preference', () => {
    const system = installSystemTheme(true);
    const storage = createStorage();
    const owner = createThemeOwner(document, storage);

    expect(owner.theme.value).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta')?.getAttribute('content')).toBe(
      '#0e0e10',
    );
    expect(system.listenerCount()).toBe(1);
    expect(storage.setItem).not.toHaveBeenCalled();

    system.setDark(false);
    expect(owner.theme.value).toBe('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.querySelector('meta')?.getAttribute('content')).toBe(
      '#f4f4f6',
    );
    owner.dispose();
    expect(system.listenerCount()).toBe(0);
  });

  it('restores and retains a valid explicit preference without a timer', () => {
    const system = installSystemTheme(false);
    const storage = createStorage('dark');
    const owner = createThemeOwner(document, storage);

    expect(owner.theme.value).toBe('dark');
    expect(system.listenerCount()).toBe(1);

    system.setDark(true);
    system.setDark(false);
    expect(owner.theme.value).toBe('dark');
    expect(storage.setItem).not.toHaveBeenCalled();
    owner.dispose();
  });

  it('stores an explicit opposite theme then toggles back to auto', () => {
    const system = installSystemTheme(false);
    const storage = createStorage('auto');
    const owner = createThemeOwner(document, storage);

    owner.toggle();
    expect(owner.theme.value).toBe('dark');
    expect(storage.value()).toBe('dark');
    expect(storage.setItem).toHaveBeenLastCalledWith(
      THEME_STORAGE_KEY,
      'dark',
    );

    owner.toggle();
    expect(owner.theme.value).toBe('light');
    expect(storage.value()).toBe('auto');
    expect(storage.setItem).toHaveBeenLastCalledWith(
      THEME_STORAGE_KEY,
      'auto',
    );
    expect(system.listenerCount()).toBe(1);

    system.setDark(true);
    expect(owner.theme.value).toBe('dark');
    owner.dispose();
  });

  it('converges to auto, explicit, and removed preferences from another tab', () => {
    const system = installSystemTheme(false);
    const storage = createStorage();
    const owner = createThemeOwner(document, storage);

    dispatchPreference('light');
    expect(owner.theme.value).toBe('light');

    system.setDark(true);
    expect(owner.theme.value).toBe('light');

    dispatchPreference('auto');
    expect(owner.theme.value).toBe('dark');
    expect(system.listenerCount()).toBe(1);

    system.setDark(false);
    expect(owner.theme.value).toBe('light');

    dispatchPreference(null);
    system.setDark(true);
    expect(owner.theme.value).toBe('dark');
    owner.dispose();
  });

  it('removes an invalid preference and follows the system', () => {
    const system = installSystemTheme(true);
    const storage = createStorage('system');
    const owner = createThemeOwner(document, storage);

    expect(owner.theme.value).toBe('dark');
    expect(storage.removeItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(system.listenerCount()).toBe(1);
    owner.dispose();
  });

  it('fails safely when storage and matchMedia are unavailable', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    const storage = {
      getItem: vi.fn(() => {
        throw new DOMException('blocked', 'SecurityError');
      }),
      removeItem: vi.fn(() => {
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
    expect(() => owner.toggle()).not.toThrow();
    expect(owner.theme.value).toBe('light');
    owner.dispose();
  });

  it('keeps theme state out of the URL and ignores superseded keys', () => {
    const system = installSystemTheme(false);
    const storage = createStorage();
    window.history.replaceState({}, '', '/ranking?user=luca');
    window.localStorage.setItem('bgmss-theme-v1', 'dark');
    window.localStorage.setItem(
      'bgmss-theme-override-v2',
      JSON.stringify({ expiresAt: Date.now() + 86_400_000, theme: 'dark' }),
    );
    const before = window.location.href;
    const owner = createThemeOwner(document, storage);

    expect(owner.theme.value).toBe('light');
    owner.toggle();
    expect(window.location.href).toBe(before);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(THEME_STORAGE_KEY);
    expect(storage.getItem).not.toHaveBeenCalledWith('bgmss-theme-v1');
    expect(storage.getItem).not.toHaveBeenCalledWith(
      'bgmss-theme-override-v2',
    );
    expect(system.listenerCount()).toBe(1);
    owner.dispose();
  });

  it('ignores media and storage changes after disposal', () => {
    const system = installSystemTheme(false);
    const owner = createThemeOwner(document, createStorage());

    expect(owner.theme.value).toBe('light');
    owner.dispose();
    expect(system.listenerCount()).toBe(0);
    expect(document.documentElement.dataset.theme).toBeUndefined();

    system.setDark(true);
    dispatchPreference('dark');
    expect(owner.theme.value).toBe('light');
  });
});

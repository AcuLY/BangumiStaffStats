import { readonly, ref, type Ref } from 'vue';
import brandMarkDark from '../assets/brand/bgmss-dark.svg?no-inline';
import brandMarkLight from '../assets/brand/bgmss-light.svg?no-inline';

export type AppTheme = 'dark' | 'light';
type ThemePreference = AppTheme | 'auto';

export const THEME_STORAGE_KEY = 'bgmss-theme-preference-v3';

type ThemeStorage = Pick<Storage, 'getItem' | 'removeItem' | 'setItem'>;

function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'auto' || value === 'dark' || value === 'light';
}

function removeStoredPreference(storage: ThemeStorage | undefined): void {
  try {
    storage?.removeItem(THEME_STORAGE_KEY);
  } catch {
    // System following remains usable when storage is unavailable.
  }
}

function storedPreference(storage: ThemeStorage | undefined): ThemePreference {
  if (!storage) {
    return 'auto';
  }
  let raw: string | null;
  try {
    raw = storage.getItem(THEME_STORAGE_KEY);
  } catch {
    return 'auto';
  }
  if (raw === null) {
    return 'auto';
  }
  if (!isThemePreference(raw)) {
    removeStoredPreference(storage);
    return 'auto';
  }
  return raw;
}

function systemTheme(media: MediaQueryList | null): AppTheme {
  return media?.matches ? 'dark' : 'light';
}

export interface ThemeOwner {
  apply(): void;
  dispose(): void;
  readonly theme: Readonly<Ref<AppTheme>>;
  toggle(): void;
}

export function createThemeOwner(
  target: Document = document,
  suppliedStorage?: ThemeStorage,
): ThemeOwner {
  const targetWindow = target.defaultView;
  let storage = suppliedStorage;
  if (!storage) {
    try {
      storage = targetWindow?.localStorage;
    } catch {
      storage = undefined;
    }
  }

  let media: MediaQueryList | null = null;
  if (typeof targetWindow?.matchMedia === 'function') {
    try {
      media = targetWindow.matchMedia('(prefers-color-scheme: dark)');
    } catch {
      media = null;
    }
  }

  let preference = storedPreference(storage);
  const theme = ref<AppTheme>(
    preference === 'auto' ? systemTheme(media) : preference,
  );
  let disposed = false;
  let mediaListening = false;
  let storageListening = false;

  function apply(): void {
    target.documentElement.dataset.theme = theme.value;
    target.documentElement.style.colorScheme = theme.value;
    target.querySelector<HTMLLinkElement>('link[rel="icon"]')
      ?.setAttribute('href', theme.value === 'dark' ? brandMarkDark : brandMarkLight);
    target
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme.value === 'dark' ? '#0e0e10' : '#f4f4f6');
  }

  function onSystemThemeChange(event: MediaQueryListEvent): void {
    if (disposed || preference !== 'auto') {
      return;
    }
    theme.value = event.matches ? 'dark' : 'light';
    apply();
  }

  function startSystemListening(): void {
    if (!media || mediaListening || disposed) {
      return;
    }
    try {
      media.addEventListener('change', onSystemThemeChange);
      mediaListening = true;
    } catch {
      mediaListening = false;
    }
  }

  function stopSystemListening(): void {
    if (!media || !mediaListening) {
      return;
    }
    try {
      media.removeEventListener('change', onSystemThemeChange);
    } catch {
      // Disposal still prevents the retained callback from changing state.
    }
    mediaListening = false;
  }

  function setPreference(
    nextPreference: ThemePreference,
    persist: boolean,
  ): void {
    if (disposed) {
      return;
    }
    preference = nextPreference;
    theme.value =
      nextPreference === 'auto' ? systemTheme(media) : nextPreference;
    apply();
    if (!persist) {
      return;
    }
    try {
      storage?.setItem(THEME_STORAGE_KEY, nextPreference);
    } catch {
      // The in-memory preference remains usable.
    }
  }

  function onStorageChange(event: StorageEvent): void {
    if (disposed || event.key !== THEME_STORAGE_KEY) {
      return;
    }
    if (event.newValue === null) {
      setPreference('auto', false);
    } else if (isThemePreference(event.newValue)) {
      setPreference(event.newValue, false);
    } else {
      removeStoredPreference(storage);
      setPreference('auto', false);
    }
  }

  function startStorageListening(): void {
    if (!targetWindow || storageListening || disposed) {
      return;
    }
    try {
      targetWindow.addEventListener('storage', onStorageChange);
      storageListening = true;
    } catch {
      storageListening = false;
    }
  }

  function stopStorageListening(): void {
    if (!targetWindow || !storageListening) {
      return;
    }
    try {
      targetWindow.removeEventListener('storage', onStorageChange);
    } catch {
      // Disposal still prevents the retained callback from changing state.
    }
    storageListening = false;
  }

  apply();
  startSystemListening();
  startStorageListening();

  return {
    apply,
    dispose() {
      disposed = true;
      stopSystemListening();
      stopStorageListening();
      target.documentElement.removeAttribute('data-theme');
      target.documentElement.style.removeProperty('color-scheme');
    },
    theme: readonly(theme),
    toggle() {
      const nextTheme = theme.value === 'dark' ? 'light' : 'dark';
      setPreference(
        nextTheme === systemTheme(media) ? 'auto' : nextTheme,
        true,
      );
    },
  };
}

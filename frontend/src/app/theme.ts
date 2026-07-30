import { readonly, ref, type Ref } from 'vue';

export type AppTheme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'bgmss-theme-v1';

function storedTheme(storage: Pick<Storage, 'getItem'> | undefined): AppTheme {
  if (!storage) {
    return 'light';
  }
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : 'light';
  } catch {
    return 'light';
  }
}

export interface ThemeOwner {
  apply(): void;
  dispose(): void;
  readonly theme: Readonly<Ref<AppTheme>>;
  toggle(): void;
}

export function createThemeOwner(
  target: Document = document,
  suppliedStorage?: Pick<Storage, 'getItem' | 'setItem'>,
): ThemeOwner {
  let storage = suppliedStorage;
  if (!storage) {
    try {
      storage = target.defaultView?.localStorage;
    } catch {
      storage = undefined;
    }
  }
  const theme = ref<AppTheme>(storedTheme(storage));

  function apply(): void {
    target.documentElement.dataset.theme = theme.value;
    target.documentElement.style.colorScheme = theme.value;
    target
      .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
      ?.setAttribute('content', theme.value === 'dark' ? '#0e0e10' : '#f4f4f6');
  }

  function toggle(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark';
    apply();
    try {
      storage?.setItem(THEME_STORAGE_KEY, theme.value);
    } catch {
      // The in-memory theme remains usable when storage is unavailable.
    }
  }

  apply();

  return {
    apply,
    dispose() {
      target.documentElement.removeAttribute('data-theme');
      target.documentElement.style.removeProperty('color-scheme');
    },
    theme: readonly(theme),
    toggle,
  };
}

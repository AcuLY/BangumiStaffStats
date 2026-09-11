export interface BilingualNameSource {
  readonly name?: string | null;
  readonly nameCN?: string | null;
}

export interface BilingualNamePair {
  readonly primary: string;
  readonly secondary: string;
}

function present(value: string | null | undefined): string | null {
  return value?.trim() ? value : null;
}

export function resolveBilingualName(
  source: BilingualNameSource,
): BilingualNamePair {
  const chinese = present(source.nameCN);
  const original = present(source.name);
  const available = chinese ?? original ?? '—';

  return Object.freeze({
    primary: chinese ?? available,
    secondary: original ?? available,
  });
}

export function bilingualNameTitle(source: BilingualNameSource): string {
  const names = resolveBilingualName(source);
  return `${names.primary}\n${names.secondary}`;
}

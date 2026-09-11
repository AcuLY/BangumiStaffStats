/** Only adjust whitespace supplied by a UI separator, never the source labels. */
export function displaySeparator(left: string, right: string, separator: string): string {
  let result = separator;
  if (/[（）]$/u.test(left)) result = result.replace(/^\s+/u, '');
  if (/^[（）]/u.test(right)) result = result.replace(/\s+$/u, '');
  return result;
}

export function joinDisplayText(parts: readonly string[], separator: string): string {
  return parts.reduce((result, part, index) => index === 0
    ? part
    : result + displaySeparator(parts[index - 1]!, part, separator) + part, '');
}

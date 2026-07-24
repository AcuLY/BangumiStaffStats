import { afterEach, vi } from 'vitest';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.title = '';
});

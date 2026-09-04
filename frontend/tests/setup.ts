import { afterEach, beforeEach, vi } from 'vitest';

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  document.title = '';
});

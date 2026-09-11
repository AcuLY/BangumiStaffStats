import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const baseCss = fs.readFileSync(
  path.join(frontendRoot, 'src/shared/styles/base.css'),
  'utf8',
);

describe('app shell layout', () => {
  it('keeps the short-page footer at the viewport edge in normal flow', () => {
    expect(baseCss).toMatch(
      /\.app-shell\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;/s,
    );
    expect(baseCss).toMatch(
      /\.app-page-content\s*\{[^}]*display:\s*flex;[^}]*min-height:\s*100%;[^}]*flex-direction:\s*column;/s,
    );
    expect(baseCss).toMatch(
      /\.app-footer\s*\{[^}]*margin-top:\s*auto;/s,
    );
    expect(baseCss).not.toMatch(
      /\.app-footer\s*\{[^}]*(?:position:\s*(?:fixed|sticky)|inset(?:-block)?(?:-end)?:)/s,
    );
  });
});

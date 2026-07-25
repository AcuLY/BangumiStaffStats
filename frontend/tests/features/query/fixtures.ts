import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  decodeCatalogEnvelope,
  type CatalogSnapshot,
} from '../../../src/api/adapters/catalog';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

export function catalogFixture(): CatalogSnapshot {
  const fixture = JSON.parse(
    fs.readFileSync(
      path.join(
        repositoryRoot,
        'contracts/goldens/api/catalog/cases/success-empty.json',
      ),
      'utf8',
    ),
  ) as { expected: { body: unknown } };
  return decodeCatalogEnvelope(fixture.expected.body);
}

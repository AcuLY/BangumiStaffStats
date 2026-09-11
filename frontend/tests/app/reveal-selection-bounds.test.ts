import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  createCoStarSelection,
  MAX_SELECTED_IDENTITIES,
} from '../../src/features/co-star/selection';
import type { SelectedIdentity } from '../../src/features/co-star/model';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../..',
);
const appSource = fs.readFileSync(
  path.join(repositoryRoot, 'frontend/src/app/App.vue'),
  'utf8',
);

interface Candidate {
  readonly personId: number;
  readonly positionKeys: readonly string[];
}

function candidate(personId: number, identityCount: number): Candidate {
  return Object.freeze({
    personId,
    positionKeys: Object.freeze(
      Array.from(
        { length: identityCount },
        (_, index) => `staff:anime:${personId}-${index + 1}`,
      ),
    ),
  });
}

function identities(candidateItem: Candidate): readonly SelectedIdentity[] {
  return candidateItem.positionKeys.map((positionKey) =>
    Object.freeze({
      person: Object.freeze({
        id: candidateItem.personId,
        name: `Person ${candidateItem.personId}`,
        nameCN: null,
      }),
      positionKey,
      positionLabel: positionKey,
    }),
  );
}

describe('reveal focus and default candidate bounds', () => {
  it('does not blur the query workspace when attention expires', () => {
    const source = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/QueryWorkspace.vue',
      ),
      'utf8',
    );
    const clearAttention = source.slice(
      source.indexOf('function clearAttention(): void {'),
      source.indexOf('function revealWorkspace(): void {'),
    );

    expect(clearAttention).not.toContain('.blur(');
    expect(clearAttention).not.toContain('activeElement');
  });

  it('greedily skips whole candidates that would exceed the identity bound', () => {
    const boundedHelper = appSource.slice(
      appSource.indexOf('function collectBoundedCandidateIdentities('),
      appSource.indexOf('function activateDefaultCandidates(): void {'),
    );
    const activation = appSource.slice(
      appSource.indexOf('function activateDefaultCandidates(): void {'),
      appSource.indexOf('function shareCandidateInput('),
    );

    expect(boundedHelper).toMatch(/for \(const item of items\)/);
    expect(boundedHelper).toMatch(/selectedPeople >= 1/);
    expect(boundedHelper).toMatch(
      /identities\.length \+ itemIdentities\.length > MAX_SELECTED_IDENTITIES/,
    );
    expect(boundedHelper).toMatch(/continue;/);
    expect(boundedHelper).toMatch(/identities\.push\(\.\.\.itemIdentities\)/);
    expect(activation).toContain(
      'collectBoundedCandidateIdentities(payload.items)',
    );
    expect(activation).not.toContain('.slice(0, 2)');

    const defaults = identities(candidate(1, 11));

    const selection = createCoStarSelection();
    expect(selection.replace(defaults)).toEqual({ ok: true });
    expect(selection.identityCount.value).toBe(11);
    expect(selection.people.value.map((person) => person.person.id)).toEqual([
      1,
    ]);
    expect(selection.limitError.value).toBeNull();
  });

  it('skips an individually oversized candidate without publishing an error', () => {
    const boundedHelper = appSource.slice(
      appSource.indexOf('function collectBoundedCandidateIdentities('),
      appSource.indexOf('function activateDefaultCandidates(): void {'),
    );
    expect(boundedHelper).toMatch(
      /itemIdentities\.length === 0 \|\|[\s\S]*?MAX_SELECTED_IDENTITIES[\s\S]*?continue;/,
    );

    const defaults = identities(candidate(2, MAX_SELECTED_IDENTITIES));
    const selection = createCoStarSelection();

    expect(selection.replace(defaults)).toEqual({ ok: true });
    expect(selection.people.value.map((person) => person.person.id)).toEqual([2]);
    expect(selection.identityCount.value).toBe(MAX_SELECTED_IDENTITIES);
    expect(selection.limitError.value).toBeNull();
  });
});

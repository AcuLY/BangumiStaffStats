import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
const sourceRoot = path.join(frontendRoot, 'src');

function listFiles(directory: string, extension: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(absolutePath, extension);
    return entry.isFile() && entry.name.endsWith(extension)
      ? [absolutePath]
      : [];
  });
}

function read(relativePath: string): string {
  return fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');
}

const vueFiles = listFiles(sourceRoot, '.vue');
const css = listFiles(sourceRoot, '.css')
  .map((filePath) => fs.readFileSync(filePath, 'utf8'))
  .join('\n');
const baseCss = read('src/shared/styles/base.css');
const themeOverrides = read('src/app/themeOverrides.ts');
const architectureCheck = read('scripts/check-architecture.mjs');

describe('Naive UI Skeleton ownership', () => {
  it('marks every NSkeleton instance with the app-owned motion class', () => {
    const skeletonTags = vueFiles.flatMap((filePath) => {
      const source = fs.readFileSync(filePath, 'utf8');
      return source.match(/<n-skeleton\b[\s\S]*?\/>/g) ?? [];
    });

    expect(skeletonTags.length).toBeGreaterThan(0);
    for (const tag of skeletonTags) {
      expect(tag).toMatch(/\bclass="[^"]*\bapp-skeleton\b[^"]*"/);
    }
  });

  it('uses NSkeleton for every former custom loading surface', () => {
    const expectations: Array<[string, RegExp]> = [
      ['src/features/ranking/components/RankingResults.vue', /<ranking-results-skeleton[\s\S]*?<ranking-list-skeleton/],
      ['src/features/ranking/components/RankingListSkeleton.vue', /<n-skeleton/],
      ['src/features/person-detail/components/PersonInspector.vue', /<person-detail-skeleton/],
      ['src/features/person-detail/components/PersonDetailSkeleton.vue', /<n-skeleton/],
      ['src/features/person-detail/components/PersonItemBrowser.vue', /<work-cards-skeleton/],
      ['src/shared/components/WorkCardsSkeleton.vue', /<n-skeleton/],
      ['src/features/co-star/components/CandidatePicker.vue', /<candidate-rows-skeleton/],
      ['src/features/co-star/components/PartnersSurface.vue', /<partners-skeleton/],
      ['src/features/co-star/components/CoStarSurface.vue', /<co-star-analysis-skeleton/],
      ['src/features/co-star/components/CoStarWorkBrowser.vue', /<work-cards-skeleton/],
      ['src/shared/components/SafeImage.vue', /<n-skeleton[\s\S]*?v-if="state === 'loading'"/],
    ];

    for (const [relativePath, pattern] of expectations) {
      expect(read(relativePath)).toMatch(pattern);
    }
  });

  it('removes the custom shimmer material and centralizes reduced motion', () => {
    expect(css).not.toContain('ranking-shimmer');
    expect(baseCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.app-skeleton\.app-skeleton\s*\{\s*animation:\s*none;/,
    );
  });

  it('keeps Naive UI theme overrides as the color and radius owner', () => {
    expect(themeOverrides).toMatch(
      /Skeleton:\s*\{[\s\S]*?borderRadius:[\s\S]*?color:[\s\S]*?colorEnd:/,
    );
  });

  it('registers the focused ownership test in the persistent inventory', () => {
    expect(architectureCheck).toContain(
      "'tests/shared/skeleton-system.test.ts',",
    );
  });
});

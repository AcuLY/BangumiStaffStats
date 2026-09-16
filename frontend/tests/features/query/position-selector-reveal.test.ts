import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { mount } from '@vue/test-utils';
import { NDynamicInput, NPopover } from 'naive-ui';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  CatalogGroup,
  CatalogPosition,
} from '../../../src/api/adapters/catalog';
import PositionSelector from '../../../src/features/query/components/PositionSelector.vue';

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
);

const positions: readonly CatalogPosition[] = [
  {
    capabilities: ['rankings', 'candidates'],
    categories: ['director'],
    displayOrder: 10,
    key: 'staff:anime:2',
    kind: 'staff',
    label: '导演',
    names: { cn: '导演', en: 'Director', jp: '監督' },
    selectable: true,
    subjectType: 'anime',
  },
];

const groups: readonly CatalogGroup[] = [
  {
    displayOrder: 10,
    key: 'shortcut:anime:featured',
    kind: 'shortcut',
    label: '常用职位',
    positionKeys: ['staff:anime:2'],
    subjectType: 'anime',
  },
];

const originalMatchMedia = Object.getOwnPropertyDescriptor(
  window,
  'matchMedia',
);
const originalScrollIntoView = Object.getOwnPropertyDescriptor(
  Element.prototype,
  'scrollIntoView',
);

function installMedia(options: {
  compact: boolean;
  reducedMotion?: boolean;
}) {
  let compact = options.compact;
  const compactListeners = new Set<
    (event: MediaQueryListEvent) => void
  >();
  const compactMedia = {
    addEventListener(
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      if (type === 'change') {
        compactListeners.add(listener);
      }
    },
    dispatchEvent: vi.fn(() => true),
    get matches() {
      return compact;
    },
    media: '(width < 780px)',
    onchange: null,
    removeEventListener(
      type: string,
      listener: (event: MediaQueryListEvent) => void,
    ) {
      if (type === 'change') {
        compactListeners.delete(listener);
      }
    },
  } as unknown as MediaQueryList;
  const reducedMedia = {
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(() => true),
    matches: options.reducedMotion ?? false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    removeEventListener: vi.fn(),
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn((query: string) =>
      query === '(width < 780px)' ? compactMedia : reducedMedia,
    ),
  });

  return {
    setCompact(matches: boolean) {
      compact = matches;
      const event = { matches, media: compactMedia.media } as MediaQueryListEvent;
      for (const listener of compactListeners) {
        listener(event);
      }
    },
  };
}

function mountSelector() {
  return mount(PositionSelector, {
    attachTo: document.body,
    global: { stubs: { teleport: true } },
    props: {
      controlSize: 'small',
      groups,
      modelValue: [],
      phase: 'ready',
      placeholder: '选择职位',
      positions,
    },
  });
}

describe('PositionSelector compact reveal and breakpoint ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
    if (originalScrollIntoView) {
      Object.defineProperty(
        Element.prototype,
        'scrollIntoView',
        originalScrollIntoView,
      );
    } else {
      Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
    }
  });

  it('keeps one portal owner with 28px visible and 44px effective compact geometry', () => {
    const selectorSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/PositionSelector.vue',
      ),
      'utf8',
    );
    const browserSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/PositionCatalogBrowser.vue',
      ),
      'utf8',
    );
    const baseCss = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/shared/styles/base.css',
      ),
      'utf8',
    );
    const editorSource = fs.readFileSync(
      path.join(
        repositoryRoot,
        'frontend/src/features/query/components/QueryEditor.vue',
      ),
      'utf8',
    );

    expect(selectorSource.match(/<n-popover\b/g)).toHaveLength(1);
    expect(selectorSource).toContain('<n-dynamic-input');
    expect(selectorSource).toContain(':min="1"');
    expect(selectorSource).toContain('key-field="id"');
    expect(selectorSource).not.toContain('width="trigger"');
    expect(selectorSource).toContain(
      'max-width: min(480px, calc(100dvw - var(--scrollbar-shell-size) - 24px))',
    );
    expect(selectorSource).toMatch(
      /:item-style="\{[\s\S]*?alignItems:\s*'center',[\s\S]*?display:\s*'flex',[\s\S]*?justifyContent:\s*'flex-start',[\s\S]*?\}"/,
    );
    expect(selectorSource).not.toContain('<n-tag');
    const actionButtons =
      selectorSource.match(
        /<n-button\s+class="position-selector__action-button"[\s\S]*?<\/n-button>/g,
      ) ?? [];
    expect(actionButtons).toHaveLength(2);
    for (const actionButton of actionButtons) {
      expect(actionButton).not.toMatch(
        /\ssecondary\s|\squaternary\s|\scircle\s/,
      );
    }
    expect(editorSource).toContain("const positionStageTitle = '职位';");
    expect(editorSource).toContain(
      '仅统计同时具备全部已选职位的人物；参与作品按已选职位合并并去重',
    );
    expect(editorSource).toContain(
      '选择“全部”可从所有可用职位中选择人物；选择具体职位用于确定初始候选人物；实际参与身份在“已选人物”中管理',
    );
    expect(editorSource).not.toContain('query-position-hint');
    expect(editorSource).not.toContain('可多选；');
    expect(editorSource).toContain('placeholder="选择职位"');
    expect(editorSource).not.toMatch(/排行职位|参与职位|选择排行职位|选择参与职位/);
    expect(selectorSource).toMatch(
      /@media \(width < 780px\)[\s\S]*?\.position-selector__control::before[\s\S]*?inset-block:\s*-8px;[\s\S]*?\.position-selector__control\.is-small[\s\S]*?min-height:\s*28px;/,
    );
    expect(selectorSource).not.toMatch(/\s:flip="false"/u);
    expect(selectorSource).not.toContain('position-selector__filter');
    expect(browserSource).toMatch(
      /\.position-catalog-browser\.is-compact\s*\{[^}]*--position-catalog-list-height:\s*212\.8px;/,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser\s*\{[^}]*overflow:\s*hidden;[^}]*padding:\s*4px;/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser\s*\{[^}]*width:\s*min\([\s\S]*?30rem,[\s\S]*?calc\(100dvw - var\(--scrollbar-shell-size\) - 24px\)[\s\S]*?\);[^}]*max-width:\s*calc\([\s\S]*?100dvw - var\(--scrollbar-shell-size\) - 24px[\s\S]*?\);/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser__list\s*\{[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;/s,
    );
    expect(selectorSource).not.toContain(
      '.position-selector__toggle:focus-visible',
    );
    expect(selectorSource).toContain(
      '<query-icon name="chevron" :size="16" />',
    );
    expect(selectorSource).toMatch(
      /\.position-selector__control\s*\{[^}]*border:\s*1px solid var\(--control-outline\);[^}]*background:\s*var\(--control-background\);/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__selected-label\s*\{[^}]*color:\s*var\(--control-text\);[^}]*line-height:\s*21px;/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__selected-label\.is-placeholder\s*\{[^}]*color:\s*var\(--control-placeholder\);/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__toggle\s*\{[^}]*color:\s*var\(--control-placeholder\);[^}]*background:\s*transparent;/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__toggle::before,[\s\S]*?\.position-selector__action-button::before\s*\{[^}]*height:\s*var\(--touch-target\);[^}]*transform:\s*translate\(-50%, -50%\);/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__toggle::before\s*\{[^}]*width:\s*100%;/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__action-button::before\s*\{[^}]*width:\s*100%;/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__actions\s*\{[^}]*--position-selector-action-size:\s*34px;[^}]*min-width:\s*0;[^}]*flex:\s*0 0 auto;[^}]*gap:\s*var\(--space-2\);[^}]*margin-left:\s*var\(--space-2\);/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__actions\.is-small\s*\{[^}]*--position-selector-action-size:\s*28px;/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__action-slot\s*\{[^}]*width:\s*var\(--position-selector-action-size\);[^}]*height:\s*var\(--touch-target\);/s,
    );
    expect(selectorSource).toMatch(
      /\.position-selector__action-button\s*\{[^}]*width:\s*var\(--position-selector-action-size\);[^}]*padding-inline:\s*0;/s,
    );
    expect(selectorSource).toMatch(
      /@media \(width < 780px\)\s*\{[\s\S]*?\.position-selector__dynamic-input\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);[^}]*align-items:\s*start;[^}]*column-gap:\s*var\(--space-3\);/s,
    );
    expect(selectorSource).toMatch(
      /@media \(max-width: 520px\)\s*\{[\s\S]*?\.position-selector__dynamic-input\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\);/s,
    );
    expect(selectorSource).not.toContain('border-left: 1px solid var(--divider)');
    expect(selectorSource).not.toContain(
      '.position-selector__toggle:hover:not(:disabled)',
    );
    expect(baseCss).toMatch(
      /:root\s*\{[^}]*--control-background:\s*rgb\(255 255 255\);[^}]*--control-text:\s*rgb\(51 54 57\);[^}]*--control-placeholder:\s*rgb\(194 194 194\);[^}]*--control-outline:\s*rgb\(224 224 230\);/s,
    );
    expect(baseCss).toMatch(
      /:root\[data-theme="dark"\]\s*\{[^}]*--control-background:\s*rgb\(255 255 255 \/ 10%\);[^}]*--control-text:\s*rgb\(255 255 255 \/ 82%\);[^}]*--control-placeholder:\s*rgb\(255 255 255 \/ 38%\);[^}]*--control-outline:\s*transparent;/s,
    );
    expect(baseCss).toMatch(
      /\.query-stage--positions \.field--positions\s*\{[^}]*padding-right:\s*0;/s,
    );
    expect(selectorSource).toMatch(
      /catalogPopoverThemeOverrides\s*=\s*Object\.freeze\(\{[^}]*boxShadow:\s*'none'/s,
    );
    expect(selectorSource).toContain(
      ':theme-overrides="catalogPopoverThemeOverrides"',
    );
    expect(browserSource).not.toContain('is-attention');
    expect(browserSource).not.toContain('outline: 2px solid var(--focus)');
    expect(browserSource).toMatch(
      /\.position-catalog-browser\s*\{[^}]*border:\s*0;[^}]*border-radius:\s*var\(--radius-control\);[^}]*box-shadow:/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser\.is-compact\s*\{[^}]*--position-catalog-option-height:\s*28px;/,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser__group-button\s*\{[^}]*height:\s*auto;[^}]*min-height:\s*calc\(var\(--position-catalog-option-height\) \+ 8px\);[^}]*padding:\s*4px 12px;[^}]*line-height:\s*21px;/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser__group-label\s*\{[^}]*color:\s*var\(--text-primary\);/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser__position\s*\{[^}]*min-height:\s*var\(--position-catalog-option-height\);[^}]*padding:\s*0 12px;[^}]*line-height:\s*21px;/s,
    );
    expect(browserSource).toMatch(
      /\.position-catalog-browser__group-button::before,[\s\S]*?\.position-catalog-browser__position::before\s*\{[^}]*inset:\s*0 4px;[^}]*border-radius:\s*var\(--radius-control\);[^}]*transition:\s*background-color 300ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s,
    );
    expect(browserSource).toMatch(
      /:global\(:root\[data-theme='dark'\] \.position-catalog-browser\)\s*\{[^}]*--position-catalog-option-pending:\s*rgb\(255 255 255 \/ 9%\);/s,
    );
    const selectedRule = browserSource.match(
      /\.position-catalog-browser__position\.is-selected\s*\{([^}]*)\}/,
    )?.[1];
    expect(selectedRule).toContain('color: var(--brand);');
    expect(selectedRule).not.toMatch(/background|font-weight/);
    expect(browserSource).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.position-catalog-browser__position::before\s*\{[^}]*transition:\s*none;/s,
    );
  });

  it('opens from the arrow with one trigger focus state and no menu attention border', async () => {
    installMedia({ compact: true, reducedMotion: true });
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const wrapper = mountSelector();
    await nextTick();

    expect(wrapper.getComponent(NDynamicInput).props('min')).toBe(1);
    expect(wrapper.findComponent(NPopover).exists()).toBe(true);
    const toggle = wrapper.get<HTMLButtonElement>(
      '.position-selector__toggle',
    );
    toggle.element.focus();
    toggle.element.dispatchEvent(
      new MouseEvent('click', { bubbles: true, detail: 1 }),
    );
    await nextTick();
    await nextTick();

    const dialog = wrapper.get('#query-position-catalog-browser');
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(wrapper.getComponent(NPopover).props()).toMatchObject({
      placement: 'bottom-start',
      flip: true,
      show: true,
      to: 'body',
    });
    expect(wrapper.getComponent(NPopover).props('width')).toBeUndefined();
    expect(dialog.classes()).not.toContain('is-attention');
    expect(document.activeElement).toBe(toggle.element);
    wrapper.unmount();
  });

  it.each([true, false])('keeps selection out of text inputs and searches only in the panel (compact=%s)', async (compact) => {
    installMedia({ compact });
    const wrapper = mountSelector();
    await nextTick();
    const toggle = wrapper.get<HTMLButtonElement>('.position-selector__toggle');
    expect(wrapper.find('.position-selector__filter').exists()).toBe(false);
    toggle.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(toggle.element);
    const search = wrapper.get<HTMLInputElement>('[aria-label="搜索职位"]');
    search.element.focus();
    await search.setValue('missing');
    expect(wrapper.findAll('[data-position-key]')).toHaveLength(0);
    await search.setValue('Director');
    expect(wrapper.findAll('[data-position-key="staff:anime:2"]')).toHaveLength(1);
    await wrapper.get('[data-position-key="staff:anime:2"]').trigger('click');
    await nextTick();
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([['staff:anime:2']]);
    expect(document.activeElement).toBe(toggle.element);
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false);
    await toggle.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();
    expect(wrapper.get<HTMLInputElement>('[aria-label="搜索职位"]').element.value).toBe('');
    await wrapper.get('[aria-label="搜索职位"]').trigger('keydown', { key: 'Escape' });
    await nextTick();
    expect(document.activeElement).toBe(toggle.element);
    expect(wrapper.getComponent(NPopover).props('show')).toBe(false);
    wrapper.unmount();
  });

  it.each([true, false])('reuses native All keyboard, pointer, Escape and breakpoint focus for 不限 (compact=%s)', async compact => {
    const media = installMedia({ compact });
    const wrapper = mountSelector();
    await wrapper.setProps({ allowAll: true, allLabel: '不限', allSelected: true });
    try {
      const toggle = wrapper.get<HTMLButtonElement>('.position-selector__toggle');
      expect(toggle.text()).toBe('不限');
      expect(toggle.attributes('aria-label')).toBe('第 1 个职位，当前为不限');
      toggle.element.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await nextTick();
      await nextTick();
      expect(document.activeElement).toBe(toggle.element);
      expect(wrapper.getComponent(NPopover).props()).toMatchObject({ placement: 'bottom-start', to: 'body', raw: true });
      expect(wrapper.get('#query-position-catalog-browser').classes().includes('is-compact')).toBe(compact);
      await wrapper.get('[aria-label="搜索职位"]').trigger('keydown', { key: 'Escape' });
      await nextTick();
      expect(document.activeElement).toBe(toggle.element);
      expect(toggle.attributes('aria-expanded')).toBe('false');
      await toggle.trigger('keydown', { key: 'ArrowDown' });
      await nextTick();
      const all = wrapper.get<HTMLButtonElement>('[data-position-all]');
      expect(all.text()).toBe('不限');
      expect(document.activeElement).toBe(all.element);
      await all.trigger('click');
      await nextTick();
      expect(document.activeElement).toBe(toggle.element);
      expect(wrapper.emitted('update:allSelected')?.at(-1)).toEqual([true]);
      await toggle.trigger('keydown', { key: 'ArrowDown' });
      await nextTick();
      media.setCompact(!compact);
      await nextTick();
      await nextTick();
      expect(document.activeElement).toBe(toggle.element);
      expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(false);
      await wrapper.setProps({ disabled: true });
      await toggle.trigger('keydown', { key: 'ArrowDown' });
      expect(wrapper.find('#query-position-catalog-browser').exists()).toBe(false);
    } finally { wrapper.unmount(); }
  });

  it('moves compact keyboard activation to the first catalog category', async () => {
    installMedia({ compact: true });
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    const wrapper = mountSelector();
    await nextTick();

    const toggle = wrapper.get<HTMLButtonElement>(
      '.position-selector__toggle',
    );
    toggle.element.focus();
    await toggle.trigger('keydown', { key: 'ArrowDown' });
    await nextTick();

    const firstCategory = wrapper.get<HTMLButtonElement>(
      '.position-catalog-browser__group-button',
    );
    expect(document.activeElement).toBe(firstCategory.element);
    expect(scrollIntoView).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('closes synchronously and owns at most one panel across 779 and 780', async () => {
    const media = installMedia({ compact: true });
    Object.defineProperty(Element.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn(),
    });
    const wrapper = mountSelector();
    await nextTick();

    wrapper
      .get('.position-selector__toggle')
      .element.dispatchEvent(
        new MouseEvent('click', { bubbles: true, detail: 1 }),
      );
    await nextTick();
    expect(
      document.querySelectorAll('#query-position-catalog-browser'),
    ).toHaveLength(1);

    media.setCompact(false);
    expect(
      document.querySelectorAll('#query-position-catalog-browser').length,
    ).toBeLessThanOrEqual(1);
    await nextTick();
    expect(wrapper.findComponent(NPopover).exists()).toBe(true);
    expect(
      document.querySelectorAll('#query-position-catalog-browser'),
    ).toHaveLength(0);
    expect(
      wrapper.get('.position-selector__toggle').attributes('aria-expanded'),
    ).toBe('false');
    media.setCompact(true);
    await nextTick();
    expect(wrapper.findComponent(NPopover).exists()).toBe(true);
    expect(
      document.querySelectorAll('#query-position-catalog-browser'),
    ).toHaveLength(0);
    wrapper.unmount();
  });
});

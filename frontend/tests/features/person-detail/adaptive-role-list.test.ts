import { mount } from '@vue/test-utils';
import { NTooltip } from 'naive-ui';
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdaptiveRoleList from '../../../src/features/person-detail/components/AdaptiveRoleList.vue';
import type { PersonDetailContribution } from '../../../src/features/person-detail/model';

type CastContribution = Extract<PersonDetailContribution, { kind: 'cast' }>;
const wrappers: ReturnType<typeof mount>[] = [];
const names = ['斋藤葵', '岩田慧菜', '冈美贵乃', '喜多村来南', '泽田树里', '鈴鹿咲子'];

function roles(): CastContribution[] {
  return names.map((name, index) => ({
    kind: 'cast',
    positionKey: 'cast:anime:all',
    character: { key: `character:${index + 1}`, id: index + 1, name, nameCN: index === 5 ? null : name },
    roleType: 2,
    roleLabel: '配角',
    provenance: 'exact',
  }));
}

afterEach(() => {
  wrappers.splice(0).forEach((wrapper) => wrapper.unmount());
  vi.unstubAllGlobals();
});

describe('ranking cast evidence list', () => {
  it('retains six equal-role identities with two rows and complete hover, keyboard and touch evidence', async () => {
    const wrapper = mount(AdaptiveRoleList, { attachTo: document.body, props: { contributions: roles() } });
    wrappers.push(wrapper);
    const trigger = wrapper.get('.adaptive-role-list');
    const tooltip = wrapper.getComponent(NTooltip);
    expect(wrapper.findAll('.adaptive-role-list__row')).toHaveLength(2);
    const lastRow = wrapper.findAll('.adaptive-role-list__row').at(-1)!;
    expect(lastRow.get('.adaptive-role-list__name').text()).toBe('岩田慧菜');
    expect(lastRow.get('.adaptive-role-list__more').text()).toBe('… +4');
    for (const name of names) expect(trigger.attributes('aria-label')).toContain(name);
    expect(tooltip.props('show')).toBe(false);

    await trigger.trigger('mouseenter');
    await vi.waitFor(() => expect(document.body.querySelectorAll('.adaptive-role-tooltip [role="listitem"]')).toHaveLength(6));
    expect(Array.from(document.body.querySelectorAll('.adaptive-role-tooltip__name'), (node) => node.textContent)).toEqual(names);
    await trigger.trigger('mouseleave');
    await vi.waitFor(() => expect(tooltip.props('show')).toBe(false));

    (trigger.element as HTMLElement).focus();
    await vi.waitFor(() => expect(tooltip.props('show')).toBe(true));
    await trigger.trigger('keydown', { key: 'Escape' });
    expect(tooltip.props('show')).toBe(false);
    expect(document.activeElement).toBe(trigger.element);
    await trigger.trigger('click');
    expect(tooltip.props('show')).toBe(true);
    await trigger.trigger('blur');
    expect(tooltip.props('show')).toBe(false);
    await trigger.trigger('click');
    await wrapper.setProps({ contributions: roles().slice(0, 1) });
    expect(tooltip.props('show')).toBe(false);
    expect(trigger.attributes('tabindex')).toBeUndefined();
    expect(trigger.attributes('aria-describedby')).toBeUndefined();
    expect(wrapper.find('.adaptive-role-list__more:not([data-role-more-measure])').exists()).toBe(false);
  });

  it('measures available width again on resize and keeps the counter beside a visible role', async () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    let width = 200;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return this.classList.contains('adaptive-role-list') ? width : 0;
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const measuredWidth = this.hasAttribute('data-role-measure') ? 80 : 36;
      return { width: measuredWidth, height: 20, x: 0, y: 0, top: 0, right: measuredWidth, bottom: 20, left: 0, toJSON: () => ({}) };
    });
    const wrapper = mount(AdaptiveRoleList, { props: { contributions: roles().slice(0, 4) } });
    wrappers.push(wrapper);
    await vi.waitFor(() => expect(wrapper.findAll('.adaptive-role-list__row .adaptive-role-list__name')).toHaveLength(4));
    expect(wrapper.findAll('.adaptive-role-list__row')).toHaveLength(2);
    expect(wrapper.get('.adaptive-role-list').attributes('tabindex')).toBeUndefined();

    width = 100;
    resize!([], {} as ResizeObserver);
    await vi.waitFor(() => expect(wrapper.get('.adaptive-role-list__row .adaptive-role-list__more').text()).toBe('… +3'));
    expect(wrapper.findAll('.adaptive-role-list__row')).toHaveLength(1);
    expect(wrapper.get('.adaptive-role-list__row .adaptive-role-list__name').text()).toBe('斋藤葵');
    expect(wrapper.get('.adaptive-role-list').attributes('tabindex')).toBe('0');
  });

  it('preserves separate exact series roles and counts in stable role order without aggregating them', () => {
    const first = roles()[0]!;
    const contributions: CastContribution[] = [
      { ...first, roleType: 2, roleLabel: '配角', workCount: 4 },
      { ...first, roleType: 1, roleLabel: '主役', workCount: 2 },
    ];
    const wrapper = mount(AdaptiveRoleList, { props: { contributions } });
    wrappers.push(wrapper);
    expect(wrapper.findAll('.adaptive-role-list__row .adaptive-role-list__name').map((node) => node.text())).toEqual(['斋藤葵', '斋藤葵']);
    expect(wrapper.findAll('.adaptive-role-list__row .character-role-tag').map((node) => node.text())).toEqual(['主役 2', '配角 4']);
    expect(wrapper.get('.adaptive-role-list').attributes('aria-label')).toBe('完整配音角色：斋藤葵 主役，参与 2 部；斋藤葵 配角，参与 4 部');
    expect(contributions.map((entry) => entry.roleLabel)).toEqual(['配角', '主役']);
  });
});

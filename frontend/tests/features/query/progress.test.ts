import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createQueryProgressOwner } from '../../../src/features/query/progress';
import QueryProgress from '../../../src/features/query/components/QueryProgress.vue';

describe('query progress presentation', () => {
  it('isolates concurrent operations and ignores replaced request events and finish', () => {
    const owner = createQueryProgressOwner();
    const old = owner.observe('/api/v1/rankings');
    const detail = owner.observe('/api/v1/person-detail');
    const current = owner.observe('/api/v1/rankings');
    current.update({ phase: 'filter', message: '正在筛选作品' });
    old.update({ phase: 'complete', message: '旧查询已完成' }); old.finish();
    expect(owner.active.value.map((item) => item.message)).toEqual(['正在连接查询服务', '正在筛选作品']);
    detail.finish();
    expect(owner.active.value).toHaveLength(1);
    current.finish(); expect(owner.active.value).toEqual([]);
    const late = owner.observe('/api/v1/candidates'); owner.clear();
    late.update({ phase: 'compute', message: '迟到消息' }); expect(owner.active.value).toEqual([]);
  });

  it('renders honest unknown-total progress, phase counts and final cleanup', async () => {
    const owner = createQueryProgressOwner();
    const subscription = owner.observe('/api/v1/rankings');
    subscription.update({ phase: 'collection_page', message: '已获取 2 页收藏', completed: 2 });
    const wrapper = mount(QueryProgress, { props: { active: owner.active.value } });
    expect(wrapper.text()).toContain('已获取 2 页收藏');
    expect(wrapper.get('progress').attributes('value')).toBeUndefined();
    expect(wrapper.get('progress').attributes('aria-label')).toContain('人物排行');
    subscription.update({ phase: 'filter', message: '正在筛选作品', completed: 2, total: 5 });
    await wrapper.setProps({ active: owner.active.value });
    expect(wrapper.get('progress').attributes()).toMatchObject({ value: '2', max: '5' });
    expect(wrapper.text()).toContain('本阶段 2 / 5');
    subscription.update({ phase: 'compute', message: '正在计算统计' });
    await wrapper.setProps({ active: owner.active.value });
    expect(wrapper.get('progress').attributes('value')).toBeUndefined();
    subscription.update({ phase: 'complete', message: '查询完成', completed: 1, total: 1 });
    await wrapper.setProps({ active: owner.active.value });
    expect(wrapper.text()).toContain('正在接收查询结果');
    expect(wrapper.get('progress').attributes('value')).toBeUndefined();
    subscription.finish(); await wrapper.setProps({ active: owner.active.value });
    expect(wrapper.find('progress').exists()).toBe(false);
  });
});

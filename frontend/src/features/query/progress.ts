import { computed, shallowRef } from 'vue';
import type { QueryProgress, QueryProgressObserver } from '../../api/queryProgress';

export interface ActiveQueryProgress extends QueryProgress {
  readonly id: number;
  readonly label: string;
  readonly reference: string;
}
const labels: Readonly<Record<string, string>> = {
  '/api/v1/rankings': '人物排行', '/api/v1/candidates': '候选人物',
  '/api/v1/person-detail': '人物详情', '/api/v1/partners': '合作人物', '/api/v1/co-star': '共演分析',
};

/** Display state only; query coordinators remain the result admission authority. */
export function createQueryProgressOwner() {
  let sequence = 0;
  const active = shallowRef<readonly ActiveQueryProgress[]>([]);
  const observe: QueryProgressObserver = (reference) => {
    const id = ++sequence;
    const entry: ActiveQueryProgress = {
      id, reference, label: labels[reference] ?? '查询',
      phase: 'starting', message: '正在连接查询服务',
    };
    active.value = [...active.value.filter((item) => item.reference !== reference), entry];
    return {
      update(progress) {
        const admitted = progress.phase === 'complete'
          ? { phase: progress.phase, message: '正在接收查询结果' } : progress;
        active.value = active.value.map((item) => item.id === id ? { ...entry, ...admitted } : item);
      },
      finish() { active.value = active.value.filter((item) => item.id !== id); },
    };
  };
  return { active: computed(() => active.value), observe, clear: () => { active.value = []; } };
}

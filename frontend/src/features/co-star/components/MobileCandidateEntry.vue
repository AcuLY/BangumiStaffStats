<script setup lang="ts">
import AppIcon from '../../../shared/components/AppIcon.vue';
import type { CoStarSelection } from '../selection';

defineProps<{
  expanded: boolean;
  selection: CoStarSelection;
}>();
const emit = defineEmits<{
  toggle: [trigger: HTMLElement];
}>();

function toggle(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) {
    emit('toggle', event.currentTarget);
  }
}
</script>

<template>
  <button
    id="co-star-mobile-picker-toggle"
    class="co-star-mobile-entry"
    type="button"
    :aria-expanded="expanded"
    aria-controls="co-star-mobile-picker-panel"
    :aria-label="`${selection.personCount.value ? '调整人物选择' : '选择人物'}。${
      selection.personCount.value
        ? `已选 ${selection.personCount.value} 人、${selection.identityCount.value} 个身份：${selection.people.value
            .map(
              (item) =>
                `人物：${item.person.nameCN ?? item.person.name}，职位：${item.identities
                  .map((identity) => identity.positionLabel)
                  .join('、')}`,
            )
            .join('；')}`
        : '尚未选择人物'
    }${!expanded && selection.personCount.value === 1 ? '。可继续选择人物，进行多人共演分析' : ''}`"
    @click="toggle"
  >
    <span class="co-star-mobile-entry__copy" aria-hidden="true">
      <span
        v-if="selection.personCount.value"
        class="co-star-mobile-entry__selections"
      >
        <span
          v-for="item in selection.people.value"
          :key="item.person.id"
          class="co-star-mobile-entry__selection"
        >
          <b>{{ item.person.nameCN ?? item.person.name }}</b>
          <span>
            {{
              item.identities
                .map((identity) => identity.positionLabel)
                .join(' / ')
            }}
          </span>
        </span>
      </span>
      <small v-else>尚未选择人物</small>
      <small v-if="!expanded && selection.personCount.value === 1" class="co-star-multi-person-hint">可继续选择人物，进行多人共演分析</small>
    </span>
    <span class="co-star-mobile-entry__action" aria-hidden="true">
      <app-icon name="chevron-down" :size="18" />
    </span>
  </button>
</template>

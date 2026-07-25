<script setup lang="ts">
import type { CoStarSelection } from '../selection';
import CoStarIcon from './CoStarIcon.vue';

const props = defineProps<{
  drawerOpen: boolean;
  selection: CoStarSelection;
}>();
const emit = defineEmits<{
  open: [trigger: HTMLElement];
}>();

function open(event: MouseEvent): void {
  if (event.currentTarget instanceof HTMLElement) {
    emit('open', event.currentTarget);
  }
}
</script>

<template>
  <button
    class="co-star-mobile-entry"
    type="button"
    aria-haspopup="dialog"
    :aria-expanded="drawerOpen"
    aria-controls="co-star-mobile-picker"
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
    }`"
    @click="open"
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
    </span>
    <span class="co-star-mobile-entry__action" aria-hidden="true">
      <co-star-icon name="edit" :size="18" />
    </span>
  </button>
</template>

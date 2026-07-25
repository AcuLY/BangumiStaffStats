<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import {
  primaryPersonName,
  secondaryPersonName,
  type PersonDetailPayload,
} from '../model';

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    payload: PersonDetailPayload;
  }>(),
  {
    devicePixelRatio: 1,
  },
);

const expanded = ref(false);
const name = computed(() => primaryPersonName(props.payload.person));
const secondaryName = computed(() =>
  secondaryPersonName(props.payload.person),
);
const careers = computed(() =>
  props.payload.person.careers.map(
    (career) =>
      ({
        actor: '演员',
        artist: '艺术家',
        illustrator: '插画家',
        mangaka: '漫画家',
        producer: '制作人',
        seiyu: '声优',
        writer: '作家',
      })[career],
  ),
);
const hasLongSummary = computed(
  () => (props.payload.person.summary?.trim().length ?? 0) > 92,
);

watch(
  () => props.payload.person.id,
  () => {
    expanded.value = false;
  },
);
</script>

<template>
  <header class="person-profile">
    <safe-image
      class="person-profile__portrait"
      :sources="
        personImageCandidates(payload.person.id, 152, devicePixelRatio)
      "
      :alt="name"
      loading="eager"
      :width="152"
    />
    <div class="person-profile__content">
      <div class="person-profile__name-row">
        <div>
          <h2 id="person-inspector-title">
            <a
              class="person-profile__name-link"
              :href="`https://bgm.tv/person/${payload.person.id}`"
              target="_blank"
              rel="noopener noreferrer"
            >
              {{ name }}
              <span class="sr-only">（在 Bangumi 打开人物页面）</span>
            </a>
          </h2>
          <p v-if="secondaryName" class="person-profile__secondary-name">
            {{ secondaryName }}
          </p>
        </div>
        <app-icon name="external-link" :size="15" />
      </div>
      <p v-if="careers.length" class="person-profile__careers">
        {{ careers.join(' · ') }}
      </p>
      <div v-if="payload.person.summary" class="person-profile__summary">
        <p :class="{ 'is-collapsed': hasLongSummary && !expanded }">
          {{ payload.person.summary }}
        </p>
        <button
          v-if="hasLongSummary"
          type="button"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起简介' : '展开简介' }}
        </button>
      </div>
    </div>
  </header>
</template>

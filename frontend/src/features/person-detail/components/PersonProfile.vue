<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import {
  primaryPersonName,
  secondaryPersonName,
  type PersonDetailPayload,
  type PersonPositionLabelResolver,
} from '../model';

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    payload: PersonDetailPayload;
    positionLabel: PersonPositionLabelResolver;
    positionKeys: readonly string[];
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
const careerLabels = {
  actor: '演员',
  artist: '音乐人',
  illustrator: '插画家',
  mangaka: '漫画家',
  producer: '制作人',
  seiyu: '声优',
  writer: '作家',
} as const;
const positionLabels = computed(() => {
  const labels = new Set<string>();
  for (const positionKey of props.positionKeys) {
    const display = props.positionLabel(positionKey);
    if (display.label) {
      labels.add(display.label);
    }
  }
  return [...labels];
});
const careers = computed(() =>
  props.payload.person.careers.map((career) => careerLabels[career]),
);
const careerLine = computed(() =>
  [...new Set([...positionLabels.value, ...careers.value])].join(' · '),
);
const profileSummary = computed(
  () =>
    props.payload.person.summary?.trim() ||
    `${name.value}以“${careerLine.value || '当前查询职位'}”身份参与了 ${
      props.payload.summary.workCount
    } ${
      props.payload.summary.workUnit === 'series'
        ? '个当前筛选范围内的系列'
        : '部当前筛选范围内的作品'
    }。`,
);
const hasLongSummary = computed(
  () => profileSummary.value.length > 60,
);

watch(
  () => props.payload.person.id,
  () => {
    expanded.value = !hasLongSummary.value;
  },
  { immediate: true },
);
</script>

<template>
  <header class="person-profile">
    <div class="person-profile__intro">
      <safe-image
        class="person-profile__portrait"
        :sources="
          personImageCandidates(payload.person.id, 160, devicePixelRatio)
        "
        :alt="name"
        loading="eager"
        :width="160"
      />
      <div class="person-profile__content">
        <div class="person-profile__name-row">
          <h2 id="person-inspector-title">
            <a
              class="person-profile__name-link"
              :href="`https://bgm.tv/person/${payload.person.id}`"
              target="_blank"
              rel="noopener noreferrer"
              :title="`在 Bangumi 查看${name}`"
            >
              {{ name }}
            </a>
          </h2>
        </div>
        <span
          v-if="careerLine"
          class="person-profile__career"
          :title="careerLine"
        >{{ careerLine }}</span>
        <p v-if="secondaryName" class="person-profile__secondary-name">
          {{ secondaryName }}
        </p>
      </div>
      <section
        class="person-profile__summary person-profile__bio"
        :class="{ 'is-expanded': expanded }"
        aria-label="人物简介"
      >
        <p>
          {{ profileSummary }}
        </p>
        <button
          v-if="hasLongSummary"
          class="person-profile__bio-toggle"
          type="button"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          {{ expanded ? '收起' : '展开' }}
        </button>
      </section>
    </div>
    <slot name="metrics" />
  </header>
</template>

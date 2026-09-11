<script setup lang="ts">
import '../co-star-oracle.css';
import { NSkeleton } from 'naive-ui';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import { formatHundredths } from '../../ranking/format';
import type { CoStarParticipant } from '../coStar';

type ParticipantCard = {
  person: CoStarParticipant['person'];
  positionKeys: CoStarParticipant['positionKeys'];
  metrics: { workCount: number | null; average: number | null };
};

withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    participants: readonly ParticipantCard[];
    pending?: boolean;
    partnerCount?: number | null;
    partnerCountPending?: boolean;
    workLabel?: string;
    positionLabel: (positionKey: string) => string;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
  },
);
const emit = defineEmits<{
  inspectPerson: [person: CoStarParticipant['person'], positionKeys: readonly string[], trigger: HTMLElement];
}>();

function inspect(participant: ParticipantCard, event: MouseEvent | KeyboardEvent): void {
  if (event.currentTarget instanceof HTMLElement) {
    emit('inspectPerson', participant.person, participant.positionKeys.map(String), event.currentTarget);
  }
}

function primaryName(
  person: Readonly<{ name: string; nameCN: string | null }>,
): string {
  return person.nameCN ?? person.name;
}
</script>

<template>
  <ol class="selected-people-grid" aria-label="已选人物">
    <li
      v-for="(participant, index) in participants"
      :key="participant.person.id"
    >
      <article
        class="selected-person-card co-star-participant-card"
        :data-selected-person-id="participant.person.id"
        :aria-labelledby="`co-star-participant-${participant.person.id}`"
      >
        <div class="selected-person-card__media">
          <safe-image
            class="selected-person-card__image"
            :sources="
              personImageCandidates(
                participant.person.id,
                96,
                devicePixelRatio,
              )
            "
            :alt="primaryName(participant.person)"
            decorative
            :loading="index < 2 ? 'eager' : 'lazy'"
            :width="96"
          />
        </div>
        <div class="selected-person-card__body">
          <header class="selected-person-card__header">
            <span class="selected-person-card__ordinal" aria-hidden="true">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <div class="selected-person-card__signature">
              <h3
                :id="`co-star-participant-${participant.person.id}`"
                class="selected-person-card__name"
                :title="primaryName(participant.person)"
              >
                {{ primaryName(participant.person) }}
              </h3>
              <p
                class="selected-person-card__identities"
                :aria-label="`${primaryName(participant.person)}的参与身份`"
              >
                <template
                  v-for="(positionKey, identityIndex) in participant.positionKeys"
                  :key="String(positionKey)"
                >
                  <span>{{ positionLabel(String(positionKey)) }}</span>
                  <span
                    v-if="identityIndex < participant.positionKeys.length - 1"
                    class="selected-person-card__identity-separator"
                    :class="{
                      'is-tight-before': /[（）]$/u.test(positionLabel(String(positionKey))),
                      'is-tight-after': /^[（）]/u.test(positionLabel(String(participant.positionKeys[identityIndex + 1]))),
                    }"
                    aria-hidden="true"
                  >·</span>
                </template>
              </p>
              <span
                class="co-star-person-inspect"
                role="button"
                :tabindex="pending ? undefined : 0"
                :aria-disabled="pending || undefined"
                :aria-label="`查看${primaryName(participant.person)}的详情`"
                @click="!pending && inspect(participant, $event)"
                @keydown.enter.prevent="!pending && inspect(participant, $event)"
                @keydown.space.prevent="!pending && inspect(participant, $event)"
              >查看详情</span>
            </div>
          </header>
          <dl class="selected-person-card__metrics metric-grid" :class="{ 'selected-person-card__metrics--partners': partnerCount !== undefined }">
            <div class="metric-unit">
              <dd class="metric-unit__value">
                <n-skeleton v-if="pending" class="app-skeleton" width="36px" height="1lh" :sharp="false" aria-hidden="true" />
                <template v-else>{{ participant.metrics.workCount ?? '—' }}</template>
              </dd>
              <dt class="metric-unit__label">
                {{ workLabel ?? (workUnit === 'series' ? '参与系列' : '参与作品') }}
              </dt>
            </div>
            <div class="metric-unit">
              <dd class="metric-unit__value">
                <n-skeleton v-if="pending" class="app-skeleton" width="36px" height="1lh" :sharp="false" aria-hidden="true" />
                <template v-else>{{ formatHundredths(participant.metrics.average) }}</template>
              </dd>
              <dt class="metric-unit__label">均分</dt>
            </div>
            <div v-if="partnerCount !== undefined" class="metric-unit">
              <dd class="metric-unit__value">
                <n-skeleton v-if="pending || partnerCountPending" class="app-skeleton" width="36px" height="1lh" :sharp="false" aria-hidden="true" />
                <template v-else>{{ partnerCount ?? '—' }}</template>
              </dd>
              <dt class="metric-unit__label">合作人物</dt>
            </div>
          </dl>
        </div>
      </article>
    </li>
  </ol>
</template>

<style>
@import '../co-star-oracle.css';
</style>

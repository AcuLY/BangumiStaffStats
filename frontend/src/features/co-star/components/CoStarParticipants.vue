<script setup lang="ts">
import SafeImage from '../../../shared/components/SafeImage.vue';
import { personImageCandidates } from '../../../shared/media/bangumiImage';
import { formatHundredths } from '../../ranking/format';
import type { CoStarParticipant } from '../coStar';

withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    participants: readonly CoStarParticipant[];
    positionLabel: (positionKey: string) => string;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
  },
);

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
                84,
                devicePixelRatio,
              )
            "
            :alt="primaryName(participant.person)"
            decorative
            :loading="index < 2 ? 'eager' : 'lazy'"
            :width="84"
          />
        </div>
        <div class="selected-person-card__body">
          <header class="selected-person-card__header">
            <span class="selected-person-card__ordinal" aria-hidden="true">
              {{ String(index + 1).padStart(2, '0') }}
            </span>
            <span
              class="selected-person-card__signature-rule"
              aria-hidden="true"
            />
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
                    aria-hidden="true"
                  >·</span>
                </template>
              </p>
            </div>
          </header>
          <dl class="selected-person-card__metrics metric-grid">
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ participant.metrics.workCount }}
              </dd>
              <dt class="metric-unit__label">
                {{ workUnit === 'series' ? '参与系列' : '参与作品' }}
              </dt>
            </div>
            <div class="metric-unit">
              <dd class="metric-unit__value">
                {{ formatHundredths(participant.metrics.average) }}
              </dd>
              <dt class="metric-unit__label">均分</dt>
            </div>
          </dl>
        </div>
      </article>
    </li>
  </ol>
</template>

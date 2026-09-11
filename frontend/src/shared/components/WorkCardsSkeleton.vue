<script setup lang="ts">
import { NSkeleton } from 'naive-ui';
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    count?: number;
    compact?: boolean;
    personal?: boolean;
    hasCharacterRoles?: boolean;
    kind?: 'subject' | 'series' | 'character';
    participantCount?: number;
  }>(),
  {
    count: 5,
    compact: false,
    personal: false,
    hasCharacterRoles: false,
    kind: 'subject',
    participantCount: 0,
  },
);

const participantRows = computed(() =>
  Array.from({ length: Math.ceil(props.participantCount / 2) }, (_, row) =>
    Array.from(
      { length: Math.min(2, props.participantCount - row * 2) },
      (_, index) => row * 2 + index,
    ),
  ),
);
</script>

<template>
  <ul
    class="work-cards-skeleton person-item-list"
    :class="kind === 'character'
      ? ['character-role-list', { 'character-role-list--compact': compact }]
      : ['person-work-list', 'subject-work-list', {
          'subject-work-list--compact': compact,
          'co-star-work-list': participantCount > 0,
        }]"
    aria-hidden="true"
  >
    <li
      v-for="index in count"
      :key="index"
      :class="kind === 'character'
        ? ['character-role-card', { 'character-role-card--compact': compact }]
        : ['subject-work-row', 'person-work-row', {
            'person-item': participantCount === 0,
            'co-star-work-row': participantCount > 0,
            'subject-work-row--compact': compact,
            'subject-work-row--with-series-members': !compact && kind === 'series',
            'subject-work-row--with-participants': !compact && participantCount > 0,
          }]"
    >
      <template v-if="kind === 'character'">
        <span class="character-role-card__avatar">
          <n-skeleton class="app-skeleton" width="100%" height="100%" :sharp="false" />
        </span>
        <div class="character-role-card__content">
          <div class="character-role-card__names">
            <span class="character-role-card__name work-cards-skeleton__name">
              <n-skeleton class="app-skeleton" width="76%" :height="14" :sharp="false" />
            </span>
            <span class="work-cards-skeleton__secondary">
              <n-skeleton class="app-skeleton" width="58%" :height="12" :sharp="false" />
            </span>
          </div>
          <ul v-if="!compact" class="person-character-appearances character-role-card__appearances">
            <li v-for="appearance in 2" :key="appearance" class="character-role-card__appearance-row">
              <span class="character-role-card__appearance">
                <n-skeleton
                  class="app-skeleton work-cards-skeleton__role-tag"
                  :width="40"
                  :height="22"
                  round
                />
                <n-skeleton class="app-skeleton" width="62%" :height="12" :sharp="false" />
              </span>
            </li>
          </ul>
        </div>
      </template>
      <template v-else-if="compact">
        <span class="subject-work-row__index">
          <n-skeleton class="app-skeleton" width="1.2ch" :height="13" :sharp="false" />
        </span>
        <span class="subject-work-row__compact-names">
          <span class="work-cards-skeleton__name">
            <n-skeleton class="app-skeleton" width="80%" :height="13" :sharp="false" />
          </span>
          <span class="work-cards-skeleton__secondary">
            <n-skeleton class="app-skeleton" width="62%" :height="12" :sharp="false" />
          </span>
        </span>
        <span class="subject-work-row__compact-score">
          <n-skeleton class="app-skeleton" :width="participantCount ? 42 : 30" :height="13" :sharp="false" />
        </span>
      </template>
      <template v-else>
        <span class="subject-work-row__cover-media">
          <n-skeleton class="app-skeleton" width="100%" height="100%" :sharp="false" />
        </span>
        <div
          class="subject-work-row__copy"
          :class="participantCount ? 'work-cell__copy' : 'person-item__copy'"
        >
          <span class="subject-work-row__primary-link work-cards-skeleton__name">
            <n-skeleton class="app-skeleton" width="84%" :height="14" :sharp="false" />
          </span>
          <span class="subject-work-row__secondary work-cards-skeleton__secondary">
            <n-skeleton class="app-skeleton" width="64%" :height="12" :sharp="false" />
          </span>
          <span v-if="kind === 'series'" class="subject-work-row__series-summary">
            <n-skeleton class="app-skeleton" :width="108" :height="12" :sharp="false" />
          </span>
          <span v-else-if="personal" class="subject-work-row__collection-meta work-cards-skeleton__collection">
            <span v-if="!participantCount" class="subject-work-row__collection work-cards-skeleton__name">
              <n-skeleton class="app-skeleton" :width="36" :height="12" :sharp="false" />
            </span>
            <span class="subject-work-row__collection-time work-cards-skeleton__secondary">
              <n-skeleton class="app-skeleton" :width="66" :height="10" :sharp="false" />
            </span>
          </span>
          <ul v-if="kind === 'subject' || participantCount" class="subject-work-row__meta">
            <li
              v-for="tag in 3"
              :key="tag"
              class="work-cards-skeleton__meta-item"
              :style="{ '--skeleton-tag-text-width': tag === 2 ? '38px' : '26px' }"
            >
              <n-skeleton class="app-skeleton" width="100%" height="100%" round />
            </li>
          </ul>
        </div>
        <dl
          class="subject-work-row__facts person-work-row__facts"
          :class="{
            'person-item__scores': !participantCount,
            'subject-work-row__facts--global': !personal,
            'subject-work-row__facts--with-role': !participantCount && hasCharacterRoles,
          }"
        >
          <div class="subject-work-row__score--global">
            <dt>{{ personal ? (kind === 'series' ? '全站均分' : '全站评分') : (kind === 'series' ? '均分' : '评分') }}</dt>
            <dd><n-skeleton class="app-skeleton" :width="36" :height="14" :sharp="false" /></dd>
          </div>
          <div v-if="personal" class="subject-work-row__score--mine">
            <dt>{{ kind === 'series' ? '我的均分' : '我的评分' }}</dt>
            <dd><n-skeleton class="app-skeleton" :width="30" :height="14" :sharp="false" /></dd>
          </div>
          <div v-if="!participantCount && hasCharacterRoles" class="subject-work-row__role-fact">
            <dt>配音角色</dt>
            <dd>
              <span class="work-cards-skeleton__role-entry">
                <n-skeleton class="app-skeleton" width="46%" :height="14" :sharp="false" />
                <n-skeleton
                  class="app-skeleton work-cards-skeleton__role-tag"
                  :width="kind === 'series' ? 52 : 40"
                  :height="22"
                  round
                />
              </span>
            </dd>
          </div>
        </dl>
        <div v-if="participantCount" class="subject-work-row__participants">
          <div class="shared-work-participants">
            <div v-for="(row, rowIndex) in participantRows" :key="rowIndex" class="shared-work-participant-row">
              <div v-for="participant in row" :key="participant" class="shared-work-participant">
                <n-skeleton class="app-skeleton" :width="16" :height="16" circle />
                <div class="shared-work-participant__body" :class="{ 'shared-work-participant__body--series': kind === 'series' }">
                  <div class="shared-work-participant__identity">
                    <span class="work-cards-skeleton__name">
                      <n-skeleton class="app-skeleton" width="76%" :height="13" :sharp="false" />
                    </span>
                    <span v-if="kind === 'series'" class="work-cards-skeleton__secondary">
                      <n-skeleton class="app-skeleton" width="62%" :height="10" :sharp="false" />
                    </span>
                  </div>
                  <div class="shared-work-participant__roles work-cards-skeleton__secondary">
                    <n-skeleton class="app-skeleton" width="68%" :height="12" :sharp="false" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <section v-if="kind === 'series'" class="subject-work-row__series-members">
          <strong class="subject-work-row__series-members-title">系列作品</strong>
          <ul class="subject-work-row__series-member-list">
            <li v-for="member in 2" :key="member">
              <span class="subject-work-row__series-member">
                <span class="subject-work-row__series-member-cover">
                  <n-skeleton class="app-skeleton" width="100%" height="100%" :sharp="false" />
                </span>
                <span class="subject-work-row__series-member-copy">
                  <span class="work-cards-skeleton__secondary">
                    <n-skeleton class="app-skeleton" width="86%" :height="12" :sharp="false" />
                  </span>
                  <span class="work-cards-skeleton__secondary">
                    <n-skeleton class="app-skeleton" width="64%" :height="10" :sharp="false" />
                  </span>
                </span>
              </span>
            </li>
          </ul>
        </section>
      </template>
    </li>
  </ul>
</template>

<style scoped>
.work-cards-skeleton__name,
.work-cards-skeleton__secondary {
  display: flex;
  min-width: 0;
  min-height: 20px;
  align-items: center;
}

.work-cards-skeleton__secondary {
  min-height: 18px;
}

.work-cards-skeleton__collection {
  display: grid;
  grid-area: collection;
  align-self: start;
  justify-items: end;
}

.work-cards-skeleton .subject-work-row__facts dd {
  min-height: 20px;
  align-items: center;
}

.work-cards-skeleton__role-tag {
  flex: 0 0 auto;
  align-self: center;
}

.work-cards-skeleton__role-entry {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 22px;
  align-items: center;
  gap: var(--space-1);
}

.work-cards-skeleton .character-role-card__name {
  min-height: 21px;
}

.work-cards-skeleton .character-role-card--compact .character-role-card__name {
  min-height: 20px;
}

.work-cards-skeleton .character-role-card__appearance {
  width: 100%;
  min-height: 22px;
}

.work-cards-skeleton .subject-work-row__compact-names .work-cards-skeleton__secondary {
  min-height: 17px;
}

.work-cards-skeleton .subject-work-row__compact-score {
  min-height: 20px;
}

.work-cards-skeleton .subject-work-row__collection-time {
  min-height: 16px;
}

.work-cards-skeleton .subject-work-row__meta .work-cards-skeleton__meta-item {
  width: calc(var(--skeleton-tag-text-width) + 16px);
  height: 22px;
  padding: 0;
  border: 0;
  background: transparent;
}

.work-cards-skeleton .subject-work-row__series-summary {
  min-height: 20px;
}
</style>

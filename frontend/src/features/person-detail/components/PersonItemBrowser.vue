<script setup lang="ts">
import {
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
} from 'naive-ui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import SortDirectionButton from '../../ranking/components/SortDirectionButton.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import {
  characterImageCandidates,
  subjectImageCandidates,
} from '../../../shared/media/bangumiImage';
import {
  formatHundredths,
  primaryEntityName,
  secondaryEntityName,
  updatePersonDetailView,
  type PersonDetailCharacterItem,
  type PersonDetailContribution,
  type PersonDetailPayload,
  type PersonDetailSeriesItem,
  type PersonDetailSort,
  type PersonDetailSubjectItem,
  type PersonDetailView,
  type PersonPositionDisplay,
  type PersonPositionLabelResolver,
} from '../model';
import AdaptiveAppearanceList from './AdaptiveAppearanceList.vue';

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    payload: PersonDetailPayload;
    pending: boolean;
    positionLabel: PersonPositionLabelResolver;
    view: Readonly<PersonDetailView>;
  }>(),
  {
    devicePixelRatio: 1,
  },
);
const emit = defineEmits<{
  view: [view: Readonly<PersonDetailView>];
}>();

const search = ref(props.view.search);
const density = ref<'compact' | 'detailed'>('detailed');
const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
let searchTimer: number | undefined;

const hasCharacters = computed(
  () => props.payload.summary.characterCount !== undefined,
);
const workLabel = computed(() =>
  props.payload.summary.workUnit === 'series' ? '系列' : '作品',
);
const sectionLabel = computed(() =>
  props.view.section === 'characters' ? '角色' : workLabel.value,
);
const densityAriaLabel = computed(() =>
  props.view.section === 'characters'
    ? '角色缩略模式'
    : props.payload.summary.workUnit === 'series'
      ? '系列缩略模式'
      : '作品缩略模式',
);
const compactDescription = computed(() =>
  props.view.section === 'characters'
    ? '仅显示角色的缩小头像和双语名'
    : props.payload.summary.workUnit === 'series'
      ? '仅显示代表条目的序号、双语名和系列均分'
      : '仅显示序号、双语名和评分',
);
const browserTitle = computed(() =>
  props.view.section === 'characters'
    ? '配音角色'
    : props.payload.summary.workUnit === 'series'
      ? '参与系列'
      : '参与作品',
);
const searchAriaLabel = computed(() =>
  props.view.section === 'characters'
    ? '搜索配音角色'
    : props.payload.summary.workUnit === 'series'
      ? '搜索参与系列或系列内作品'
      : '搜索参与作品',
);
const sortAriaLabel = computed(() =>
  props.view.section === 'characters'
    ? '配音角色排序'
    : props.payload.summary.workUnit === 'series'
      ? '参与系列排序'
      : '参与作品排序',
);
const orderAriaLabel = computed(() =>
  props.view.section === 'characters'
    ? '配音角色排序方向'
    : props.payload.summary.workUnit === 'series'
      ? '参与系列排序方向'
      : '参与作品排序方向',
);
const pageStart = computed(
  () => (props.payload.pagination.page - 1) * props.payload.pagination.pageSize,
);
const sortOptions = computed<{ label: string; value: PersonDetailSort }[]>(
  () => {
    if (props.view.section === 'characters') {
      return [
        { label: '戏份类型', value: 'role' },
        { label: '作品数', value: 'workCount' },
        { label: '角色名', value: 'name' },
      ];
    }
    return [
      {
        label:
          props.payload.scope === 'personal' ? '全站评分' : '评分',
        value: 'globalScore',
      },
      ...(props.payload.scope === 'personal'
        ? [
            { label: '我的评分', value: 'personalScore' as const },
            {
              label: '收藏日期',
              value: 'collectionUpdatedAt' as const,
            },
          ]
        : []),
      ...(props.payload.summary.workUnit === 'series'
        ? [{ label: '系列作品数量', value: 'seriesSize' as const }]
        : []),
    ];
  },
);

watch(
  () => props.view.search,
  (value) => {
    search.value = value;
  },
);
function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    window.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function request(patch: Partial<PersonDetailView>): void {
  emit('view', updatePersonDetailView(props.view, patch));
}

function scheduleSearch(value: string): void {
  search.value = value;
  clearSearchTimer();
  searchTimer = window.setTimeout(() => {
    searchTimer = undefined;
    request({ search: value });
  }, 240);
}

function submitSearch(): void {
  clearSearchTimer();
  request({ search: search.value });
}

function changeSection(section: 'characters' | 'works'): void {
  request({
    section,
    sort: section === 'characters' ? 'role' : 'globalScore',
  });
}

function isSubject(
  item: PersonDetailPayload['items'][number],
): item is PersonDetailSubjectItem {
  return 'kind' in item && item.kind === 'subject';
}

function isSeries(
  item: PersonDetailPayload['items'][number],
): item is PersonDetailSeriesItem {
  return 'kind' in item && item.kind === 'series';
}

function isCharacter(
  item: PersonDetailPayload['items'][number],
): item is PersonDetailCharacterItem {
  return 'character' in item && !('kind' in item);
}

function contributionDisplay(
  contribution: PersonDetailContribution,
): PersonPositionDisplay {
  if (contribution.kind === 'cast') {
    return {
      label: contribution.roleLabel
        ? `配音 · ${contribution.roleLabel}`
        : '配音',
    };
  }
  return props.positionLabel(
    contribution.positionKey,
    contribution.exactPositionKey,
  );
}

function collectionDateLabel(value: string | null | undefined): string {
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return parts ? `${parts[1]}/${parts[2]}/${parts[3]}` : '';
}

function personalScoreLabel(
  value: number | null | undefined,
  series: boolean,
): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return series
    ? formatHundredths(value)
    : String(Math.round(value / 100));
}

function scoreDifference(
  globalScore: number | null,
  personalScore: number | null | undefined,
): number | null {
  return globalScore === null ||
    personalScore === null ||
    personalScore === undefined
    ? null
    : personalScore - globalScore;
}

function differenceLabel(value: number | null): string {
  if (!value) {
    return '';
  }
  const sign = value > 0 ? '+' : '−';
  return `${sign}${(Math.abs(value) / 100).toFixed(2)}`;
}

function contributionSummary(
  contributions: readonly PersonDetailContribution[],
): string {
  return contributions
    .map((contribution) => {
      const display = contributionDisplay(contribution);
      const count =
        'workCount' in contribution && contribution.workCount
          ? ` · ${contribution.workCount} 部`
          : '';
      return `${display.label}${count}${
        display.detail ? `（${display.detail}）` : ''
      }`;
    })
    .join(' / ');
}

onBeforeUnmount(clearSearchTimer);
</script>

<template>
  <section
    class="person-inspector__section person-item-browser"
    aria-labelledby="person-items-title"
  >
    <header class="person-section-heading person-item-browser__heading">
      <div class="person-item-browser__heading-copy">
        <h2 v-if="!hasCharacters" id="person-items-title">
          {{ browserTitle }}
        </h2>
        <div v-else class="person-credit-tabs">
          <h2 id="person-items-title" class="sr-only">
            {{ payload.summary.workUnit === 'series'
              ? '参与系列与配音角色'
              : '参与作品与配音角色' }}
          </h2>
          <n-radio-group
            :size="controlSize"
            :value="view.section"
            role="radiogroup"
            :aria-label="
              payload.summary.workUnit === 'series'
                ? '浏览参与系列或配音角色'
                : '浏览参与作品或配音角色'
            "
            @update:value="changeSection($event as 'characters' | 'works')"
          >
            <n-radio-button value="works">
              <span class="person-credit-tab__label">
                {{ workLabel }}
                <small>{{ payload.summary.workCount }}</small>
              </span>
            </n-radio-button>
            <n-radio-button value="characters">
              <span class="person-credit-tab__label">
                角色
                <small>{{ payload.summary.characterCount }}</small>
              </span>
            </n-radio-button>
          </n-radio-group>
        </div>
      </div>
      <n-radio-group
        v-model:value="density"
        class="person-item-browser__density"
        :size="controlSize"
        role="radiogroup"
        :aria-label="densityAriaLabel"
      >
        <n-radio-button
          value="detailed"
          :title="
            payload.summary.workUnit === 'series' &&
            view.section === 'works'
              ? '显示完整系列信息'
              : '显示完整作品信息'
          "
        >详细</n-radio-button>
        <n-radio-button value="compact" :title="compactDescription">
          缩略
        </n-radio-button>
      </n-radio-group>
    </header>

    <form
      class="person-item-toolbar work-list-toolbar"
      role="search"
      @submit.prevent="submitSearch"
    >
      <n-input
        class="person-item-toolbar__search"
        :size="controlSize"
        :value="search"
        :clearable="Boolean(search)"
        :placeholder="
          view.section === 'characters'
            ? '搜索角色'
            : payload.summary.workUnit === 'series'
              ? '搜索系列或系列内作品'
              : '搜索作品'
        "
        autocomplete="off"
        :aria-label="searchAriaLabel"
        :input-props="{
          'aria-label': searchAriaLabel,
          name: view.section === 'characters' ? 'characterSearch' : 'workSearch',
          spellcheck: 'false',
        }"
        @update:value="scheduleSearch"
      />
      <n-select
        :size="controlSize"
        :menu-size="controlSize"
        :value="view.sort"
        :options="sortOptions"
        :consistent-menu-width="false"
        :aria-label="sortAriaLabel"
        @update:value="request({ sort: $event as PersonDetailSort })"
      />
      <sort-direction-button
        :order="view.order"
        :context-label="orderAriaLabel"
        @change="request({ order: $event })"
      />
    </form>

    <div
      class="person-item-browser__body"
      :class="{ 'is-compact': density === 'compact' }"
      :aria-busy="pending ? 'true' : undefined"
    >
      <div v-if="pending" class="person-item-skeletons" aria-live="polite">
        <span class="sr-only">正在更新{{ sectionLabel }}列表</span>
        <i v-for="index in 5" :key="index" aria-hidden="true" />
      </div>
      <ul
        v-else-if="payload.items.length"
        class="person-item-list"
        :class="
          view.section === 'characters'
            ? [
                'character-role-list',
                { 'character-role-list--compact': density === 'compact' },
              ]
            : [
                'person-work-list',
                'subject-work-list',
                { 'subject-work-list--compact': density === 'compact' },
              ]
        "
        :aria-label="`${browserTitle}，当前页 ${payload.items.length} 项`"
      >
        <li
          v-for="(item, itemIndex) in payload.items"
          :key="
            isCharacter(item)
              ? item.character.key
              : item.key
          "
          :class="
            isCharacter(item)
              ? [
                  'character-role-card',
                  { 'character-role-card--compact': density === 'compact' },
                ]
              : [
                  'person-item',
                  'person-work-row',
                  'subject-work-row',
                  {
                    'subject-work-row--compact': density === 'compact',
                    'subject-work-row--with-series-members':
                      density === 'detailed' && isSeries(item),
                  },
                ]
          "
        >
          <template v-if="isSubject(item)">
            <template v-if="density === 'compact'">
              <span class="subject-work-row__index">
                {{ pageStart + itemIndex + 1 }}
              </span>
              <span class="subject-work-row__compact-names">
                <a
                  class="subject-work-row__primary-link"
                  :href="`https://bgm.tv/subject/${item.subject.id}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{{ primaryEntityName(item.subject) }}</strong>
                </a>
                <small
                  v-if="secondaryEntityName(item.subject)"
                  class="subject-work-row__secondary"
                >
                  {{ secondaryEntityName(item.subject) }}
                </small>
              </span>
              <dl class="subject-work-row__compact-score">
                <dt class="sr-only">
                  {{ item.personal ? '我的评分' : '评分' }}
                </dt>
                <dd>
                  {{
                    item.personal
                      ? personalScoreLabel(item.personal.score, false)
                      : formatHundredths(item.globalScore)
                  }}
                </dd>
              </dl>
            </template>
            <template v-else>
              <span class="subject-work-row__cover-media">
                <safe-image
                  class="subject-work-row__cover"
                  :sources="
                    subjectImageCandidates(
                      item.subject.id,
                      64,
                      devicePixelRatio,
                    )
                  "
                  :alt="primaryEntityName(item.subject)"
                  decorative
                  :width="64"
                />
              </span>
              <div class="person-item__copy subject-work-row__copy">
                <div class="subject-work-row__heading">
                  <a
                    class="subject-work-row__primary-link"
                    :href="`https://bgm.tv/subject/${item.subject.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{{ primaryEntityName(item.subject) }}</strong>
                  </a>
                </div>
                <small
                  v-if="secondaryEntityName(item.subject)"
                  class="subject-work-row__secondary"
                >
                  {{ secondaryEntityName(item.subject) }}
                </small>
                <span
                  v-if="item.personal"
                  class="subject-work-row__collection-meta"
                >
                  <strong class="subject-work-row__collection">已收藏</strong>
                  <small
                    v-if="collectionDateLabel(item.personal.updatedAt)"
                    class="subject-work-row__collection-time"
                  >
                    {{ collectionDateLabel(item.personal.updatedAt) }}
                  </small>
                </span>
                <ul class="subject-work-row__meta">
                  <li v-for="tag in item.metaTags" :key="tag">{{ tag }}</li>
                </ul>
              </div>
              <dl
                class="person-item__scores person-work-row__facts subject-work-row__facts"
                :class="{
                  'subject-work-row__facts--global': !item.personal,
                  'subject-work-row__facts--with-role':
                    item.contributions.length > 0,
                }"
              >
                <div class="subject-work-row__score--global">
                  <dt>{{ item.personal ? '全站评分' : '评分' }}</dt>
                  <dd><strong>{{ formatHundredths(item.globalScore) }}</strong></dd>
                </div>
                <div v-if="item.personal" class="subject-work-row__score--mine">
                  <dt>我的评分</dt>
                  <dd>
                    <strong>
                      {{ personalScoreLabel(item.personal.score, false) }}
                    </strong>
                    <span
                      v-if="
                        scoreDifference(
                          item.globalScore,
                          item.personal.score,
                        )
                      "
                      class="subject-work-row__difference"
                      :class="{
                        'is-positive':
                          Number(
                            scoreDifference(
                              item.globalScore,
                              item.personal.score,
                            ),
                          ) > 0,
                        'is-negative':
                          Number(
                            scoreDifference(
                              item.globalScore,
                              item.personal.score,
                            ),
                          ) < 0,
                      }"
                    >
                      {{
                        differenceLabel(
                          scoreDifference(
                            item.globalScore,
                            item.personal.score,
                          ),
                        )
                      }}
                    </span>
                  </dd>
                </div>
                <div
                  v-if="item.contributions.length"
                  class="subject-work-row__role-fact"
                >
                  <dt>参与职位</dt>
                  <dd>{{ contributionSummary(item.contributions) }}</dd>
                </div>
              </dl>
            </template>
          </template>

          <template v-else-if="isSeries(item)">
            <template v-if="density === 'compact'">
              <span class="subject-work-row__index">
                {{ pageStart + itemIndex + 1 }}
              </span>
              <span class="subject-work-row__compact-names">
                <a
                  class="subject-work-row__primary-link"
                  :href="`https://bgm.tv/subject/${item.representative.id}`"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <strong>{{ primaryEntityName(item.representative) }}</strong>
                </a>
                <small
                  v-if="secondaryEntityName(item.representative)"
                  class="subject-work-row__secondary"
                >
                  {{ secondaryEntityName(item.representative) }}
                </small>
              </span>
              <dl class="subject-work-row__compact-score">
                <dt class="sr-only">
                  {{ item.personalScore === undefined ? '均分' : '我的均分' }}
                </dt>
                <dd>
                  {{
                    item.personalScore === undefined
                      ? formatHundredths(item.globalScore)
                      : personalScoreLabel(item.personalScore, true)
                  }}
                </dd>
              </dl>
            </template>
            <template v-else>
              <span class="subject-work-row__cover-media">
                <safe-image
                  class="subject-work-row__cover"
                  :sources="
                    subjectImageCandidates(
                      item.representative.id,
                      64,
                      devicePixelRatio,
                    )
                  "
                  :alt="primaryEntityName(item.representative)"
                  decorative
                  :width="64"
                />
              </span>
              <div class="person-item__copy subject-work-row__copy">
                <div class="subject-work-row__heading">
                  <a
                    class="subject-work-row__primary-link"
                    :href="`https://bgm.tv/subject/${item.representative.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <strong>{{ primaryEntityName(item.representative) }}</strong>
                  </a>
                </div>
                <small
                  v-if="secondaryEntityName(item.representative)"
                  class="subject-work-row__secondary"
                >
                  {{ secondaryEntityName(item.representative) }}
                </small>
                <strong class="subject-work-row__series-summary">
                  参与 {{ item.matchedWorkCount }} 部 · 系列
                  {{ item.memberCount }} 部
                </strong>
              </div>
              <dl
                class="person-item__scores person-work-row__facts subject-work-row__facts"
                :class="{
                  'subject-work-row__facts--global':
                    item.personalScore === undefined,
                  'subject-work-row__facts--with-role':
                    item.contributions.length > 0,
                }"
              >
                <div class="subject-work-row__score--global">
                  <dt>{{ item.personalScore === undefined ? '均分' : '全站均分' }}</dt>
                  <dd><strong>{{ formatHundredths(item.globalScore) }}</strong></dd>
                </div>
                <div
                  v-if="item.personalScore !== undefined"
                  class="subject-work-row__score--mine"
                >
                  <dt>我的均分</dt>
                  <dd>
                    <strong>
                      {{ personalScoreLabel(item.personalScore, true) }}
                    </strong>
                    <span
                      v-if="
                        scoreDifference(
                          item.globalScore,
                          item.personalScore,
                        )
                      "
                      class="subject-work-row__difference"
                      :class="{
                        'is-positive':
                          Number(
                            scoreDifference(
                              item.globalScore,
                              item.personalScore,
                            ),
                          ) > 0,
                        'is-negative':
                          Number(
                            scoreDifference(
                              item.globalScore,
                              item.personalScore,
                            ),
                          ) < 0,
                      }"
                    >
                      {{
                        differenceLabel(
                          scoreDifference(
                            item.globalScore,
                            item.personalScore,
                          ),
                        )
                      }}
                    </span>
                  </dd>
                </div>
                <div
                  v-if="item.contributions.length"
                  class="subject-work-row__role-fact"
                >
                  <dt>参与职位</dt>
                  <dd>{{ contributionSummary(item.contributions) }}</dd>
                </div>
              </dl>
              <section class="subject-work-row__series-members">
                <strong class="subject-work-row__series-members-title">
                  系列作品（{{ item.members.length }}）
                </strong>
                <ul class="subject-work-row__series-member-list">
                  <li v-for="member in item.members" :key="member.id">
                    <a
                      class="subject-work-row__series-member"
                      :class="{ 'is-muted': !member.matched }"
                      :href="`https://bgm.tv/subject/${member.id}`"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <safe-image
                        class="subject-work-row__series-member-cover"
                        :sources="
                          subjectImageCandidates(
                            member.id,
                            28,
                            devicePixelRatio,
                          )
                        "
                        :alt="primaryEntityName(member)"
                        decorative
                        :width="28"
                      />
                      <span class="subject-work-row__series-member-copy">
                        <strong class="subject-work-row__series-member-name">
                          {{ primaryEntityName(member) }}
                        </strong>
                        <small
                          v-if="secondaryEntityName(member)"
                          class="subject-work-row__series-member-original"
                        >
                          {{ secondaryEntityName(member) }}
                        </small>
                      </span>
                    </a>
                  </li>
                </ul>
              </section>
            </template>
          </template>

          <template v-else-if="isCharacter(item)">
            <safe-image
              class="character-role-card__avatar"
              :sources="
                characterImageCandidates(
                  item.character.id,
                  density === 'compact' ? 36 : 80,
                  devicePixelRatio,
                )
              "
              :alt="primaryEntityName(item.character)"
              decorative
              :width="density === 'compact' ? 36 : 80"
            />
            <div class="character-role-card__content">
              <div class="character-role-card__names">
                <a
                  v-if="item.character.id"
                  class="character-role-card__name-link"
                  :href="`https://bgm.tv/character/${item.character.id}`"
                  target="_blank"
                  rel="noopener noreferrer"
                  :aria-label="`在 Bangumi 查看${primaryEntityName(item.character)}`"
                >
                  <strong>{{ primaryEntityName(item.character) }}</strong>
                </a>
                <strong v-else class="character-role-card__name">
                  {{ primaryEntityName(item.character) }}
                </strong>
                <small v-if="secondaryEntityName(item.character)">
                  {{ secondaryEntityName(item.character) }}
                </small>
              </div>
              <adaptive-appearance-list
                v-if="density === 'detailed'"
                :item="item"
              />
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="person-section-empty">
        {{
          view.search.trim()
            ? `没有符合搜索条件的${sectionLabel}`
            : view.section === 'characters'
              ? '没有符合条件的角色'
              : payload.summary.workUnit === 'series'
                ? '没有符合当前条件的系列'
                : '没有符合条件的作品'
        }}
      </p>
    </div>

    <adaptive-pagination
      v-if="!pending"
      :aria-label="
        view.section === 'characters'
          ? '配音角色分页'
          : payload.summary.workUnit === 'series'
            ? '参与系列分页'
            : '参与作品分页'
      "
      :item-count="payload.items.length"
      :page="payload.pagination.page"
      :page-size="payload.pagination.pageSize"
      page-size-label="每页条目数"
      :page-size-unit="
        view.section === 'characters'
          ? '个角色'
          : payload.summary.workUnit === 'series'
            ? '个系列'
            : '部作品'
      "
      :pending="pending"
      :total="payload.pagination.total"
      @page="request({ page: $event })"
      @page-size="request({ pageSize: $event })"
    />
  </section>
</template>

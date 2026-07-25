<script setup lang="ts">
import {
  NButton,
  NInput,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NTooltip,
} from 'naive-ui';
import type { InputInst } from 'naive-ui';
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue';

import AppIcon from '../../../shared/components/AppIcon.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
import { subjectImageCandidates } from '../../../shared/media/bangumiImage';
import { useCompactLayout } from '../../query/composables/useCompactLayout';
import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import SortDirectionButton from '../../ranking/components/SortDirectionButton.vue';
import { formatHundredths } from '../../ranking/format';
import {
  coStarSortOptions,
  type CoStarParticipant,
  type CoStarSort,
  type CoStarView,
  type CoStarWorkItem,
  updateCoStarView,
} from '../coStar';
import CoStarIcon from './CoStarIcon.vue';

const props = withDefaults(
  defineProps<{
    devicePixelRatio?: number;
    error: string | null;
    executeView: (view: Readonly<CoStarView>) => Promise<boolean>;
    items: readonly CoStarWorkItem[];
    page: number;
    pageSize: 5 | 10 | 20;
    participants: readonly CoStarParticipant[];
    pending: boolean;
    positionLabel: (positionKey: string) => string;
    retry: () => void;
    scope: 'global' | 'personal';
    targetWindow?: Window;
    total: number;
    view: Readonly<CoStarView>;
    workUnit: 'series' | 'subject';
  }>(),
  {
    devicePixelRatio: 1,
    targetWindow: () => window,
  },
);

const compactLayout = useCompactLayout();
const controlSize = computed(() =>
  compactLayout.value ? 'small' : 'medium',
);
const densityMode = ref<'compact' | 'detailed'>('detailed');
const search = ref(props.view.search);
const searchInput = ref<InputInst | null>(null);
const visibleSeriesInfoKey = ref<string | null>(null);
const CAST_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  主役: '主角',
  配角: '配角',
  客串: '客串',
});
let searchTimer: number | undefined;

const compact = computed(() => densityMode.value === 'compact');
const sortOptions = computed(() =>
  [...coStarSortOptions(props.scope, props.workUnit)],
);
const participantNames = computed(
  () =>
    new Map(
      props.participants.map((participant) => [
        participant.person.id,
        participant.person.nameCN ?? participant.person.name,
      ]),
    ),
);
const headingMeta = computed(
  () =>
    `${props.total} ${
      props.workUnit === 'series' ? '个系列' : '部'
    }`,
);
const headingLabel = computed(
  () =>
    `${props.workUnit === 'series' ? '共同系列' : '共同作品'}，${headingMeta.value}`,
);
const emptyText = computed(() => {
  if (props.view.search.trim()) {
    return props.workUnit === 'series'
      ? '没有符合搜索条件的系列'
      : '没有符合搜索条件的作品';
  }
  return props.workUnit === 'series'
    ? '没有共同系列'
    : '没有共同作品';
});

function primaryName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string {
  return entity.nameCN ?? entity.name;
}

function secondaryName(entity: {
  readonly name: string;
  readonly nameCN: string | null;
}): string | null {
  return entity.nameCN && entity.nameCN !== entity.name
    ? entity.name
    : null;
}

function request(patch: Partial<CoStarView>): void {
  void props.executeView(updateCoStarView(props.view, patch));
}

function clearSearchTimer(): void {
  if (searchTimer !== undefined) {
    props.targetWindow.clearTimeout(searchTimer);
    searchTimer = undefined;
  }
}

function requestSearch(): void {
  clearSearchTimer();
  request({ search: search.value });
}

function scheduleSearch(value: string): void {
  search.value = value;
  clearSearchTimer();
  searchTimer = props.targetWindow.setTimeout(requestSearch, 240);
}

async function focusUnit(unitName: string): Promise<void> {
  clearSearchTimer();
  search.value = unitName;
  request({ search: unitName });
  await nextTick();
  searchInput.value?.focus();
}

function entityFor(item: CoStarWorkItem) {
  return item.kind === 'series' ? item.representative : item.subject;
}

function personalScore(item: CoStarWorkItem): number | null | undefined {
  if (item.kind === 'series' && 'personalScore' in item) {
    return item.personalScore as number | null;
  }
  if (item.kind === 'subject' && 'personal' in item) {
    const evidence = item.personal as Readonly<{ score: number | null }>;
    return evidence.score;
  }
  return undefined;
}

function currentScore(item: CoStarWorkItem): number | null {
  return props.scope === 'personal'
    ? (personalScore(item) ?? null)
    : item.globalScore;
}

function collectionUpdatedAt(
  item: CoStarWorkItem,
): string | null | undefined {
  if (
    item.kind === 'series' &&
    'latestCollectionUpdatedAt' in item
  ) {
    return item.latestCollectionUpdatedAt as string | null;
  }
  if (item.kind === 'subject' && 'personal' in item) {
    const evidence = item.personal as Readonly<{
      updatedAt: string | null;
    }>;
    return evidence.updatedAt;
  }
  return undefined;
}

function formattedCollectionDate(
  item: CoStarWorkItem,
): string | null {
  const value = collectionUpdatedAt(item);
  const parts = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return parts ? `${parts[1]}/${parts[2]}/${parts[3]}` : null;
}

function contributionLabel(
  credit: CoStarWorkItem['participants'][number]['credits'][number],
): string {
  if (credit.kind === 'cast') {
    const character = credit.character.nameCN ?? credit.character.name;
    const mappedRole = CAST_ROLE_LABELS[credit.roleLabel];
    const identity = mappedRole ? `声优（${mappedRole}）` : '声优';
    return `${identity}：${character}${
      'workCount' in credit ? ` · ${credit.workCount} 部` : ''
    }`;
  }
  const exact = props.positionLabel(String(credit.exactPositionKey));
  const selected = props.positionLabel(String(credit.positionKey));
  return `${selected === exact ? exact : `${selected} · ${exact}`}${
    'workCount' in credit ? ` · ${credit.workCount} 部` : ''
  }`;
}

function participantRows(item: CoStarWorkItem) {
  return Array.from(
    { length: Math.ceil(item.participants.length / 2) },
    (_, rowIndex) =>
      item.participants.slice(rowIndex * 2, rowIndex * 2 + 2),
  );
}

function participantWorkCount(
  participant: CoStarWorkItem['participants'][number],
): number | null {
  return 'workCount' in participant ? participant.workCount : null;
}

function showSeriesInfo(key: string): void {
  visibleSeriesInfoKey.value = key;
}

function hideSeriesInfo(key: string): void {
  if (visibleSeriesInfoKey.value === key) {
    visibleSeriesInfoKey.value = null;
  }
}

watch(
  () => [props.view.search, props.pending] as const,
  ([value, pending]) => {
    if (!pending) {
      search.value = value;
    }
  },
);
onBeforeUnmount(clearSearchTimer);

defineExpose({ focusUnit });
</script>

<template>
  <div
    class="subject-work-browser co-star-work-browser"
    :aria-busy="pending ? 'true' : undefined"
  >
    <div
      class="section-heading co-star-section-heading subject-work-browser__heading"
    >
      <div class="subject-work-browser__heading-copy">
        <h2 id="co-star-common-works-title">
          {{ workUnit === 'series' ? '共同系列' : '共同作品' }}
        </h2>
        <p
          class="section-heading__meta"
          role="status"
          aria-live="polite"
        >
          {{ headingMeta }}
        </p>
      </div>
      <div class="subject-work-browser__density-toggle">
        <n-radio-group
          v-model:value="densityMode"
          :size="controlSize"
          role="radiogroup"
          :aria-label="
            workUnit === 'series'
              ? '共同系列缩略模式'
              : '共同作品缩略模式'
          "
        >
          <n-radio-button
            value="detailed"
            :title="
              workUnit === 'series'
                ? '显示完整系列信息'
                : '显示完整作品信息'
            "
          >
            <span class="subject-work-browser__density-label">详细</span>
          </n-radio-button>
          <n-radio-button
            value="compact"
            :title="
              workUnit === 'series'
                ? '仅显示代表条目的序号、双语名和系列均分'
                : '仅显示序号、双语名和评分'
            "
          >
            <span class="subject-work-browser__density-label">缩略</span>
          </n-radio-button>
        </n-radio-group>
      </div>
    </div>

    <form
      class="work-list-toolbar co-star-work-toolbar"
      role="search"
      @submit.prevent="requestSearch"
    >
      <n-input
        ref="searchInput"
        :size="controlSize"
        :value="search"
        :clearable="Boolean(search)"
        :placeholder="
          workUnit === 'series'
            ? '搜索系列或系列内作品'
            : '搜索作品'
        "
        autocomplete="off"
        :aria-label="
          workUnit === 'series'
            ? '搜索共同系列或系列内作品'
            : '搜索共同作品'
        "
        :input-props="{
          'aria-label':
            workUnit === 'series'
              ? '搜索共同系列或系列内作品'
              : '搜索共同作品',
          name: 'sharedWorkSearch',
          spellcheck: 'false',
        }"
        @update:value="scheduleSearch"
      >
        <template #prefix><app-icon name="search" :size="16" /></template>
      </n-input>

      <n-select
        :size="controlSize"
        :menu-size="controlSize"
        :value="view.sort"
        :options="sortOptions"
        :consistent-menu-width="false"
        :aria-label="
          workUnit === 'series'
            ? '共同系列排序依据'
            : '共同作品排序依据'
        "
        @update:value="request({ sort: $event as CoStarSort })"
      />

      <sort-direction-button
        :order="view.order"
        :context-label="
          workUnit === 'series'
            ? '共同系列排序方向'
            : '共同作品排序方向'
        "
        @change="request({ order: $event })"
      />
    </form>

    <div
      v-if="error"
      class="co-star-inline-error"
      role="alert"
    >
      <span>{{ error }}</span>
      <n-button
        :size="controlSize"
        secondary
        type="error"
        @click="retry"
      >
        重新加载
      </n-button>
    </div>

    <div
      class="co-star-work-list-boundary"
      :aria-busy="pending ? 'true' : undefined"
    >
      <div
        v-if="pending"
        class="co-star-work-skeletons"
        aria-hidden="true"
      >
        <span v-for="index in Math.min(pageSize, 5)" :key="index" />
      </div>

      <ul
        v-else
        class="subject-work-list person-work-list co-star-work-list"
        :class="{ 'subject-work-list--compact': compact }"
        :aria-label="headingLabel"
      >
        <li
          v-for="(item, index) in items"
          :key="item.key"
          class="subject-work-row person-work-row co-star-work-row"
          :class="{
            'subject-work-row--compact': compact,
            'subject-work-row--with-participants': !compact,
            'subject-work-row--with-series-members':
              !compact &&
              item.kind === 'series' &&
              item.members.length > 0,
          }"
        >
          <template v-if="compact">
            <span
              class="subject-work-row__index"
              :aria-label="`第 ${(page - 1) * pageSize + index + 1} 项`"
            >
              {{ (page - 1) * pageSize + index + 1 }}
            </span>
            <div class="subject-work-row__compact-names">
              <a
                class="subject-work-row__primary-link"
                :href="`https://bgm.tv/subject/${entityFor(item).id}`"
                target="_blank"
                rel="noopener noreferrer"
                :title="primaryName(entityFor(item))"
                :aria-label="`打开${primaryName(entityFor(item))}`"
              >
                <strong>{{ primaryName(entityFor(item)) }}</strong>
              </a>
              <small
                v-if="secondaryName(entityFor(item))"
                class="subject-work-row__secondary"
                :title="secondaryName(entityFor(item)) ?? undefined"
              >
                {{ secondaryName(entityFor(item)) }}
              </small>
            </div>
            <dl
              class="subject-work-row__compact-score"
              :aria-label="`${
                workUnit === 'series' ? '均分' : '评分'
              } ${formatHundredths(currentScore(item))}`"
            >
              <dt class="sr-only">
                {{ workUnit === 'series' ? '均分' : '评分' }}
              </dt>
              <dd aria-hidden="true">
                <span>{{ formatHundredths(currentScore(item)) }}</span>
                <span class="co-star-score-star">★</span>
              </dd>
            </dl>
          </template>

          <template v-else>
            <div class="subject-work-row__work person-work-row__work work-cell">
              <span class="subject-work-row__cover-media" aria-hidden="true">
                <safe-image
                  class="subject-work-row__cover"
                  :sources="
                    subjectImageCandidates(
                      entityFor(item).id,
                      64,
                      devicePixelRatio,
                    )
                  "
                  alt=""
                  decorative
                  :width="64"
                />
              </span>
              <div class="subject-work-row__copy work-cell__copy">
                <div class="subject-work-row__heading">
                  <a
                    class="subject-work-row__primary-link"
                    :href="`https://bgm.tv/subject/${entityFor(item).id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="primaryName(entityFor(item))"
                    :aria-label="`打开${primaryName(entityFor(item))}`"
                  >
                    <strong>{{ primaryName(entityFor(item)) }}</strong>
                  </a>
                  <time
                    v-if="formattedCollectionDate(item)"
                    class="subject-work-row__collection-time"
                    :datetime="collectionUpdatedAt(item) ?? undefined"
                    :title="`收藏于 ${formattedCollectionDate(item)}`"
                  >
                    {{ formattedCollectionDate(item) }}
                  </time>
                </div>
                <small
                  v-if="secondaryName(entityFor(item))"
                  class="subject-work-row__secondary"
                  :title="secondaryName(entityFor(item)) ?? undefined"
                >
                  {{ secondaryName(entityFor(item)) }}
                </small>
                <small
                  v-if="item.kind === 'series'"
                  class="subject-work-row__series-summary"
                >
                  <span>
                    共同参与 {{ item.matchedWorkCount }} 部 · 系列
                    {{ item.memberCount }} 部
                  </span>
                  <n-tooltip
                    :show="visibleSeriesInfoKey === item.key"
                    placement="top-end"
                    trigger="manual"
                    :animated="false"
                  >
                    <template #trigger>
                      <button
                        class="subject-work-row__series-info"
                        type="button"
                        aria-label="系列参与身份数量说明：参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数"
                        :aria-expanded="
                          visibleSeriesInfoKey === item.key
                        "
                        @mouseenter="showSeriesInfo(item.key)"
                        @mouseleave="hideSeriesInfo(item.key)"
                        @focus="showSeriesInfo(item.key)"
                        @blur="hideSeriesInfo(item.key)"
                        @click.stop="showSeriesInfo(item.key)"
                        @keydown.esc.stop.prevent="
                          hideSeriesInfo(item.key)
                        "
                      >
                        <co-star-icon name="info" :size="16" />
                      </button>
                    </template>
                    <span>
                      参与身份标签末尾的数字表示该人物以此身份参与的系列内作品数
                    </span>
                  </n-tooltip>
                </small>
                <ul
                  v-if="item.kind === 'subject' && item.metaTags.length"
                  class="subject-work-row__meta"
                  aria-label="条目属性"
                >
                  <li
                    v-for="tag in item.metaTags.slice(0, 5)"
                    :key="tag"
                  >
                    {{ tag }}
                  </li>
                </ul>
              </div>
            </div>

            <dl
              class="subject-work-row__facts person-work-row__facts"
              :class="{
                'subject-work-row__facts--global':
                  scope === 'global',
              }"
            >
              <div
                class="subject-work-row__score subject-work-row__score--global"
              >
                <dt>
                  {{
                    scope === 'global'
                      ? workUnit === 'series'
                        ? '均分'
                        : '评分'
                      : workUnit === 'series'
                        ? '全站均分'
                        : '全站评分'
                  }}
                </dt>
                <dd>
                  <strong>{{ formatHundredths(item.globalScore) }}</strong>
                </dd>
              </div>
              <div
                v-if="scope === 'personal'"
                class="subject-work-row__score subject-work-row__score--mine"
              >
                <dt>
                  {{ workUnit === 'series' ? '我的均分' : '我的评分' }}
                </dt>
                <dd>
                  <b>{{ formatHundredths(personalScore(item) ?? null) }}</b>
                </dd>
              </div>
            </dl>

            <div class="subject-work-row__participants">
              <div class="shared-work-participants">
                <div
                  v-for="(row, rowIndex) in participantRows(item)"
                  :key="row[0]?.personId"
                  class="shared-work-participant-row"
                >
                  <div
                    v-for="(participant, participantIndex) in row"
                    :key="participant.personId"
                    class="shared-work-participant"
                    :class="{
                      'shared-work-participant--series':
                        item.kind === 'series',
                    }"
                  >
                    <span
                      class="shared-work-participant__index"
                      aria-hidden="true"
                    >
                      {{ rowIndex * 2 + participantIndex + 1 }}
                    </span>
                    <div
                      class="shared-work-participant__body"
                      :class="{
                        'shared-work-participant__body--series':
                          item.kind === 'series',
                      }"
                    >
                      <div class="shared-work-participant__identity">
                        <strong class="shared-work-participant__name">
                          {{
                            participantNames.get(
                              participant.personId,
                            ) ?? `人物 ${participant.personId}`
                          }}
                        </strong>
                        <small
                          v-if="item.kind === 'series'"
                          class="shared-work-participant__support"
                        >
                          参与 {{ participantWorkCount(participant) }} 部
                        </small>
                      </div>
                      <div class="shared-work-participant__roles">
                        <span
                          v-for="(credit, creditIndex) in participant.credits"
                          :key="`${credit.kind}-${String(
                            credit.positionKey,
                          )}-${creditIndex}`"
                          class="co-star-participant-credit"
                          data-provenance="exact"
                        >
                          {{ contributionLabel(credit) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <section
              v-if="item.kind === 'series' && item.members.length"
              class="subject-work-row__series-members"
              :aria-label="`${primaryName(
                entityFor(item),
              )}的系列作品，共 ${item.members.length} 部`"
            >
              <strong class="subject-work-row__series-members-title">
                系列作品（{{ item.members.length }}）
              </strong>
              <ul class="subject-work-row__series-member-list">
                <li v-for="member in item.members" :key="member.id">
                  <a
                    class="subject-work-row__series-member"
                    :href="`https://bgm.tv/subject/${member.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                    :title="primaryName(member)"
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
                      alt=""
                      decorative
                      :width="28"
                    />
                    <span class="subject-work-row__series-member-copy">
                      <span class="subject-work-row__series-member-name">
                        {{ primaryName(member) }}
                      </span>
                      <small
                        v-if="secondaryName(member)"
                        class="subject-work-row__series-member-original"
                      >
                        {{ secondaryName(member) }}
                      </small>
                    </span>
                  </a>
                </li>
              </ul>
            </section>
          </template>
        </li>
        <li
          v-if="!items.length"
          class="subject-work-list__empty person-work-list__empty co-star-ready-empty"
        >
          {{ emptyText }}
        </li>
      </ul>
    </div>

    <adaptive-pagination
      v-if="total > 5"
      class="co-star-work-pagination"
      :aria-busy="pending ? 'true' : undefined"
      :aria-label="
        workUnit === 'series' ? '共同系列分页' : '共同作品分页'
      "
      :item-count="items.length"
      :page="page"
      :page-size="pageSize"
      :page-size-unit="workUnit === 'series' ? '个系列' : '部'"
      :pending="pending"
      :total="total"
      @page="request({ page: $event })"
      @page-size="request({ pageSize: $event })"
    />
  </div>
</template>

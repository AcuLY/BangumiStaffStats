<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';

import AdaptivePagination from '../../ranking/components/AdaptivePagination.vue';
import AppIcon from '../../../shared/components/AppIcon.vue';
import SafeImage from '../../../shared/components/SafeImage.vue';
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
const sortOptions = computed<readonly { label: string; value: PersonDetailSort }[]>(
  () => {
    if (props.view.section === 'characters') {
      return [
        { label: '角色类型', value: 'role' },
        { label: '参与作品数', value: 'workCount' },
        { label: '名称', value: 'name' },
      ];
    }
    return [
      { label: '全站评分', value: 'globalScore' },
      ...(props.payload.scope === 'personal'
        ? [
            { label: '我的评分', value: 'personalScore' as const },
            {
              label: '收藏更新时间',
              value: 'collectionUpdatedAt' as const,
            },
          ]
        : []),
      ...(props.payload.summary.workUnit === 'series'
        ? [{ label: '系列规模', value: 'seriesSize' as const }]
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
watch(
  () => props.payload.person.id,
  () => {
    density.value = 'detailed';
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

function contributionKey(
  contribution: PersonDetailContribution,
): string {
  return [
    contribution.kind,
    contribution.positionKey,
    contribution.kind === 'staff'
      ? contribution.exactPositionKey
      : contribution.character.key,
  ].join('-');
}

function dateLabel(value: string | null | undefined): string {
  if (!value) {
    return '日期未知';
  }
  return value.slice(0, 10);
}

onBeforeUnmount(clearSearchTimer);
</script>

<template>
  <section
    class="person-inspector__section person-item-browser"
    aria-labelledby="person-items-title"
  >
    <header class="person-section-heading person-item-browser__heading">
      <div>
        <h3 id="person-items-title">{{ sectionLabel }}</h3>
        <p aria-live="polite">
          共 {{ payload.pagination.total }} {{ sectionLabel }}
        </p>
      </div>
      <div class="person-segmented-control" role="group" aria-label="列表密度">
        <button
          type="button"
          :aria-pressed="density === 'detailed'"
          @click="density = 'detailed'"
        >
          详细
        </button>
        <button
          type="button"
          :aria-pressed="density === 'compact'"
          @click="density = 'compact'"
        >
          缩略
        </button>
      </div>
    </header>

    <div
      v-if="hasCharacters"
      class="person-section-tabs"
      role="tablist"
      aria-label="人物参与内容"
    >
      <button
        type="button"
        role="tab"
        :aria-selected="view.section === 'works'"
        @click="changeSection('works')"
      >
        {{ workLabel }}
        <span>{{ payload.summary.workCount }}</span>
      </button>
      <button
        type="button"
        role="tab"
        :aria-selected="view.section === 'characters'"
        @click="changeSection('characters')"
      >
        角色
        <span>{{ payload.summary.characterCount }}</span>
      </button>
    </div>

    <form class="person-item-toolbar" role="search" @submit.prevent="submitSearch">
      <label class="person-item-toolbar__search">
        <span class="sr-only">
          {{ view.section === 'characters' ? '搜索角色' : `搜索${workLabel}` }}
        </span>
        <app-icon name="search" :size="17" />
        <input
          :value="search"
          type="search"
          :placeholder="
            view.section === 'characters'
              ? '搜索角色'
              : payload.summary.workUnit === 'series'
                ? '搜索系列或系列内作品'
                : '搜索作品'
          "
          @input="scheduleSearch(($event.target as HTMLInputElement).value)"
        />
      </label>
      <label>
        <span class="sr-only">排序方式</span>
        <select
          :value="view.sort"
          @change="
            request({
              sort: ($event.target as HTMLSelectElement)
                .value as PersonDetailSort,
            })
          "
        >
          <option
            v-for="option in sortOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
      </label>
      <button
        class="person-item-toolbar__order"
        type="button"
        :aria-label="view.order === 'desc' ? '当前降序，切换为升序' : '当前升序，切换为降序'"
        @click="request({ order: view.order === 'desc' ? 'asc' : 'desc' })"
      >
        {{ view.order === 'desc' ? '降序' : '升序' }}
      </button>
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
      <ul v-else-if="payload.items.length" class="person-item-list">
        <li
          v-for="item in payload.items"
          :key="
            isCharacter(item)
              ? item.character.key
              : item.key
          "
          class="person-item"
        >
          <template v-if="isSubject(item)">
            <safe-image
              :sources="
                subjectImageCandidates(
                  item.subject.id,
                  density === 'compact' ? 36 : 54,
                  devicePixelRatio,
                )
              "
              :alt="primaryEntityName(item.subject)"
              decorative
              :width="density === 'compact' ? 36 : 54"
            />
            <div class="person-item__copy">
              <a
                :href="`https://bgm.tv/subject/${item.subject.id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ primaryEntityName(item.subject) }}
              </a>
              <small v-if="secondaryEntityName(item.subject)">
                {{ secondaryEntityName(item.subject) }}
              </small>
              <p v-if="density === 'detailed'">
                {{ dateLabel(item.subject.date) }}
                <template v-if="item.metaTags.length">
                  · {{ item.metaTags.join(' · ') }}
                </template>
              </p>
              <div
                v-if="density === 'detailed'"
                class="person-item__credits"
              >
                <span
                  v-for="contribution in item.contributions"
                  :key="contributionKey(contribution)"
                >
                  {{ contributionDisplay(contribution).label }}
                  <small v-if="contributionDisplay(contribution).detail">
                    {{ contributionDisplay(contribution).detail }}
                  </small>
                </span>
              </div>
            </div>
            <div class="person-item__scores">
              <span>
                <small>全站</small>
                <strong>{{ formatHundredths(item.globalScore) }}</strong>
              </span>
              <span v-if="item.personal">
                <small>我的</small>
                <strong>{{ formatHundredths(item.personal.score) }}</strong>
              </span>
            </div>
          </template>

          <template v-else-if="isSeries(item)">
            <safe-image
              :sources="
                subjectImageCandidates(
                  item.representative.id,
                  density === 'compact' ? 36 : 54,
                  devicePixelRatio,
                )
              "
              :alt="primaryEntityName(item.representative)"
              decorative
              :width="density === 'compact' ? 36 : 54"
            />
            <div class="person-item__copy">
              <a
                :href="`https://bgm.tv/subject/${item.representative.id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ primaryEntityName(item.representative) }}
              </a>
              <small v-if="secondaryEntityName(item.representative)">
                {{ secondaryEntityName(item.representative) }}
              </small>
              <p>
                命中 {{ item.matchedWorkCount }} / {{ item.memberCount }} 部作品
              </p>
              <details v-if="density === 'detailed'">
                <summary>查看系列成员</summary>
                <ul>
                  <li v-for="member in item.members" :key="member.id">
                    <span :class="{ 'is-muted': !member.matched }">
                      {{ primaryEntityName(member) }}
                    </span>
                    <small>{{ member.matched ? '命中' : '未命中' }}</small>
                  </li>
                </ul>
              </details>
              <div
                v-if="density === 'detailed'"
                class="person-item__credits"
              >
                <span
                  v-for="contribution in item.contributions"
                  :key="contributionKey(contribution)"
                >
                  {{ contributionDisplay(contribution).label }}
                  <template v-if="contribution.workCount">
                    · {{ contribution.workCount }} 部
                  </template>
                  <small v-if="contributionDisplay(contribution).detail">
                    {{ contributionDisplay(contribution).detail }}
                  </small>
                </span>
              </div>
            </div>
            <div class="person-item__scores">
              <span>
                <small>全站</small>
                <strong>{{ formatHundredths(item.globalScore) }}</strong>
              </span>
              <span v-if="item.personalScore !== undefined">
                <small>我的</small>
                <strong>{{ formatHundredths(item.personalScore) }}</strong>
              </span>
            </div>
          </template>

          <template v-else-if="isCharacter(item)">
            <safe-image
              :sources="
                characterImageCandidates(
                  item.character.id,
                  density === 'compact' ? 36 : 54,
                  devicePixelRatio,
                )
              "
              :alt="primaryEntityName(item.character)"
              decorative
              :width="density === 'compact' ? 36 : 54"
            />
            <div class="person-item__copy">
              <a
                v-if="item.character.id"
                :href="`https://bgm.tv/character/${item.character.id}`"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ primaryEntityName(item.character) }}
              </a>
              <strong v-else>{{ primaryEntityName(item.character) }}</strong>
              <small v-if="secondaryEntityName(item.character)">
                {{ secondaryEntityName(item.character) }}
              </small>
              <p>{{ item.roleLabel }} · {{ item.workCount }} 部作品</p>
              <ul
                v-if="density === 'detailed'"
                class="person-character-appearances"
              >
                <li
                  v-for="appearance in item.appearances"
                  :key="`${appearance.subject.id}-${appearance.roleType}`"
                >
                  <a
                    :href="`https://bgm.tv/subject/${appearance.subject.id}`"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {{ primaryEntityName(appearance.subject) }}
                  </a>
                  <small>{{ appearance.roleLabel }}</small>
                </li>
              </ul>
            </div>
          </template>
        </li>
      </ul>
      <p v-else class="person-section-empty">
        {{
          view.search.trim()
            ? `没有符合搜索条件的${sectionLabel}`
            : `没有可展示的${sectionLabel}`
        }}
      </p>
    </div>

    <adaptive-pagination
      v-if="!pending"
      aria-label="人物详情列表分页"
      :item-count="payload.items.length"
      :page="payload.pagination.page"
      :page-size="payload.pagination.pageSize"
      page-size-label="每页条目数"
      page-size-unit="项"
      :pending="pending"
      :total="payload.pagination.total"
      @page="request({ page: $event })"
      @page-size="request({ pageSize: $event })"
    />
  </section>
</template>

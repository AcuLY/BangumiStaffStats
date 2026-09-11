<script setup lang="ts">
import {
  AddOutline,
  ArrowDownOutline,
  CheckmarkOutline,
  ChevronBackOutline,
  ChevronDownOutline,
  ChevronForwardOutline,
  CloseOutline,
  CreateOutline,
  ImageOutline,
  MoonOutline,
  OpenOutline,
  PeopleOutline,
  PersonOutline,
  RefreshOutline,
  SearchOutline,
  SunnyOutline,
  WarningOutline,
} from '@vicons/ionicons5';
import InfoIcon from './InfoIcon.vue';

const icons = {
  'arrow-down': ArrowDownOutline,
  check: CheckmarkOutline,
  'chevron-down': ChevronDownOutline,
  'chevron-left': ChevronBackOutline,
  'chevron-right': ChevronForwardOutline,
  close: CloseOutline,
  edit: CreateOutline,
  'external-link': OpenOutline,
  image: ImageOutline,
  moon: MoonOutline,
  people: PeopleOutline,
  person: PersonOutline,
  plus: AddOutline,
  refresh: RefreshOutline,
  search: SearchOutline,
  sun: SunnyOutline,
  warning: WarningOutline,
} as const;

withDefaults(
  defineProps<{
    name: keyof typeof icons | 'info';
    size?: number;
  }>(),
  { size: 18 },
);
</script>

<template>
  <info-icon v-if="name === 'info'" class="app-icon" :size="size" />
  <component
    v-else
    class="app-icon"
    :is="icons[name]"
    :width="size"
    :height="size"
    fill="currentColor"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { CharacterCredit } from '../types'
import {
	characterCreditName,
	characterCreditSecondaryName,
} from '../domain/characterCredits'
import { useWorkbench } from '../composables/useWorkbench'
import SafeImage from './SafeImage.vue'
import WorkbenchTooltip from './WorkbenchTooltip.vue'

withDefaults(defineProps<{
	credits: CharacterCredit[]
	compact?: boolean
	emptyText?: string
	ariaLabel?: string
}>(), {
	compact: false,
	emptyText: '没有符合当前搜索条件的角色。',
	ariaLabel: '配音角色列表',
})

const workbench = useWorkbench()
const characterUrl = (credit: CharacterCredit) => credit.characterId
	? `https://bgm.tv/character/${credit.characterId}`
	: ''
const roleIsProminent = (label: string) => label === '主角'
const MAX_VISIBLE_SOURCES = 2
const visibleSourceCount = (credit: CharacterCredit) => Math.min(MAX_VISIBLE_SOURCES, credit.appearances.length)
const visibleAppearances = (credit: CharacterCredit) => credit.appearances.slice(0, MAX_VISIBLE_SOURCES)
const hiddenSourceCount = (credit: CharacterCredit) => Math.max(0, credit.appearances.length - MAX_VISIBLE_SOURCES)
const sourceTooltipCreditKey = ref<string | null>(null)
const setSourceTooltip = (credit: CharacterCredit, visible: boolean) => {
	if (visible) sourceTooltipCreditKey.value = credit.key
	else if (sourceTooltipCreditKey.value === credit.key) sourceTooltipCreditKey.value = null
}
</script>

<template>
	<ul
		class="character-role-list"
		:class="{ 'character-role-list--compact': compact }"
		:aria-label="`${ariaLabel}，当前页 ${credits.length} 个角色`"
	>
		<li
			v-for="credit in credits"
			:key="credit.key"
			class="character-role-card"
			:class="{ 'character-role-card--compact': compact }"
		>
			<SafeImage
				class="character-role-card__avatar"
				:sources="workbench.characterImageSources(credit.characterId)"
				:alt="characterCreditName(credit)"
				kind="character"
				:width="compact ? 36 : 80"
				:height="compact ? 46 : 110"
				decorative
			/>

			<div class="character-role-card__content">
				<div class="character-role-card__names">
					<a
						v-if="characterUrl(credit)"
						class="character-role-card__name-link"
						:href="characterUrl(credit)"
						target="_blank"
						rel="noopener noreferrer"
						:title="characterCreditName(credit)"
						:aria-label="`在 Bangumi 查看${characterCreditName(credit)}`"
					>
						<strong>{{ characterCreditName(credit) }}</strong>
					</a>
					<strong v-else class="character-role-card__name" :title="characterCreditName(credit)">{{ characterCreditName(credit) }}</strong>
					<small
						v-if="characterCreditSecondaryName(credit)"
						:title="characterCreditSecondaryName(credit)"
					>{{ characterCreditSecondaryName(credit) }}</small>
				</div>

				<WorkbenchTooltip
					v-if="!compact"
					:show="sourceTooltipCreditKey === credit.key"
					:disabled="!hiddenSourceCount(credit)"
					trigger="manual"
					placement="top-start"
				>
					<template #trigger>
						<ul
							class="character-role-card__appearances"
							:aria-label="`${characterCreditName(credit)}出演 ${credit.subjectCount} 部作品`"
							:tabindex="hiddenSourceCount(credit) ? 0 : undefined"
							@mouseenter="setSourceTooltip(credit, true)"
							@mouseleave="setSourceTooltip(credit, false)"
							@focusin="setSourceTooltip(credit, true)"
							@focusout="setSourceTooltip(credit, false)"
						>
							<li
								v-for="(appearance, index) in visibleAppearances(credit)"
								:key="appearance.subject.id"
								class="character-role-card__appearance"
							>
								<span
									class="character-role-card__role"
									:class="{ 'is-prominent': roleIsProminent(appearance.roleLabel) }"
								>{{ appearance.roleLabel }}</span>
								<a
									:href="`https://bgm.tv/subject/${appearance.subject.id}`"
									target="_blank"
									rel="noopener noreferrer"
									:title="workbench.subjectName(appearance.subject)"
								>{{ workbench.subjectName(appearance.subject) }}</a>
								<span
									v-if="index === visibleSourceCount(credit) - 1 && hiddenSourceCount(credit)"
									class="character-role-card__source-more"
								>… +{{ hiddenSourceCount(credit) }}</span>
							</li>
						</ul>
					</template>
					<div
						class="character-role-source-tooltip"
						role="list"
						:aria-label="`全部出演作品，共 ${credit.subjectCount} 部`"
					>
						<span v-for="appearance in credit.appearances" :key="`full-${appearance.subject.id}`" role="listitem">
							<b>{{ appearance.roleLabel }}</b>{{ workbench.subjectName(appearance.subject) }}
						</span>
					</div>
				</WorkbenchTooltip>
			</div>
		</li>
		<li v-if="!credits.length" class="character-role-list__empty">{{ emptyText }}</li>
	</ul>
</template>

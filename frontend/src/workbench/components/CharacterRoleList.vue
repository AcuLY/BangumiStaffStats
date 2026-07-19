<script setup lang="ts">
import type { CharacterCredit } from '../types'
import {
	characterCreditName,
	characterCreditSecondaryName,
} from '../domain/characterCredits'
import { useWorkbench } from '../composables/useWorkbench'
import AdaptiveAppearanceList from './AdaptiveAppearanceList.vue'
import SafeImage from './SafeImage.vue'

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

				<AdaptiveAppearanceList v-if="!compact" :credit="credit" :character-name="characterCreditName(credit)" />
			</div>
		</li>
		<li v-if="!credits.length" class="character-role-list__empty">{{ emptyText }}</li>
	</ul>
</template>

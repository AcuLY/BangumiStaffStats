<script setup lang="ts">
import { computed } from 'vue'
import { useThemeVars } from 'naive-ui'
import type { ButtonProps } from 'naive-ui'
import type { SubjectWorkSortOrder } from '../composables/useSubjectWorkBrowser'
import { useWorkbench } from '../composables/useWorkbench'
import AppIcon from './AppIcon.vue'

type SortDirectionButtonSize = 'tiny' | 'small' | 'medium' | 'large'

const props = withDefaults(defineProps<{
	order: SubjectWorkSortOrder
	contextLabel: string
	size?: SortDirectionButtonSize
}>(), {
	size: 'medium',
})

const emit = defineEmits<{
	'update:order': [value: SubjectWorkSortOrder]
}>()

const workbench = useWorkbench()
const themeVars = useThemeVars()
const ascending = computed(() => props.order === 'asc')
const nextOrder = computed<SubjectWorkSortOrder>(() => ascending.value ? 'desc' : 'asc')
const currentLabel = computed(() => ascending.value ? '升序' : '降序')
const nextLabel = computed(() => ascending.value ? '降序' : '升序')
const accessibleLabel = computed(() => `${props.contextLabel}：当前${currentLabel.value}，切换为${nextLabel.value}`)
const buttonThemeOverrides = computed<NonNullable<ButtonProps['themeOverrides']>>(() => {
	const vars = themeVars.value
	const defaultBorder = workbench.theme.value === 'dark'
		? '1px solid transparent'
		: `1px solid ${vars.borderColor}`

	return {
		color: vars.inputColor,
		colorHover: vars.inputColor,
		colorPressed: vars.inputColor,
		colorFocus: vars.inputColor,
		colorDisabled: vars.inputColorDisabled,
		textColor: vars.textColor2,
		textColorHover: vars.textColor2,
		textColorPressed: vars.textColor2,
		textColorFocus: vars.textColor2,
		textColorDisabled: vars.textColorDisabled,
		border: defaultBorder,
		borderHover: `1px solid ${vars.primaryColorHover}`,
		borderPressed: `1px solid ${vars.primaryColor}`,
		borderFocus: `1px solid ${vars.primaryColorHover}`,
		borderDisabled: defaultBorder,
	}
})
const buttonStyle = computed(() => ({
	'--sort-direction-icon-color': themeVars.value.iconColor,
	'--sort-direction-focus-shadow': workbench.theme.value === 'dark'
		? `0 0 8px 0 color-mix(in srgb, ${themeVars.value.primaryColor} 40%, transparent)`
		: `0 0 0 2px color-mix(in srgb, ${themeVars.value.primaryColor} 20%, transparent)`,
}))
</script>

<template>
	<n-button
		class="sort-direction-button"
		:class="`sort-direction-button--${size}`"
		:size="size"
		:theme-overrides="buttonThemeOverrides"
		:style="buttonStyle"
		attr-type="button"
		:aria-label="accessibleLabel"
		:title="accessibleLabel"
		@click="emit('update:order', nextOrder)"
	>
		<span class="sort-direction-button__content">
			<span>{{ currentLabel }}</span>
			<AppIcon
				class="sort-direction-button__icon"
				:class="{ 'is-ascending': ascending }"
				name="chevron"
				:size="16"
			/>
		</span>
	</n-button>
</template>

<style scoped>
.sort-direction-button {
	display: grid;
	justify-content: stretch;
	white-space: nowrap;
}

.sort-direction-button:focus-visible {
	box-shadow: var(--sort-direction-focus-shadow);
}

.sort-direction-button__content {
	display: flex;
	align-items: center;
	justify-content: flex-start;
	gap: var(--space-1);
	width: 100%;
	min-width: 0;
}

.sort-direction-button--tiny,
.sort-direction-button--small {
	width: 66px;
}

.sort-direction-button--medium {
	width: 70px;
}

.sort-direction-button--large {
	width: 72px;
}

.sort-direction-button--tiny .sort-direction-button__content {
	width: calc(100% - 9px);
	margin-left: 6px;
}

.sort-direction-button--small .sort-direction-button__content {
	width: calc(100% - 1px);
	margin-left: 2px;
}

.sort-direction-button--medium .sort-direction-button__content {
	width: calc(100% + 8px);
	margin-right: -6px;
	margin-left: -2px;
}

.sort-direction-button--large .sort-direction-button__content {
	width: calc(100% + 14px);
	margin-right: -8px;
	margin-left: -6px;
}

.sort-direction-button__icon {
	flex: 0 0 16px;
	color: var(--sort-direction-icon-color);
	transform: rotate(0deg);
	transition: transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.sort-direction-button__icon.is-ascending {
	transform: rotate(180deg);
}

@media (prefers-reduced-motion: reduce) {
	.sort-direction-button__icon {
		transition: none;
	}
}
</style>

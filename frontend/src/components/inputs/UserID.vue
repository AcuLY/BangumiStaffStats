<script setup lang="ts">
import { SECONDARY_COLOR } from '@/constants/themes'
import { INPUT_TYPE } from '@/constants/types'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const inputStore = useInputStore()
const { input } = storeToRefs(inputStore)
const { userID, isGlobal } = toRefs(input.value)
</script>

<template>
	<InputCard :type="INPUT_TYPE.USER_ID">
		<template #header-extra>
			<n-tooltip>
				<template #trigger>
					<span class="hint"> 什么是 UID? </span>
				</template>
				进入你在
				<a href="https://bgm.tv" target="_blank" :style="{ color: SECONDARY_COLOR }">Bangumi</a>
				的个人主页，<br />
				查看链接的最后一项，<br />
				如 <span>https://bgm.tv/user/lucay126</span><br />
				的 uid 就是 <span>lucay126</span>
			</n-tooltip>
		</template>

		<n-input
			v-model:value="userID"
			type="text"
			placeholder="请输入用户 ID（不是昵称）"
			:disabled="isGlobal"
			clearable
		/>
	</InputCard>
</template>

<style scoped>
.hint {
	font-weight: bold;
	padding-left: 4px;
	color: var(--color-primary);
	opacity: 0.6;
	margin-left: 0px;
	text-decoration: underline;
	text-underline-offset: 4px;
}
</style>

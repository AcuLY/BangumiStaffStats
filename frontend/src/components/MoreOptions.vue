<script setup lang="ts">
import { INPUT_TYPE } from '@/constants/types'
import { useGlobalStore } from '@/stores/global'
import { useInputStore } from '@/stores/input'
import { storeToRefs } from 'pinia'

const globalStore = useGlobalStore()

const inputStore = useInputStore()
const { showMoreOptions } = storeToRefs(inputStore)
</script>

<template>
	<n-drawer v-model:show="showMoreOptions" :width="globalStore.isMobile ? 320 : 630">
		<n-drawer-content>
			<template #header>
				<h3 style="margin: 4px 0">更多选项</h3>
			</template>
			<n-flex class="more-options-wrapper">
				<OptionEnabler :type="INPUT_TYPE.IS_GLOBAL" />
				<OptionEnabler :type="INPUT_TYPE.SHOW_NSFW" />
				<OptionEnabler :type="INPUT_TYPE.DATE_RANGE" />
				<OptionEnabler :type="INPUT_TYPE.RATE_RANGE" />
				<OptionEnabler :type="INPUT_TYPE.FAVORITE_RANGE" />
				<OptionEnabler :type="INPUT_TYPE.POSITIVE_TAGS" />
				<OptionEnabler :type="INPUT_TYPE.NEGATIVE_TAGS" />
			</n-flex>
		</n-drawer-content>
	</n-drawer>
</template>

<style scoped>
.more-options-wrapper {
	padding-bottom: 40px;
}
</style>

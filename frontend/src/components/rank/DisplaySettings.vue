<script setup lang="ts">
import { useDisplayStore } from '@/stores/display'
import { useGlobalStore } from '@/stores/global'
import { useRequestStore } from '@/stores/request'
import { storeToRefs } from 'pinia'

const globalStore = useGlobalStore()

const requestStore = useRequestStore()
const { isCV, updateAndFetch } = requestStore

const displayStore = useDisplayStore()
const displayStoreRefs = storeToRefs(displayStore)

const handleClickShowCharacter = async (): Promise<void> => {
	displayStoreRefs.hasShowCharacterRequest.value = !displayStoreRefs.hasShowCharacterRequest.value
	await updateAndFetch(false)
}

const handleClickMergeSeries = async (): Promise<void> => {
	displayStoreRefs.hasMergeSeriesRequest.value = !displayStoreRefs.hasMergeSeriesRequest.value
	await updateAndFetch(false)
}
</script>

<template>
	<n-flex vertical>
		<n-collapse class="setting-wrapper">
			<n-collapse-item>
				<template #header>
					<span class="setting-title"> 显示设置 </span>
				</template>

				<n-flex
					class="switch-wrapper"
					justify="flex-start"
					:size="globalStore.isMobile ? 'small' : 'medium'"
				>
					<Switch v-model="displayStoreRefs.showChinese.value" label="显示中文" />
					<Switch
						v-model="displayStoreRefs.showImage.value"
						label="显示图片"
						v-show="!requestStore.request.isGlobal"
					/>
					<Switch
						v-model="displayStoreRefs.showCharacter.value"
						label="显示角色"
						v-show="isCV"
						:callback="handleClickShowCharacter"
					/>
					<Switch
						v-model="displayStoreRefs.mergeSeries.value"
						label="合并续作"
						v-show="!displayStoreRefs.showCharacter.value"
						:callback="handleClickMergeSeries"
					/>

					<n-flex class="slider-wrapper" vertical>
						行最大高度
						<n-slider
							class="slider"
							v-model:value="displayStoreRefs.rowHeight.value"
							:max="1000"
							:min="100"
							:step="20"
						/>

						列表最大高度
						<n-slider
							class="slider"
							v-model:value="displayStoreRefs.tableHeight.value"
							:max="6000"
							:min="400"
							:step="20"
						/>
					</n-flex>
				</n-flex>
			</n-collapse-item>
		</n-collapse>
	</n-flex>
</template>

<style scoped>
.setting-wrapper {
	width: 90vw;
	padding: 10px 0 20px 0;
}

.setting-title {
	font-size: large;
	color: #666666;
	font-weight: bold;
	user-select: none;
}

.switch-wrapper {
	width: 90vw;
	font-weight: bold;
}

.slider-wrapper {
	width: 90vw;
	color: #666666;
	font-size: larger;
}

.slider {
	max-width: 480px;
}

@media (max-width: 768px) {
	.setting-wrapper {
		padding: 4px 0 8px 0;
	}

	.setting-title {
		font-size: medium;
	}

	.slider-wrapper {
		font-size: 14px;
	}
}
</style>

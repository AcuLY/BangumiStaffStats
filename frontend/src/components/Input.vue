<template>
    <div class="input-wrapper">
        <n-flex class="input" justify="center">
            <n-flex justify="center">
                <n-flex class="option" vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">Bangumi 用户 ID
                        <n-tooltip>
                            <template #trigger>
                                <span
                                    style="padding-left: 4px;color: #FF1493; opacity: 0.6; margin-left: 0px; text-decoration: underline; text-underline-offset: 4px;">
                                    什么是ID?
                                </span>
                            </template>
                            进入你在 <span color="#FF1493">Bangumi</span> 的个人主页，<br />
                            查看链接的最后一项，<br />
                            如 <span>https://bgm.tv/user/lucay126</span><br />
                            的 uid 就是 <span>lucay126</span>
                        </n-tooltip>
                    </h3>
                    <n-input id="user-name" v-model:value="userId" type="text" placeholder="请输入用户 ID"
                        :disabled="isGlobalStats" :size="isMob" />
                </n-flex>

                <n-flex class="option" vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">条目类型</h3>
                    <n-select id="subject-type" v-model:value="subjectType" :options="subjectTypeOptions"
                        placeholder="请选择条目类型" clearable filterable />
                </n-flex>

                <n-flex class="option" vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">职位</h3>
                    <n-select id="position" v-model:value="position" :options="positionOptions[subjectType]"
                        placeholder="请选择职位" clearable filterable />
                </n-flex>

                <n-flex class="option" vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">收藏类型</h3>
                    <n-checkbox-group v-model:value="collectionTypes" id="collection-type" :disabled="isGlobalStats">
                        <n-space item-style="display: flex;">
                            <n-checkbox :value="2" :label="actionName + '过'" size="large" />
                            <n-checkbox :value="3" :label="'在' + actionName" size="large" />
                            <n-checkbox :value="4" label="搁置" size="large" />
                            <n-checkbox :value="5" label="抛弃" size="large" />
                        </n-space>
                    </n-checkbox-group>
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enableIsGlobalStats">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">数据来源</h3>
                        <n-tooltip trigger="hover">
                            <template #trigger>
                                <img src="/info.png" style="width: 20px;" :style="{ marginLeft: '14px' }">
                            </template>
                            查询全站使用 Bangumi 全站的条目和分数
                        </n-tooltip>
                    </div>
                    <n-radio-group v-model:value="isGlobalStats" size="large"
                        style="width: 300px; margin-left: 10px; margin-right: 10px; ">
                        <n-space justify="space-between">
                            <n-radio v-for="src in statsSources" :key="src.value" :value="src.value" id="stats-source">
                                {{ src.label }}
                            </n-radio>
                        </n-space>
                    </n-radio-group>
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enableDateRange">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">日期范围</h3>
                    </div>
                    <n-date-picker class="date-picker" v-model:value="dateRange" update-value-on-close type="monthrange"
                        clearable :actions="null" />
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enableRateRange">
                    <n-flex justify="space-between">
                        <h3 style="margin: 0; transform: translateX(10px);">分数范围</h3>
                    </n-flex>
                    <n-flex class="input-number-wrapper" justify="space-between">
                        <n-input-number class="input-number" v-model:value="minRate" :step="0.5" :max="10" :min="0"
                            button-placement="both" />
                        <span style="font-size: large;">~</span>
                        <n-input-number class="input-number" v-model:value="maxRate" :step="0.5" :max="10" :min="0"
                            button-placement="both" />
                    </n-flex>
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enableFavoriteRange">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">收藏人数范围</h3>
                    </div>
                    <n-flex class="input-number-wrapper" justify="space-between">
                        <n-input-number class="input-number" v-model:value="minFavorite" :step="100" :min="0"
                            button-placement="both" />
                        <span style="font-size: large;">~</span>
                        <n-input-number class="input-number" v-model:value="maxFavorite" :step="100" :min="0"
                            button-placement="both" />
                    </n-flex>
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enablePositiveTags">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">正向标签</h3>
                        <n-tooltip trigger="hover">
                            <template #trigger>
                                <img src="/info.png" style="width: 20px;" :style="{ marginLeft: '14px' }">
                            </template>
                            在单个标签里添加 "/" 可以表示“或”，<br>
                            例："原创/漫画改, 百合" <br>
                            以上两个标签表示“有百合标签的原创或漫画改作品”。
                        </n-tooltip>
                    </div>
                    <n-dynamic-tags v-model:value="positiveTags" id="tags" round
                        :color="{ borderColor: '#FF1493', textColor: '#FF1493' }" />
                </n-flex>

                <n-flex class="option" vertical :size="5" v-show="enableNegativeTags">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">反向标签</h3>
                        <n-tooltip trigger="hover">
                            <template #trigger>
                                <img src="/info.png" style="width: 20px;" :style="{ marginLeft: '14px' }">
                            </template>
                            在单个标签里添加 "+" 可以表示“与”，<br>
                            例："原创, 百合+后宫" <br>
                            以上两个标签表示“排除所有原创作品，然后排除所有同时有百合和后宫标签的作品”。<br>
                            nsfw 标签会屏蔽所有 r18、里番类的条目
                        </n-tooltip>
                    </div>
                    <n-dynamic-tags v-model:value="negativeTags" id="tags" round
                        :color="{ borderColor: '#FF1493', textColor: '#FF1493' }" />
                </n-flex>

                <n-flex class="option" style="height: 84px; border: dashed 1px #ff149173;" vertical :size="5" justify="center">
                    <n-flex id="option-setting">
                        <n-checkbox v-model:checked="enableIsGlobalStats">数据来源</n-checkbox>
                        <n-checkbox v-model:checked="enableDateRange">日期范围</n-checkbox>
                        <n-checkbox v-model:checked="enableRateRange">分数范围</n-checkbox>
                        <n-checkbox v-model:checked="enableFavoriteRange">收藏人数</n-checkbox>
                        <n-checkbox v-model:checked="enablePositiveTags">正向标签</n-checkbox>
                        <n-checkbox v-model:checked="enableNegativeTags">反向标签</n-checkbox>
                    </n-flex>
                </n-flex>

            </n-flex>

            <n-flex>
                <n-button id="fetch-button" @click="fetch_statistics" type="primary" :disabled="isLoading">
                    查询
                </n-button>
                <n-button id="fetch-button" @click="cancelRequest" strong secondary type="primary"
                    :disabled="!isLoading">
                    取消查询
                </n-button>
            </n-flex>
        </n-flex>
    </div>

    <n-divider style="margin-bottom: 14px;">
        <n-flex justify="center" style="width: 70vw;" v-show="userIdSave !== ''">
            <h2 class="divider-text" v-show="userIdSave !== ''">当前用户：<span style="color: #FF1493;">{{ userIdSave
            }}</span>
            </h2>
            <h2 class="divider-text" v-show="subjectTypeLabel !== ''">条目类型：<span style="color: #FF1493;">{{
                subjectTypeLabel
                    }}</span></h2>
            <h2 class="divider-text" v-show="positionSave !== null">当前职位：<span style="color: #FF1493;">{{ positionLabel
            }}</span></h2>
            <h2 class="divider-text" v-show="collectionTypesSave !== null && userIdSave !== '全站数据'">收藏类型：<span
                    style="color: #FF1493;">{{ collectionTypesLabels }}</span></h2>
            <h2 class="divider-text" v-show="dateRangeLabel">日期范围：<span style="color: #FF1493;">{{ dateRangeLabel
            }}</span></h2>
            <h2 class="divider-text" v-show="rateRangeLabel">分数范围：<span style="color: #FF1493;">{{ rateRangeLabel
            }}</span></h2>
            <h2 class="divider-text" v-show="favoriteRangeLabel">收藏人数范围：<span style="color: #FF1493;">{{
                favoriteRangeLabel
                    }}</span></h2>
            <h2 class="divider-text" v-show="positiveTagsLabel">正向标签：<span style="color: #FF1493;">{{ positiveTagsLabel
                    }}</span></h2>
            <h2 class="divider-text" v-show="negativeTagsLabel">反向标签：<span style="color: #FF1493;">{{ negativeTagsLabel
                    }}</span></h2>
        </n-flex>
    </n-divider>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue';
import axios from 'axios';
import { useStore } from 'vuex';
import { useNotification } from 'naive-ui';
import { subjectTypeOptions, positionOptions } from '@/constants/options.js';

const store = useStore();

const isLoading = computed(() => store.state.isLoading);    // 加载状态

const notify = useNotification();   // 用于发送通知

const abortController = ref(null);  // 终止请求

// 用户 id , 条目类型, 查询的职位, 收藏类型
const userId = ref(`${import.meta.env.VITE_API_USERID}`);
const subjectType = ref(2)
const position = ref(`${import.meta.env.VITE_API_POSITION}`);
const collectionTypes = ref([2]);
const isGlobalStats = ref(false);
const statsSources = [{ label: '当前用户', value: false }, { label: 'Bangumi 全站', value: true }]
const positiveTags = ref([])
const negativeTags = ref(["nsfw"])
const dateRange = ref(null)
const minRate = ref(null)
const maxRate = ref(null)
const minFavorite = ref(null)
const maxFavorite = ref(null)

// 开启选项
const enableIsGlobalStats = ref(false);
const enableDateRange = ref(false);
const enableRateRange = ref(false);
const enableFavoriteRange = ref(false);
const enablePositiveTags = ref(false);
const enableNegativeTags = ref(false);

const actionName = computed(() => {
    if (subjectType.value == 3) {
        return '听';
    }
    if (subjectType.value == 4) {
        return '玩';
    }
    return '看';
})

// 如果是从主页跳转则提取 userId
onMounted(() => {
    const currentUrl = window.location.pathname;
    if (currentUrl !== '/' && currentUrl.split('/').length > 1) {
        window.history.replaceState({}, '', '/');
    }

    const urlUserId = new URLSearchParams(window.location.search).get('user');
    if (urlUserId) {
        userId.value = urlUserId;
    }
    // 移除查询参数的操作
    const url = new URL(window.location);
    url.search = '';
    window.history.replaceState({}, '', url);
});

// 换条目类型时清空职位
watch(subjectType, () => {
    position.value = null;
});

// 上一次查询的值
const userIdSave = ref('');
const subjectTypeSave = ref(null);
const subjectTypeLabel = computed(() => {
    switch (subjectTypeSave.value) {
        case 1:
            return '书籍';
        case 2:
            return '动画';
        case 3:
            return '音乐';
        case 4:
            return '游戏';
        case 5:
            return '影视';
        default:
            return '';
    }
});
const positionSave = ref(null);
const positionLabel = computed(() => {
    const selectedOption = positionOptions[subjectType.value].find(option => option.value === positionSave.value);
    return selectedOption ? selectedOption.label : '';
});
const collectionTypesSave = ref(null);
const collectionTypesLabels = computed(() => {
    let results = '';
    if (collectionTypesSave.value) {
        if (collectionTypesSave.value.includes(2)) {
            results += `${actionName.value}过 `;
        }
        if (collectionTypesSave.value.includes(3)) {
            results += `在${actionName.value} `;
        }
        if (collectionTypesSave.value.includes(4)) {
            results += `搁置 `;
        }
        if (collectionTypesSave.value.includes(5)) {
            results += `抛弃 `;
        }
    }
    return results;
});

const timestampToMonth = (timestamp) => {
    const date = new Date(timestamp);
    return `${date.getFullYear()} 年 ${String(date.getMonth() + 1).padStart(2, '0')} 月`;
};
const timestampToIsoString = (timestamp) => {
    const date = new Date(timestamp);
    return date.toISOString();
};
const DEFAULT_DATE_RANGE = [-631180800000, new Date()];
const calcDateRangeValue = () => {
    if (!enableDateRange.value || !dateRange.value) {
        return [];
    }
    const begin = dateRange.value[0] ? dateRange.value[0] : DEFAULT_DATE_RANGE[0];
    let end = dateRange.value[1] ? dateRange.value[1] : DEFAULT_DATE_RANGE[1];

    // 确保结束日期是当月的最后一天
    const endDate = new Date(end);
    endDate.setMonth(endDate.getMonth() + 1);
    endDate.setDate(0); // 设置为上个月的最后一天
    end = endDate.getTime();

    return [timestampToIsoString(begin), timestampToIsoString(end)];
}
const calcDateRangeLabel = () => {
    if (!enableDateRange.value) {
        return '';
    }
    if (!dateRange.value || dateRange.value.length === 0) {
        return timestampToMonth(DEFAULT_DATE_RANGE[0]) + ' ~ ' + timestampToMonth(DEFAULT_DATE_RANGE[1]);
    }
    const start = dateRange.value[0] ? timestampToMonth(dateRange.value[0]) : timestampToMonth(DEFAULT_DATE_RANGE[0]);
    const end = dateRange.value[1] ? timestampToMonth(dateRange.value[1]) : timestampToMonth(DEFAULT_DATE_RANGE[1]);
    return `${start} ~ ${end}`;
};
const dateRangeLabel = ref('');

const calcRateRangeValue = () => {
    if (!enableRateRange.value) {
        return [];
    }
    const min = minRate.value ? minRate.value : 0;
    const max = maxRate.value ? maxRate.value : 10;
    return [min, max];
};
const calcRateRangeLabel = () => {
    if (!enableRateRange.value) {
        return '';
    }
    const min = minRate.value ? minRate.value : 0;
    const max = maxRate.value ? maxRate.value : 10;
    return `${min} ~ ${max}`;
};
const rateRangeLabel = ref('');

const calcFavoriteRangeValue = () => {
    if (!enableFavoriteRange.value) {
        return [];
    }
    const min = minFavorite.value ? minFavorite.value : 0;
    const max = maxFavorite.value ? maxFavorite.value : 100000;
    return [min, max];
};
const calcFavoriteRangeLabel = () => {
    if (!enableFavoriteRange.value) {
        return '';
    }
    const min = minFavorite.value ? minFavorite.value : 0;
    const max = maxFavorite.value ? maxFavorite.value : 100000;
    return `${min} ~ ${max}`;
};
const favoriteRangeLabel = ref('');

const calcPositiveTagsValue = () => { return enablePositiveTags.value ? positiveTags.value : [] };
const calcPositiveTagsLabel = () => {
    if (!enablePositiveTags.value) {
        return ''
    }
    return positiveTags.value.join('、');
};
const positiveTagsLabel = ref('');

const calcNegativeTagsValue = () => { return enableNegativeTags.value ? negativeTags.value : [] };
const calcNegativeTagsLabel = () => {
    if (!enableNegativeTags.value) {
        return ''
    }
    return negativeTags.value.join('、');
};
const negativeTagsLabel = ref('');

const calcShowNSFWValue = () => { return !enableNegativeTags.value || !negativeTags.value.includes("nsfw") };


// 抓取数据并更新到 store
const fetch_statistics = async () => {
    // 输入不能为空
    if (!userId.value.trim() && !isGlobalStats.value) {
        notify.error({
            title: "请输入用户 ID",
            duration: 3000
        });
        return;
    }
    if (!subjectType.value) {
        notify.error({
            title: "请选择条目类型",
            duration: 3000
        });
        return;
    }
    if (!position.value) {
        notify.error({
            title: "请选择职位",
            duration: 3000
        });
        return;
    }
    if (collectionTypes.value.length === 0 && !isGlobalStats.value) {
        notify.error({
            title: "请选择至少一种收藏类型",
            duration: 3000
        });
        return;
    }
    // 参数
    const url = `${import.meta.env.VITE_API_URL}/statistics`;
    const params = {
        user_id: isGlobalStats.value ? '0' : userId.value,    // 查全站时把 id 设为 0
        subject_type: subjectType.value,
        position: position.value,
        collection_types: collectionTypes.value,
        date_range: calcDateRangeValue(),
        rate_range: calcRateRangeValue(),
        favorite_range: calcFavoriteRangeValue(),
        positive_tags: calcPositiveTagsValue(),
        negative_tags: calcNegativeTagsValue(),
        show_nsfw: calcShowNSFWValue(),
    }
    // 终止查询
    abortController.value = new AbortController();
    // 记录上次查询
    userIdSave.value = isGlobalStats.value ? '全站数据' : userId.value;
    subjectTypeSave.value = subjectType.value;
    positionSave.value = position.value;
    collectionTypesSave.value = collectionTypes.value;
    dateRangeLabel.value = calcDateRangeLabel();
    rateRangeLabel.value = calcRateRangeLabel();
    favoriteRangeLabel.value = calcFavoriteRangeLabel();
    positiveTagsLabel.value = calcPositiveTagsLabel();
    negativeTagsLabel.value = calcNegativeTagsLabel();
    // 开始加载
    store.dispatch('setLoadingStatus');
    // 调用并接受返回值
    axios.post(url, params, { signal: abortController.value.signal })
        .then(response => {
            store.dispatch('setLists', {
                validSubjects: response.data['valid_subjects'],
                collectionNumber: response.data['collection_number'],
                seriesNumber: response.data['series_number'],
                subjectType: subjectTypeSave,
                isGlobalStats: isGlobalStats.value
            });
            store.dispatch('setLoadingStatus');
        })
        .catch(error => {
            store.dispatch('setLoadingStatus');
            const message = error.response?.data?.error;
            if (axios.isCancel(error)) {
                store.dispatch('setLoadingStatus');
                notify.warning({
                    title: "查询取消",
                    duration: 3000
                });
            } else if (!error.response) {
                store.dispatch('setListsToNull');
                notify.error({
                    title: "服务暂未启动或无法连接，请过一段时间再来",
                    duration: 8000
                });
            } else {
                store.dispatch('setListsToNull');
                notify.error({
                    title: "查询失败：" + message,
                    duration: 8000
                });
            }
        })
};

const cancelRequest = () => {
    store.dispatch('setLoadingStatus');
    if (abortController.value) {
        abortController.value.abort();
    }
};

</script>

<style scoped>
.input-wrapper {
    display: flex;
    justify-content: center;
}

.input {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 90vw;
}

.option {
    border: solid 1px #ff149173;
    border-radius: 8px;
    padding: 6px 0 12px 0;
    box-sizing: border-box;
}

#user-name {
    width: 300px;
    height: 35px;
    margin-left: 10px;
    margin-right: 10px;
}

#subject-type {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

#position {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

#collection-type {
    width: 300px;
    height: 35px;
    margin-left: 10px;
    margin-right: 10px;
    transform: translateY(4px);
}

#tags {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

#stats-source {
    transform: translateY(4px);
}

.date-picker {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

.input-number-wrapper {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

.input-number {
    width: 120px;
}

#option-setting {
    width: 300px;
    margin-left: 10px;
    margin-right: 10px;
}

#fetch-button {
    width: 100px;
    transform: translateY(8px);
}

.divider-text {
    margin: 0px 10px 0px 10px;
    font-size: 20px;
}

@media (max-width: 600px) {
    .option {
        font-size: 12px;
    }

    .title {
        font-size: 24px;
    }

    .divider-text {
        font-size: 14px;
        margin: 0px 10px 0px 10px;
    }
}
</style>
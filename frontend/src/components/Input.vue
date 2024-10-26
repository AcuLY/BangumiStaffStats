<template>
    <div class="input-wrapper">
        <n-flex class="input" justify="center">
            <n-flex justify="center">
                <n-flex vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">Bangumi 用户 ID</h3>
                    <n-input 
                    id="user-name" 
                    v-model:value="userId" 
                    type="text" 
                    placeholder="请输入用户 ID" 
                    :disabled="isGlobalStats"
                    />
                </n-flex>

                <n-flex vertical :size="5">
                    <div style="display: flex; align-items: center;">
                        <h3 style="margin: 0; transform: translateX(10px);">数据范围</h3>
                        <n-tooltip trigger="hover">
                            <template #trigger>
                            <img src="/info.png" style="width: 20px;" :style="{marginLeft: '14px'}">
                            </template>
                            查询全站使用 Bangumi 全站的条目和分数，<br>
                            而非个人收藏条目与评分<br>
                            （仅统计在看+看过+搁置+抛弃 >100 的条目）
                        </n-tooltip>
                    </div>
                    <n-radio-group v-model:value="isGlobalStats" size="large" style="width: 300px; margin-left: 10px; margin-right: 10px;">
                        <n-space justify="space-between"> 
                        <n-radio v-for="src in statsSources" :key="src.value" :value="src.value" id="stats-source">
                            {{ src.label }}
                        </n-radio>
                        </n-space>
                    </n-radio-group>
                </n-flex>

                <n-flex vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">条目类型</h3>
                    <n-select 
                    id="subject-type" 
                    v-model:value="subjectType" 
                    :options="subjectTypeOptions" 
                    placeholder="请选择条目类型"
                    clearable
                    />
                </n-flex>

                <n-flex vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">职位</h3>
                    <n-select 
                    id="position" 
                    v-model:value="position" 
                    :options="positionOptions[subjectType]" 
                    placeholder="请选择职位"
                    clearable
                    />
                </n-flex>

                <n-flex vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">收藏类型</h3>
                    <n-checkbox-group v-model:value="collectionTypes" id="collection-type" :disabled="isGlobalStats">
                        <n-space item-style="display: flex;">
                            <n-checkbox :value="2" :label="actionName + '过'" size="large"/>
                            <n-checkbox :value="3" :label="'在' + actionName" size="large"/>
                            <n-checkbox :value="4" label="搁置" size="large"/>
                            <n-checkbox :value="5" label="抛弃" size="large"/>
                        </n-space>
                    </n-checkbox-group>
                </n-flex>
            
            </n-flex>
            
            <n-flex>
                <n-button id="fetch-button" @click="fetch_statistics" type="primary" :disabled="isLoading">
                查询
                </n-button>
                <n-button id="fetch-button" @click="cancelRequest" strong secondary type="primary" :disabled="!isLoading">
                    取消查询
                </n-button>
            </n-flex>
        </n-flex>
    </div>
    
    <n-divider style="margin-bottom: 14px;">
        <n-flex justify="center" style="width: 70vw;" v-show="userIdSave !== ''">
            <h2 class="divider-text" v-show="userIdSave !== ''">当前用户：<span style="color: #FF1493;">{{ userIdSave }}</span></h2>
            <h2 class="divider-text" v-show="subjectTypeLabel !== ''">条目类型：<span style="color: #FF1493;">{{ subjectTypeLabel }}</span></h2>
            <h2 class="divider-text" v-show="positionSave !== null">当前职位：<span style="color: #FF1493;">{{ positionLabel }}</span></h2>
            <h2 class="divider-text" v-show="collectionTypesSave !== null && userIdSave !== '全站数据'">收藏类型：<span style="color: #FF1493;">{{ collectionTypesLabels }}</span></h2>
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
const position = ref(null);
const collectionTypes = ref([2]);
const actionName = computed(() => {
    if (subjectType.value == 3) {
        return '听';
    }
    if (subjectType.value == 4) {
        return '玩';
    }
    return '看';
})
// 是否查全站数据
const isGlobalStats = ref(false);
const statsSources = [{label: '当前用户', value: false}, {label: 'Bangumi 全站', value: true}]

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



// 抓取数据并更新到 store
const fetch_statistics = async () => {
    // 输入不能为空
    if (!userId.value.trim()) {
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
    if (collectionTypes.value.length === 0) {
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
        collection_types: collectionTypes.value
    }
    // 终止查询
    abortController.value = new AbortController();
    try {
        // 记录上次查询
        userIdSave.value = isGlobalStats.value ? '全站数据' : userId.value;
        subjectTypeSave.value = subjectType.value;
        positionSave.value = position.value;
        collectionTypesSave.value = collectionTypes.value;
        // 开始加载
        store.dispatch('setLoadingStatus');
        // 调用并接受返回值
        const response = await axios.post(url, params, { signal: abortController.value.signal });
        store.dispatch('setLists', {
            validSubjects: response.data['valid_subjects'],
            invalidSubjects: response.data['invalid_subjects'],
            collectionNumber: response.data['collection_number'],
            seriesNumber: response.data['series_number'],
            subjectType: subjectTypeSave,
            isGlobalStats: isGlobalStats.value
        });
        store.dispatch('setLoadingStatus');
    } catch (error) {
        store.dispatch('setLoadingStatus');
        if (axios.isCancel(error)) {
            store.dispatch('setLoadingStatus');
            notify.warning({
                title: "查询取消",
                duration: 3000
            });
        } else {
            store.dispatch('setListsToNull');
            notify.error({
                title: "查询失败：请确认用户 ID 输入正确且用户收藏的条目不为 0，如果多次秒失败可能是服务器未开启",
                duration: 8000
            });
        }
    }
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

#stats-source {
    transform: translateY(4px);
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
    .title {
        font-size: 24px;
    }
    .divider-text {
        font-size: 12px;
        margin: 0px 10px 0px 10px;
    }
}

</style>
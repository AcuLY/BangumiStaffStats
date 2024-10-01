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
                    />
                </n-flex>

                <n-flex vertical :size="5">
                    <h3 style="margin: 0; transform: translateX(10px);">职位</h3>
                    <n-select 
                    id="position" 
                    v-model:value="position" 
                    :options="options" 
                    placeholder="请选择职位"
                    clearable
                    />
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
    
    <n-divider class="divider">
        <h2 class="divider-text" v-show="userIdSave !== ''">当前查询用户：<span style="color: #FF1493;">{{ userIdSave }}</span></h2>
        <h2 class="divider-text" v-show="positionSave !== null">当前查询职位：<span style="color: #FF1493;">{{ positionLabel }}</span></h2>
    </n-divider>
</template>

<script setup>
import { ref, computed } from 'vue';
import axios from 'axios';
import { useStore } from 'vuex';
import { useNotification } from 'naive-ui';

const store = useStore();

const isLoading = computed(() => store.state.isLoading);    // 加载状态

const notify = useNotification();   // 用于发送通知

const abortController = ref(null);  // 终止请求

// 用户 id 和要查询的职位
const userId = ref(`${import.meta.env.VITE_API_USERID}`);
const position = ref(null);

const userIdSave = ref('');     // 上一次查询的值
const positionSave = ref(null);
const positionLabel = computed(() => {
        const selectedOption = options.find(option => option.value === positionSave.value);
        return selectedOption ? selectedOption.label : '';
    });

// 职位表
const options = [
    {
        label: '监督',
        value: '导演'
    },
    {
        label: '副监督',
        value: '副导演'
    },
    {
        label: '制作公司',
        value: '动画制作'
    },
    {
        label: '制片人',
        value: '制片人'
    },
    {
        label: '系列构成',
        value: '系列构成'
    },
    {
        label: '脚本',
        value: '脚本'
    },
    {
        label: '演出',
        value: '演出'
    },
    {
        label: '分镜',
        value: '分镜'
    },
    {
        label: '总作画监督',
        value: '总作画监督'
    },
    {
        label: '作画监督',
        value: '作画监督'
    },
    {
        label: '人物设定',
        value: '人物设定'
    },
    {
        label: '摄影监督',
        value: '摄影监督'
    },
    {
        label: '摄影',
        value: '摄影'
    },
    {
        label: '美术监督',
        value: '美术监督'
    },
    {
        label: '美术',
        value: '背景美术'
    },
    {
        label: '音乐',
        value: '音乐'
    },
    {
        label: '音响监督',
        value: '音响监督'
    },
    {
        label: '音效',
        value: '音效'
    },
    {
        label: '原画',
        value: '原画'
    },
    {
        label: '第二原画',
        value: '第二原画'
    },
    {
        label: '中割',
        value: '补间动画'
    },
    {
        label: '色彩设计',
        value: '色彩设计'
    },
    {
        label: '色指定',
        value: '色彩指定'
    },
    {
        label: 'CG 导演',
        value: 'CG 导演'
    },
    {
        label: '3DCG',
        value: '3DCG'
    },
    {
        label: '特效',
        value: '特效'
    },

];
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
    if (!position.value) {
        notify.error({
            title: "请选择职位",
            duration: 3000
        });
        return;
    }

    const url = `${import.meta.env.VITE_API_URL}/statistics`;
    const params = {
        user_id: userId.value,
        position: position.value
    }
    abortController.value = new AbortController();
    try {
        userIdSave.value = userId.value;
        positionSave.value = position.value;

        store.dispatch('setLoadingStatus');
        const response = await axios.post(url, params, { signal: abortController.value.signal });
        store.dispatch('setLists', {
            validSubjects: response.data['valid_subjects'],
            invalidSubjects: response.data['invalid_subjects'],
            totalNumber: response.data['total_number']
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
                title: "查询失败，请确认用户 ID 输入正确并重试",
                duration: 3000
            });
        }
    }
};

const cancelRequest = () => {
    if (abortController.value) {
        abortController.value.abort();
    }
}

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

#position {
    width: 300px;  
    margin-left: 10px;
    margin-right: 10px;
}

#fetch-button {
    width: 100px;
    transform: translateY(15px);
}

.divider-text {
    margin: 0px 20px 0px 20px;
    font-size: 24px;
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
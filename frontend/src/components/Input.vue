<template>
    <div>
        <n-input v-model:value="user_id" type="text" placeholder="请输入用户 ID" />
        <n-select v-model:value="position" :options="options" placeholder="请选择职位"/>
    </div>

    <n-button @click="fetch_statistics">
        查询！
    </n-button>
</template>

<script setup>
import { ref } from 'vue';
import axios from 'axios';
import { useStore } from 'vuex';

const store = useStore()

// 用户 id 和要查询的职位
const user_id = ref('lucay126');
const position = ref(null);
// 职位表
const options = [
    {
        label: '监督（导演）',
        value: '导演'
    },
    {
        label: '音乐',
        value: '音乐'
    },
    {
        label: '制作公司',
        value: '动画制作'
    }
];
// 抓取数据并更新到 store
const fetch_statistics = async () => {
    const url = 'http://127.0.0.1:5000/statistics';
    const params = {
        user_id: user_id.value,
        position: position.value
    }
    try {
        // 先清空列表
        store.dispatch('setLoadingStatus');
        store.dispatch('setListsToNull');
        const response = await axios.post(url, params);
        store.dispatch('setLists', {
            validSubjects: response.data['valid_subjects'],
            invalidSubjects: response.data['invalid_subjects'],
            noInfoSubjects: response.data['no_info_subjects']
        });
        store.dispatch('setLoadingStatus');
    } catch (error) {
        console.log('failed:', error);
    }
};
</script>

<style scoped></style>
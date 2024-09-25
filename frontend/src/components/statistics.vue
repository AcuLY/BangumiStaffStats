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

const user_id = ref('');
const position = ref(null);

const options = [
    {
        label: '导演',
        value: '导演'
    },
    {
        label: '音乐',
        value: '音乐'
    },
];

const fetch_statistics = async () => {
    try {
        const response = await axios.post('http://127.0.0.1:5000/statistics', {
            user_id: user_id.value,
            position: position.value
        });
        console.log('success:', response.data);
    } catch (error) {
        console.log('failed:', error);
    }
}
</script>

<style scoped></style>
<template>
    <!-- 输入条目的弹窗 -->
    <n-modal v-model:show="showInput" style="font-weight: bold;">
        <n-card
        class="input-window"
        title="请输入条目信息"
        :bordered="false"
        size="medium"
        role="dialog"
        aria-modal="true"
        >
            <n-flex>
                条目 ID
                <n-input
                v-model:value="subjectIdInput"
                placeholder="请输入条目 ID"
                :disabled="true"
                />
                条目名称
                <n-input
                v-model:value="subjectNameInput"
                placeholder="请输入条目名称"
                :disabled="!isSubjectNameNull"
                />
                人员名称
                <n-input
                v-model:value="personNameInput"
                placeholder="请输入演职人员的名称（建议复制粘贴）"
                />
                <div style="display: block; width: 100%;">
                    您给本条目的分数（不打分则留空）
                </div>
                <n-rate
                :count="10"
                clearable
                :on-update:value="updateRate"
                :on-clear="clearRateInput"
                />
                <div style="display: block; width: 100%; margin: 20px 0 0 0">
                    <n-button type="primary" @click="submitSubject">
                        提交
                    </n-button>
                </div>
            </n-flex>
        </n-card>
    </n-modal>
    <!-- 表格部分 -->
    <n-flex class="data-tables" justify="center" >
        <div class="valid-subjects">
            <n-spin :show="isLoading">
                <div :style="{ filter: isLoading ? 'blur(3px)' : 'blur(0px)' }">
                    <div class="switch-chinese">
                        <span style="font-weight: bold; font-size: 20px; margin: 0 10px 0 0;">显示中文</span>
                        <n-switch v-model:value="showChinese" size="medium" id="switch" />
                    </div>
                    <div v-show="isValidSubjectsNotNull" class="result-text">
                        <h2 style="margin-top: -10px;">
                            统计到 <span style="color: #ff2075;">{{ validSubjects.length - 1 }}</span> 个人物，
                            <span style="color: #ff2075;">{{ collectionNumber - invalidSubjects.length + 1 }}</span> 个条目
                        </h2>
                    </div>
                    <n-data-table 
                    :columns="validSubjectColumns" 
                    :data="validSubjects" 
                    :single-line="false" 
                    :max-height="500" 
                    :scroll-x="1200"
                    virtual-scroll
                    striped 
                    />
                    <p style="color: gray;">
                        注：<br>① “作品均分” 为用户评分的平均分 <br>
                        ② 由于 Bangumi 提供的 api 对职位的分类有点混乱
                        (至少有一些分类我没太看懂)，部分统计可能不准确
                    </p>
                </div>
                <template #description>
                    <div class="loading-text">
                        <h2 style="margin: 0;">查询中</h2>
                        <p style="margin: 0;">具体时长取决于用户收藏的条目数量以及 Bangumi 的数据库</p> 
                        <p style="margin: 0;">部分职位由于数据缺失可能要等待比较长的时间</p> 
                    </div>
                </template>
            </n-spin>
        </div>
        <!-- 统计失败的数据 -->
        <div class="invalid-subjects" v-show="isInvalidSubjectsNotNull">
            <n-divider style="margin-bottom: 0px; margin-top: -10px;"></n-divider>
            <n-spin :show="isLoading">
                <div :style="{ filter: isLoading ? 'blur(3px)' : 'blur(0px)' }">
                    <div v-show="isInvalidSubjectsNotNull" class="result-text">
                        <h2>以下 <span style="color: #ff2075;">{{ invalidSubjects.length - 1 }}</span> 个条目未统计</h2>
                    </div>
                    <n-data-table 
                    :columns="invalidSubjectColumns"
                    :data="invalidSubjects"
                    :single-line="false" 
                    :max-height="300"
                    virtual-scroll
                    striped
                    :style="{ filter: isLoading ? 'blur(3px)' : 'blur(0px)' }" 
                    />
                    <p style="color: gray;">
                        注：条目未被统计的原因主要为：<br>
                        ① 该条目没有对应职位的人员<br>
                        ② Bangumi 数据库中的数据缺失<br>
                        ③ 该条目为被隐藏<span class="blurred-text">（R-18）</span>的条目 <br>
                        您可以点击 “手动添加条目” 按钮手动添加
                    </p>
                </div>
                <template #description>
                    <div class="loading-text">
                        <h2 style="margin: 0;">查询中</h2>
                        <p style="margin: 0;">具体时长取决于用户收藏的条目数量以及 Bangumi 的数据库</p> 
                        <p style="margin: 0;">通常时间为 1 ~ 10 秒</p> 
                    </div>
                </template>
            </n-spin>
        </div>
    </n-flex>
    
</template>

<script setup>
import { ref, computed, h } from 'vue';
import { useStore } from 'vuex';
import { NButton, useNotification } from 'naive-ui';

const store = useStore();

const notify = useNotification();

const isLoading = computed(() => store.state.isLoading);    // 加载状态

// 以下两个列表的末尾为一个属性全空的字典, 用于填充 data-table 最后一行, 防止滚轮滚不到低
const validSubjects = computed(() => store.state.validSubjects);
const invalidSubjects = computed(() => store.state.invalidSubjects);
const collectionNumber = computed(() => store.state.collectionNumber) // 总条目数

const isValidSubjectsNotNull = computed(() => validSubjects.value.length > 0);  // 是否有数据
const isInvalidSubjectsNotNull = computed(() => invalidSubjects.value.length > 0);


const showInput = ref(false);
const subjectNameInput = ref('');
const subjectIdInput = ref('');
const personNameInput = ref('');
const rateInput = ref(0);
let isSubjectNameNull = true;   // 是否有条目名, 有则禁止用户输入
const showChinese = ref(false);

const updateRate = (rate) => {
    rateInput.value = rate;
}

const clearRateInput = () => {
    rateInput.value = 0;
}


// 最终提交条目信息
const submitSubject = () => {
    // 信息不能留空
    if (!subjectNameInput.value.trim()) {
        notify.error({
            title: "请输入条目名",
            duration: 3000
        });
        return;
    }
    if (!personNameInput.value.trim()) {
        notify.error({
            title: "请输入人名",
            duration: 3000
        });
        return;
    }
    // 关闭弹窗
    showInput.value = false;
    store.dispatch('addNewValidSubject', {
        personName: personNameInput.value,
        subjectId: subjectIdInput.value,
        subjectName: subjectNameInput.value,
        rate: rateInput.value
    });
    // 从列表中删除已提交的条目
    store.dispatch('deleteInvalidSubject', { subjectId: Number(subjectIdInput.value) });
    // 提示
    notify.success({
        title: "添加成功",
        duration: 2000
    });
}

// 弹出加条目窗口
const addSubject = (row) => {
    // 刷新信息
    personNameInput.value = '';
    subjectNameInput.value = '';
    subjectIdInput.value = '';
    rateInput.value = 0;

    subjectIdInput.value = row.subject_id.toString();
    if (row.subject_name !== undefined) {
        isSubjectNameNull = false;
        subjectNameInput.value = row.subject_name;  
    } else {
        isSubjectNameNull = true;
    }
    // 显示弹窗 
    showInput.value = true;
}

const validSubjectColumns = [
    {
        title: '',  // 序号
        key: 'number',
        width: 50,
        resizable: true,
        align: 'center',
        render(row, index) {
            if (index === validSubjects.value.length - 1) {
                return null;
            }
            let color = '#000000';
            if (index === 0) {
                color = '#FFC731';
            } else if (index === 1) {
                color = '#A8A8A8';
            } else if (index === 2) {
                color = '#C96031'
            }
            return h(
                'p',
                {
                    style: { color : color }
                },
                index + 1
            );
        }
    },
    {
        title: '人名',
        key: 'person_name',
        width: 96,
        resizable: true,
        align: 'center',
        render(row) {
            let personName = row.person_name;
            if (showChinese.value && row.person_name_cn !== '|别名={') {    // 临时修补
                personName = row.person_name_cn
            }
            return h(
                'a',
                {
                    href: `https://bgm.tv/person/${row.person_id}`,
                    title: `https://bgm.tv/person/${row.person_id}`,
                    target: '_blank',
                    style: { color: '#FF1493' }
                },
                personName
            );
        }
    },
    {
        title: '作品数',
        key: 'number',
        width: 86,
        align: 'center',
        resizable: true,
        sorter: 'default'
    },
    {
        title: '均分',
        key: 'average_rate',
        width: 76,
        align: 'center',
        resizable: true,
        sorter: 'default',
        render(row, index) {
            // 最后一个元素占位
            if (index === validSubjects.value.length - 1) {
                return null;
            }
            return h('div',
                row.average_rate !== 0
                    ? [h('span', row.average_rate), h('span', ' '), h('img', { src: '/star.png', width: 10 })]
                    : h('span', '无评分')
            );
        }
    },
    {
        title: '作品',
        key: 'subject_names',
        titleAlign: 'center',
        resizable: true,
        render(row, index) {
            // 最后一个元素占位
            if (index === validSubjects.value.length - 1) {
                return null;
            }
            return h(
                'div',
                row.subject_names.map((subject_name, index) =>
                    h('span', [
                        h(
                            'a',
                            {
                                href: `https://bgm.tv/subject/${row.subject_ids[index]}`,
                                title: `https://bgm.tv/subject/${row.subject_ids[index]}`,
                                target: '_blank',
                                style: { color: '#FF1493' }
                            },
                            showChinese.value ? row.subject_names_cn[index] : subject_name
                        ),
                        row.rates[index] !== 0
                            ? h('span', [h('span', ' '), h('span', row.rates[index]), h('span', ' '), h('img', { src: '/star.png', width: 10 }), h('span', ' ')])
                            : h('span', [h('span', ' '), h('img', { src: '/star_unrated.png', width: 10 })])
                    ])
                ).reduce((acc, link, idx) => {  // 插入顿号分隔
                    if (idx !== 0) {
                        acc.push(h('span', '、'));
                    }
                    acc.push(link);
                    return acc;
                }, []),
            )
        }
    }
];

const invalidSubjectColumns = [
    {
        title: '',
        align: 'center',
        width: 50,
        render(row, index) {
            if (index === invalidSubjects.value.length - 1) {
                return null;
            }
            return h('p', index + 1);
        }
    },
    {
        title: '条目',
        key: 'subject_id',
        align: 'center',
        titleAlign: 'center',
        render(row) {
            let subjectName = row.subject_name === undefined ? row.subject_id : row.subject_name;
            if (showChinese.value && row.subject_name_cn) {
                subjectName = row.subject_name_cn;
            }
            return h(
                'a',
                {
                    href: `https://bgm.tv/subject/${row.subject_id}`,
                    title: `https://bgm.tv/subject/${row.subject_id}`,
                    target: '_blank',
                    style: { color: '#FF1493' }
                },
                subjectName
            )
        }
    },
    {
        title: '操作',
        key: 'actions',
        width: 110,
        align: 'center',
        titleAlign: 'center',
        render(row, index) {
            if (index === invalidSubjects.value.length - 1) {
                // 最后一个元素为占位元素, 不渲染按钮, 返回一个空元素
                return null;
            }
            return h(
                NButton,
                {
                    size: 'small',
                    onClick: () => addSubject(row)
                },
                { default: () => '添加条目' }
                )
        }
    }
];


</script>



<style>

.input-window {
    width: 600px;
}

.switch-chinese {
    margin-bottom: 20px;
    width: 90vw;
}

#switch {
    transform: translateY(-2px);
}

.data-tables {
    margin-top: -10px;
}

.valid-subjects {
    width: 90vw;
}

.invalid-subjects {
    width: 90vw;
}

@media (max-width: 600px) {
    .input-window {
        width: 80vw;
    }
    .switch-chinese {
        display: flex;
        justify-content: center;
    }
    #switch {
        transform: translateY(6px);
    }
    .result-text {
        display: flex;
        justify-content: center;
    }
}

.blurred-text {
    filter: blur(3px);
}

.blurred-text:hover {
    filter: blur(0px);
}

.loading-text {
    display: flex; 
    justify-content: center; 
    flex-direction: column; 
    align-items: center; 
    width: 100vw; 
    color: rgb(45, 45, 45);
    text-shadow: 0px 0px 10px rgba(85, 85, 85, 0.6);;
}

</style>
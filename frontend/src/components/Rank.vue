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
                <div :style="{ filter: isLoading ? 'blur(8px)' : 'blur(0px)' }">
                    <n-flex class="visual-options" :justify="isMobile ? 'center' : 'flex-start'" :size="isMobile ? 'small' : 'medium'">
                        <n-switch v-model:value="showChinese" :size="isMobile ? 'medium' : 'large'" class="switch">
                            <template #checked>
                                <span class="visual-options-text-checked">显示中文</span>
                            </template>
                            <template #unchecked>
                                <span class="visual-options-text-unchecked">显示中文</span>
                            </template>
                        </n-switch>
                        <n-switch v-model:value="showImage" :size="isMobile ? 'medium' : 'large'" class="switch">
                            <template #checked>
                                <span class="visual-options-text-checked">显示图片</span>
                            </template>
                            <template #unchecked>
                                <span class="visual-options-text-unchecked">显示图片</span>
                            </template>
                        </n-switch>
                        <n-switch v-model:value="longerTable" :size="isMobile ? 'medium' : 'large'" class="switch">
                            <template #checked>
                                <span class="visual-options-text-checked">伸长列表</span>
                            </template>
                            <template #unchecked>
                                <span class="visual-options-text-unchecked">伸长列表</span>
                            </template>
                        </n-switch>
                        <n-switch v-model:value="showCharacters" v-show="isCV" :size="isMobile ? 'medium' : 'large'" class="switch">
                            <template #checked>
                                <span class="visual-options-text-checked">显示角色</span>
                            </template>
                            <template #unchecked>
                                <span class="visual-options-text-unchecked">显示角色</span>
                            </template>
                        </n-switch>
                    </n-flex>
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
                        :max-height="longerTable ? 1000 : 500" 
                        :scroll-x="1200"
                        striped 
                    />
                    <p style="color: gray;">
                        注：<br>① “作品均分” 为用户评分的平均分 <br>
                        ② 由于部分 Bangumi 提供的 api 对职位的分类有点混乱
                        ，统计可能不准确，另外比较新的条目和人物可能会缺失 <br>
                        ③ 当查询声优开启显示角色时，后面标注的作品可能是续作或者客串出场的作品，我也还没太想好怎么处理这个问题
                    </p>
                </div>
                <template #description>
                    <div class="loading-text">
                        <h2 style="margin: 0;">查询中</h2>
                        <p style="margin: 0;">具体时长取决于条目数量以及 Bangumi 的数据库</p> 
                        <p style="margin: 0;">通常需要约 1 ~ 10 秒</p> 
                    </div>
                </template>
            </n-spin>
        </div>
        <!-- 统计失败的数据 -->
        <div class="invalid-subjects" v-show="isInvalidSubjectsNotNull">
            <n-divider style="margin-bottom: 0px; margin-top: -10px;"></n-divider>
            <n-spin :show="isLoading">
                <div :style="{ filter: isLoading ? 'blur(8px)' : 'blur(0px)' }">
                    <div v-show="isInvalidSubjectsNotNull" class="result-text">
                        <h2>以下 <span style="color: #ff2075;">{{ invalidSubjects.length - 1 }}</span> 个条目未统计</h2>
                    </div>
                    <n-data-table 
                    :columns="invalidSubjectColumns"
                    :data="invalidSubjects"
                    :single-line="false" 
                    :max-height="longerTable ? 600 : 300"
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
                        <p style="margin: 0;">具体时长取决于条目数量以及 Bangumi 的数据库</p> 
                        <p style="margin: 0;">通常需要约 1 ~ 10 秒</p> 
                    </div>
                </template>
            </n-spin>
        </div>
    </n-flex>
    
</template>

<script setup>
import { ref, computed, h, render, watch, reactive } from 'vue';
import { useStore } from 'vuex';
import { NButton, useNotification } from 'naive-ui';

const store = useStore();

const notify = useNotification();

const isLoading = computed(() => store.state.isLoading);    // 加载状态

// 以下两个列表的末尾为一个属性全空的字典, 用于填充 data-table 最后一行, 防止滚轮滚不到低
const validSubjects = computed(() => store.state.validSubjects);
const invalidSubjects = computed(() => store.state.invalidSubjects);
const collectionNumber = computed(() => store.state.collectionNumber) // 总条目数

// 是否有数据
const isValidSubjectsNotNull = computed(() => validSubjects.value.length > 0);  
const isInvalidSubjectsNotNull = computed(() => invalidSubjects.value.length > 0);

// 手动输入数据窗口
const showInput = ref(false);
const subjectNameInput = ref('');
const subjectIdInput = ref('');
const personNameInput = ref('');
const rateInput = ref(0);
let isSubjectNameNull = true;   // 是否有条目名, 有则禁止用户输入

// 窗口类型
const isMobile = computed(() => { return window.innerWidth <= 600 });
// 显示中文
const showChinese = ref(false); 
// 显示图片
const showImage = ref(false);
// 伸长列表
const longerTable = ref(false);
// 是否查询声优
const isCV = computed(() => {
    if (validSubjects.value[0] && validSubjects.value[0]['character_ids'].length >= 1) {
        return true;
    }
    return false;
});
// 查询声优时显示角色
const showCharacters = ref(false);

watch(isCV, (newValue) => {
    if (!newValue) {
        showCharacters.value = false;
    }
});

// 手动输入分数
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


// 表格数据
const validSubjectColumns = computed(() => [
    {
        title: '',  // 序号
        key: '',
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
        fixed: 'left',
        render(row) {
            let personName = row.person_name;
            if (showChinese.value) {
                personName = row.person_name_cn
            }
            return h(
                'a',
                {
                    href: `https://bgm.tv/person/${row.person_id}`,
                    title: `https://bgm.tv/person/${row.person_id}`,
                    target: '_blank',
                    style: { color: '#FF1493', textDecoration:'none' }
                },
                personName
            );
        }
    },
    {
        title: showCharacters.value ? '角色数' : '作品数',
        key: showCharacters.value ? 'characters_number' : 'subjects_number',
        width: 86,
        align: 'center',
        resizable: true,
        sorter: 'default',
        render(row, index) {
            // 最后一个元素占位
            if (index === validSubjects.value.length - 1) {
                return null;
            }
            return h('span', showCharacters.value ? row.characters_number : row.subjects_number)
        }
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
        title: showCharacters.value ? '角色': '作品',
        key: 'subject_names',
        titleAlign: 'center',
        resizable: true,
        render(row, index) {
            // 最后一个元素占位
            if (index === validSubjects.value.length - 1) {
                return null;
            }
            if (showCharacters.value) {
                // 显示角色图片
                if (showImage.value) {
                    return h(
                            'div',
                            row.character_images.map((img, imgIndex) => {
                                return h(
                                    'a',
                                    {
                                        href: `https://bgm.tv/character/${row.character_ids[imgIndex]}`,
                                        title: row.character_names[imgIndex],
                                        target: '_blank',
                                        style: { color: '#FF1493', transition: 'all 0.1s'  }
                                    },
                                    h(
                                        'img',
                                        {
                                            src: img,
                                            alt: row.character_names[imgIndex],
                                            style: { width: '48px', height: '48px', margin: '2px 5px 2px 0px', borderRadius: '5px', transition: 'all 0.1s' },
                                            loading: 'lazy',
                                            onerror(event) {
                                                event.currentTarget.src = '/character_failed.png';
                                            },
                                            onMouseover(event) {
                                                event.currentTarget.style.boxShadow = '0px 0px 5px #FF1493'
                                            },
                                            onMouseout(event) {
                                                event.currentTarget.style.boxShadow = '0px 0px 0px'
                                            }
                                        }
                                    )
                                )
                            })
                    )
                }
                // 显示角色名字
                return h(
                        'span',
                        row.character_names.map((character_name, index) =>
                            h(
                                'a',
                                {
                                    href: `https://bgm.tv/character/${row.character_ids[index]}`,
                                    title: character_name,
                                    target: '_blank',
                                    style: { 
                                        color: '#FF1493', 
                                        textDecoration:'none', 
                                        padding: '1px 4px 1px 4px', 
                                        border: 'solid thin', 
                                        borderRadius: '8px', 
                                        whiteSpace: 'nowrap', 
                                        lineHeight: '2',
                                        transition: 'all 0.1s' 
                                    },
                                    onMouseover(event) {
                                        event.currentTarget.style.backgroundColor = '#EC468C';
                                        event.currentTarget.style.borderColor = '#EC468C';
                                        event.currentTarget.style.color = '#ffffff';
                                        event.currentTarget.style.boxShadow = '0px 0px 5px grey';
                                        event.currentTarget.querySelector(`#subject-name`).style.color = '#FFD0F4';
                                    },
                                    onMouseout(event) {
                                        event.currentTarget.style.backgroundColor = 'transparent';
                                        event.currentTarget.style.color = '#FF1493';
                                        event.currentTarget.style.boxShadow = '0px 0px 0px';
                                        event.currentTarget.querySelector(`#subject-name`).style.color = '#C3809A';
                                    }
                                },
                                showChinese.value 
                                    ? [
                                        row.character_names_cn[index],
                                        h('span', { id: 'subject-name', style: { color: '#C3809A' } }, `【${row.character_subject_names_cn[index]}】`)
                                    ]
                                    : [
                                        row.character_names[index],
                                        h('span', { id: 'subject-name', style: { color: '#C3809A' } }, `【${row.character_subject_names[index]}】`)

                                    ],
                            )
                        ).reduce((acc, link, idx) => {  // 插入顿号分隔
                            if (idx !== 0) {
                                acc.push(h('span', '\u00A0\u00A0'));
                            }
                            acc.push(link);
                            return acc;
                        }, []),
                    )
            }
            // 显示作品图片
            if (showImage.value) {
                return h(
                        'div',
                        row.subject_images.map((img, imgIndex) => {
                            return h(
                                'a',
                                {
                                    href: `https://bgm.tv/subject/${row.subject_ids[imgIndex]}`,
                                    title: row.subject_names[imgIndex],
                                    target: '_blank',
                                    style: { color: '#FF1493', transition: 'all 0.1s'  }
                                },
                                h(
                                    'img',
                                    {
                                        src: img,
                                        alt: row.subject_names[imgIndex],
                                        style: { width: '50px', height: '70.6px', margin: '2px 5px 2px 0px', borderRadius: '5px', transition: 'all 0.1s' },
                                        loading: 'lazy',
                                        onerror(event) {
                                            event.currentTarget.src = '/subject_failed.png';
                                        },
                                        onMouseover(event) {
                                            event.currentTarget.style.boxShadow = '0px 0px 5px #FF1493'
                                        },
                                        onMouseout(event) {
                                            event.currentTarget.style.boxShadow = '0px 0px 0px'
                                        }
                                    },
                                )
                            )
                        })
                )
            }
            // 显示作品名字
            return h(
                'div',
                row.subject_names.map((subject_name, index) =>
                    h(
                        'a',
                        {   
                            href: `https://bgm.tv/subject/${row.subject_ids[index]}`,
                            title: subject_name,
                            target: '_blank',
                            style: { 
                                color: '#FF1493', 
                                textDecoration:'none', 
                                padding: '1px 4px 1px 4px', 
                                border: 'solid thin', 
                                borderRadius: '8px', 
                                whiteSpace: 'nowrap', 
                                lineHeight: '2',
                                transition: 'all 0.1s' 
                            },
                            onMouseover(event) {
                                event.currentTarget.style.backgroundColor = '#EC468C';
                                event.currentTarget.style.borderColor = '#EC468C';
                                event.currentTarget.style.color = '#ffffff';
                                event.currentTarget.style.boxShadow = '0px 0px 5px grey'
                            },
                            onMouseout(event) {
                                event.currentTarget.style.backgroundColor = 'transparent';
                                event.currentTarget.style.color = '#FF1493';
                                event.currentTarget.style.boxShadow = '0px 0px 0px'
                            }
                        }, 
                        [
                            h(
                                'span',
                                showChinese.value ? row.subject_names_cn[index] : subject_name
                            ),
                            row.rates[index] !== 0
                                ? h('span', [h('span', ' '), h('span', row.rates[index]), h('span', ' '), h('img', { src: '/star.png', width: 10 }), h('span', ' ')])
                                : h('span', [h('span', ' '), h('img', { src: '/star_unrated.png', width: 10 }), h('span', ' ')])
                    ])
                ).reduce((acc, link, idx) => {  // 空格分隔
                    if (idx !== 0) {
                        acc.push(h('span', '\u00A0\u00A0'));
                    }
                    acc.push(link);
                    return acc;
                }, []),
            )
        }
    }
]);

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

.visual-options {
    margin-bottom: 20px;
    width: 90vw;
    font-weight: bold; 
}

.visual-options-text-unchecked {
    color: #777777;
    font-size: 18px;
}

.visual-options-text-checked {
    color: #ffffff;
    font-size: 18px;
}

.switch {
    margin: 5px 0px 5px 0px;
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
    .result-text {
        display: flex;
        justify-content: center;
    }
    .visual-options {
        width: 90vw;
    }
    .visual-options-text-checked {
        font-size: 14px;
    }
    .visual-options-text-unchecked {
        font-size: 14px;
    }
    #switch {
        transform: translateY(4px);
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
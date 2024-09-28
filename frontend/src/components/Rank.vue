<template>
    <!-- 输入条目的弹窗 -->
    <n-modal v-model:show="showInput">
        <n-card
        style="width: 600px"
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
                :disabled="!isInvalid"
                />
                人员名称
                <n-input
                v-model:value="personNameInput"
                placeholder="请输入演职人员的名称（请保证与 Bangumi 上的字符一致）"
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
    <div>
        <n-spin :show="isLoading">
            <n-data-table 
            :columns="validSubjectColumns" 
            :data="validSubjects" 
            :single-line="false" 
            :max-height="500" 
            virtual-scroll
            striped 
            />
        </n-spin>
    </div>
    <div>
        <n-spin :show="isLoading">
            <n-data-table 
            :columns="invalidSubjectColulmns"
            :data="invalidSubjects"
            :single-line="false" 
            :max-height="200" 
            virtual-scroll
            striped 
            />
        </n-spin>
    </div>
    <div>
        <n-spin :show="isLoading">
            <n-data-table 
            :columns="noInfoSubjectColulmns"
            :data="noInfoSubjects"
            :single-line="false" 
            :max-height="200" 
            virtual-scroll
            striped 
            />
        </n-spin>
    </div>
</template>

<script setup>
import { ref, computed, h } from 'vue';
import { useStore } from 'vuex';
import { NButton, useNotification } from 'naive-ui';

const store = useStore();

const notify = useNotification();

const isLoading = computed(() => store.state.isLoading);    // 加载状态

const validSubjects = computed(() => store.state.validSubjects);
// const validSubjects = ref([{ 'person_name': '京都アニメーション', 'number': 18, 'subject_ids': [283643, 386195, 13557, 117777, 216372, 276, 3375, 1606, 12426, 216371, 152091, 115908, 1424, 3774, 37874, 37873, 51, 876], 'subject_names': ['響け！ユーフォニアム３', '特別編 響け！ユーフォニ アム～アンサンブルコンテスト～', 'らき☆すた OVA', '聲の 形', '劇場版 響け！ユーフォニアム～誓いのフィナーレ～', 'らき☆すた', '涼宮ハルヒの消失', '涼宮ハルヒの憂鬱', '映画けいおん！', 'リズと青い鳥', '響け！ユーフォニアム2', '響け！ユーフォニアム', 'けいおん！', 'けいおん！！', 'CLANNAD 〜AFTER STORY〜もうひとつの世界 杏編', 'CLANNAD  もうひとつの世界 智代編', 'CLANNAD -クラナド-', 'CLANNAD 〜AFTER STORY〜'], 'rates': [6, 8, 0, 6, 7, 8, 8, 7, 8, 9, 9, 8, 8, 8, 0, 0, 8, 10], 'average_rate': 7.86 }, { 'person_name': 'A-1 Pictures', 'number': 17, 'subject_ids': [425211, 37785, 375817, 364450, 11577, 317613, 331887, 137722, 100403, 132734, 302189, 10440, 148099, 92382, 23686, 248175, 293049], 'subject_names': ['かぐや様は告らせたい-ファーストキッスは終わらない-', '新世界より', 'Engage Kiss', 'リコリス・リコイル', 'THE IDOLM@STER', 'か ぐや様は告らせたい-ウルトラロマンティック-', '86―エイテ ィシックス― 第2クール', '僕だけがいない街', '冴えない彼 女の育てかた', '冴えない彼女の育てかた ♭', '86―エイティ シックス―', 'あの日見た花の名前を僕達はまだ知らない。', '劇場版 ソードアート・オンライン -オーディナル・スケール-', 'ソードアート・オンラインII', 'ソードアート・オンラ イン', 'かぐや様は告らせたい～天才たちの恋愛頭脳戦～', 'かぐや様は告らせたい？～天才たちの恋愛頭脳戦～'], 'rates': [8, 8, 7, 5, 7, 9, 8, 6, 7, 7, 6, 7, 6, 7, 7, 8, 7], 'average_rate': 7.05 }, { 'person_name': 'サンライズ', 'number': 14, 'subject_ids': [471926, 408883, 403238, 401960, 349441, 391706, 354146, 335579, 165553, 296659, 75989, 49294, 306742, 107199], 'subject_names': ['にじよん あにめーしょん 2', 'ラブライブ！虹ヶ咲学園スクールアイドル同好会 NEXT SKY', '機動戦士ガンダム 水星の魔女 Season2', 'にじよん あにめーしょん', '機動戦士ガンダム 水星の魔女', '機動戦士ガンダム 水星の魔女 PROLOGUE', 'ラブライブ！スーパースター!! 2期', 'ラブライブ！虹ヶ咲学園スクールアイドル同好会 2期', 'ラブライブ! サンシャイン!!', 'ラブライブ！虹ヶ咲学園スクールアイドル同好会', 'ラブライブ! 第2期', 'ラブライブ!', 'ラブライブ！スーパースター!!', 'ラブライブ! The School Idol Movie'], 'rates': [7, 7, 5, 7, 7, 0, 4, 8, 6, 7, 7, 7, 6, 7], 'average_rate': 6.53 }, { 'person_name': 'CloverWorks', 'number': 13, 'subject_ids': [411428, 331935, 316607, 411427, 331480, 373267, 328609, 329906, 231497, 243916, 316957, 260680, 240038], 'subject_names': ['劇場版 SPY×FAMILY CODE: White', 'ワンダ ーエッグ・プライオリティ 特別編', 'ワンダーエッグ・プラ イオリティ', 'SPY×FAMILY Season 2', '明日ちゃんのセーラ ー服', 'SPY×FAMILY 第2クール', 'ぼっち・ざ・ろっく！', 'SPY×FAMILY', '冴えない彼女の育てかた Fine', '約束のネバ ーランド', 'シャドーハウス', '青春ブタ野郎はゆめみる少女の夢を見ない', '青春ブタ野郎はバニーガール先輩の夢を見ない'], 'rates': [7, 4, 7, 7, 7, 7, 8, 7, 8, 8, 6, 0, 7], 'average_rate': 6.91 }, { 'person_name': 'WIT STUDIO', 'number': 12, 'subject_ids': [484761, 411428, 411427, 373267, 329906, 221781, 263750, 217300, 118335, 55770, 110049, 325286], 'subject_names': ['しかのこのこのここしたんたん', '劇場版 SPY×FAMILY CODE: White', 'SPY×FAMILY Season 2', 'SPY×FAMILY 第2クール', 'SPY×FAMILY', '進撃の巨人 LOST GIRLS', '進撃の巨人 Season 3 Part.2', '進撃の巨人 Season 3', '進撃の巨人 Season 2', '進撃の巨人', '進撃の巨 人 悔いなき選択 OAD', "Vivy -Fluorite Eye's Song-"], 'rates': [5, 7, 7, 7, 7, 0, 0, 0, 8, 8, 0, 8], 'average_rate': 7.12 }, { 'person_name': 'P.A.WORKS', 'number': 11, 'subject_ids': [503976, 477207, 464561, 389450, 244761, 356756, 110467, 212003, 1851, 306429, 120925], 'subject_names': ['「真夜中ぱんチ」メンバーのソロ企画', '真夜中ぱんチ', '菜なれ花なれ', 'アキバ冥途戦争', '劇場版 SHIROBAKO', 'パリピ孔明', 'SHIROBAKO', 'ウマ娘 プリティーダービー', 'Angel Beats!', '神様になった日', 'Charlotte'], 'rates': [7, 8, 4, 0, 8, 7, 9, 7, 7, 3, 6], 'average_rate': 6.6 }]);
const invalidSubjects = computed(() => store.state.invalidSubjects);
const noInfoSubjects = computed(() => store.state.noInfoSubjects);


const showInput = ref(false);
const subjectNameInput = ref('');
const subjectIdInput = ref('');
const personNameInput = ref('');
const rateInput = ref(0);

let isInvalid = true;   // 要删除的条目是 invalid 还是 noInfo

const updateRate = (rate) => {
    rateInput.value = rate;
}

const clearRateInput = () => {
    rateInput.value = 0;
}

// 最终提交条目信息
const submitSubject = () => {
    // 信息不能留空
    if (subjectNameInput.value.trim().length === 0) {
        notify.error({
            title: "请输入条目名",
            duration: 3000
        });
        return;
    }
    if (personNameInput.value.trim().length === 0) {
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
    if (isInvalid) {
        store.dispatch('deleteInvalidSubject', { subjectId: Number(subjectIdInput.value) });
    } else {
        store.dispatch('deleteNoInfoSubject', { subjectId: Number(subjectIdInput.value) });
    }
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
    // 判断是无信息还是非法条目, 并补充已有信息
    if (row.subject_name === undefined) {
        isInvalid = true;
        subjectIdInput.value = row.subject_id.toString();
    } else {
        isInvalid = false;
        subjectNameInput.value = row.subject_name;
        subjectIdInput.value = row.subject_id.toString();
    }
    // 显示弹窗
    showInput.value = true;
}

const validSubjectColumns = [
    {
        title: '人名',
        key: 'person_name',
        width: 120,
        resizable: true,
        align: 'center',
    },
    {
        title: '作品数量',
        key: 'number',
        width: 100,
        align: 'center',
        sorter: 'default'
    },
    {
        title: '作品均分',
        key: 'average_rate',
        width: 100,
        align: 'center',
        sorter: 'default',
        render(row) {
            return h('div',
                row.average_rate !== 0
                    ? [h('span', row.average_rate), h('span', ' '), h('img', { src: '/star.png', width: 10 })]
                    : h('span', '用户无评分')
            );
        }
    },
    {
        title: '作品',
        key: 'subject_names',
        titleAlign: 'center',
        render(row) {
            return h(
                'div',
                row.subject_names.map((subject_name, index) =>
                    h('span', [
                        h(
                            'a',
                            {
                                title: `转到 ${subject_name}`,
                                href: `https://bgm.tv/subject/${row.subject_ids[index]}`,
                                target: '_blank',
                                style: { color: '#FF1493' }
                            },
                            subject_name
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

const noInfoSubjectColulmns = [
    {
        title: '条目',
        key: 'subject_name',
        align: 'center',
        titleAlign: 'center',
        render(row) {
            return h(
                'a',
                {
                    title: `转到 ${row.subject_name}`,
                    href: `https://bgm.tv/subject/${row.subject_id}`,
                    target: '_blank',
                    style: { color: '#FF1493' }
                },
                row.subject_name
            )
        }
    },
    {
        title: '操作',
        key: 'actions',
        align: 'center',
        titleAlign: 'center',
        render(row) {
            return h(
                NButton,
                {
                    size: 'small',
                    onClick: () => addSubject(row)
                },
                { default: () => '手动添加条目' }
                )
        }
    }
];

const invalidSubjectColulmns = [
    {
        title: '条目编号',
        key: 'subject_id',
        align: 'center',
        titleAlign: 'center',
        render(row) {
            return h(
                'a',
                {
                    title: `转到 ${row.subject_id}`,
                    href: `https://bgm.tv/subject/${row.subject_id}`,
                    target: '_blank',
                    style: { color: '#FF1493' }
                },
                row.subject_id
            )
        }
    },
    {
        title: '操作',
        key: 'actions',
        align: 'center',
        titleAlign: 'center',
        render(row) {
            return h(
                NButton,
                {
                    size: 'small',
                    onClick: () => addSubject(row)
                },
                { default: () => '手动添加条目' }
                )
        }
    }
];


</script>



<style></style>
import { createStore } from 'vuex';

export default createStore({
    state: {
        isLoading: false,
        validSubjects: [],
        invalidSubjects: [],
        collectionNumber: 0,
    },

    mutations: {
        updateLoadingStatus(state) {
            state.isLoading = !state.isLoading;
        },

        clearLists(state) {
            state.validSubjects = [];
            state.invalidSubjects = [];
        },

        updateLists(state, { validSubjects, invalidSubjects, collectionNumber }) {
            state.validSubjects = validSubjects;
            state.invalidSubjects = invalidSubjects;
            state.collectionNumber = collectionNumber;
            // 在末尾插入一个元素, 防止滚动条无法滚动到底
            state.validSubjects.push({
                person_name: '',
                subject_ids: [''],
                subject_names: [''],
                subjects_number: '',
                subject_images: [''],
                rates: [''],
                average_rate: 0,
                character_ids: [''],
                character_names:[''],
                character_names_cn: [''],
                character_images: [''],
                character_subject_names: [''],
                character_subject_names_cn: [''],
                characters_number: ''
            });
            state.invalidSubjects.push({
                subject_ids: [''],
                subject_names: [''],
            })
        },

        updateValidSubjects(state, { personName, subjectId, subjectName, rate }) {
            // 判断是否是新人物
            const existingSubject = state.validSubjects.find(subject => subject.person_name === personName);
            // 如果是则新增, 否则融合
            if (existingSubject) {
                existingSubject.subject_ids.push(subjectId);
                existingSubject.subject_names.push(subjectName);
                existingSubject.rates.push(rate);
                // 重新计算和条目数均分
                existingSubject.subjects_number += 1;
                if (rate != 0) {
                    existingSubject.average_rate = (
                        existingSubject.rates.reduce((sum, rate) => sum + rate, 0) / existingSubject.subjects_number
                    ).toFixed(2);
                }
            } else {
                state.validSubjects.push({
                    person_name: personName,
                    subject_ids: [subjectId],
                    subject_names: [subjectName],
                    subjects_number: 1,
                    rates: [rate],
                    average_rate: rate
                });
            }
        },

        removeInvalidSubjects(state, { subjectId }) {
            state.invalidSubjects = state.invalidSubjects.filter(subject => subject.subject_id !== subjectId);
        },
    },

    actions: {
        setLoadingStatus({ commit }) {
            commit('updateLoadingStatus');
        },

        setListsToNull({ commit }) {
            commit('clearLists');
        },

        setLists({ commit }, lists) {
            commit('updateLists', lists);
        },

        addNewValidSubject({ commit }, newSubject) {
            commit('updateValidSubjects', newSubject);
        },

        deleteInvalidSubject({ commit }, subjectId) {
            commit('removeInvalidSubjects', subjectId);
        },

    }
});
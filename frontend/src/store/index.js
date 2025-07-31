import { createStore } from 'vuex';

export default createStore({
    state: {
        isLoading: false,
        summaries: [],
        personCount: 0,
        subjectCount: 0,
        seriesCount: 0,
        subjectType: 0,
        isGlobalStats: false,
        isCV: false,
        characterCount: 0,
        statisticType: 'subject',
        page: 1,
        pageSize: 10,
        sortBy: 'count',
        ascending: false,
    },

    mutations: {
        updateLoadingStatus(state) {
            state.isLoading = !state.isLoading;
        },

        clearLists(state) {
            state.summaries = [];
        },

        updateIsCV(state, isCV) {
            state.isCV = isCV;
        },

        updateLists(state, { summaries, personCount, subjectCount, seriesCount, characterCount, subjectType, isGlobalStats }) {
            state.summaries = summaries;
            state.personCount = personCount;
            state.subjectCount = subjectCount;
            state.seriesCount = seriesCount;
            state.characterCount = characterCount
            state.subjectType = subjectType;
            state.isGlobalStats = isGlobalStats;
        },

        updateStatisticType(state, statisticType) {
            state.statisticType = statisticType;
        },

        updatePage(state, page) {
            state.page = page;
        },

        updatePageSize(state, pageSize) {
            state.pageSize = pageSize;
        },

        updateSortBy(state, sortBy) {
            state.sortBy = sortBy;
        },

        updateAscending(state, ascending) {
            state.ascending = ascending;
        },
    },

    actions: {
        setLoadingStatus({ commit }) {
            commit('updateLoadingStatus');
        },

        setListsToNull({ commit }) {
            commit('clearLists');
        },

        setIsCV({ commit }, isCV) {
            commit('updateIsCV', isCV);
        },

        setLists({ commit }, lists) {
            commit('updateLists', lists);
        },

        setStatisticType({ commit }, statisticType) {
            commit('updateStatisticType', statisticType);
        },

        setPage({ commit }, page) {
            commit('updatePage', page);
        },

        setPageSize({ commit }, pageSize) {
            commit('updatePageSize', pageSize);
            commit('updatePage', 1);
        },

        setSorter({ commit }, { sortBy, ascending }) {
            commit('updateSortBy', sortBy);
            commit('updateAscending', ascending);
        }
    }
});
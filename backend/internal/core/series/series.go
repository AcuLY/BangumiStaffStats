package series

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

// Get 根据给定条目提取出这些条目所属系列的主条目，用系列的均分覆盖 Rate 字段，以及每个条目的系列内序号
func Get(ctx context.Context, subjects []*model.Subject) ([]*model.Subject, map[model.SubjectID]int, error) {
	series, err := getSeries(ctx, subjects)
	if err != nil {
		return nil, nil, err
	}
	// 聚合一个系列的条目
	idToSeries := make(map[model.SeriesID][]model.Series, len(subjects))
	for _, ser := range series {
		idToSeries[ser.SeriesID] = append(idToSeries[ser.SeriesID], ser)
	}

	idToSubj := make(map[model.SubjectID]*model.Subject, len(subjects)) // 从 Series.SubjectID 获取 Subject
	for _, s := range subjects {
		idToSubj[s.ID] = s
	}

	mainSubjs := make([]*model.Subject, 0, len(subjects))
	seriesOrders := make(map[model.SubjectID]int, len(subjects))

	for _, series := range idToSeries { // series 是一个列表
		seriesSubjs := make([]*model.Subject, 0)
		sort.Slice(series, func(i int, j int) bool {
			return series[i].Order < series[j].Order
		})

		for i, ser := range series {
			seriesOrders[ser.SubjectID] = i
			seriesSubjs = append(seriesSubjs, idToSubj[ser.SubjectID])
		}

		seriesAvg := subject.CalcAverage(seriesSubjs)
		mainSubj := idToSubj[series[0].SubjectID] // 排序后第一个元素是 order 最小的主条目
		mainSubjs = append(mainSubjs, &model.Subject{
			ID:       mainSubj.ID,
			Name:     mainSubj.Name,
			NameCN:   mainSubj.NameCN,
			Favorite: mainSubj.Favorite,
			Image:    mainSubj.Image,
			Rate:     seriesAvg,
		})
	}

	return mainSubjs, nil, nil
}

func getSeries(ctx context.Context, subjects []*model.Subject) ([]model.Series, error) {
	keys := make([]model.SeriesKey, 0, len(subjects))

	for _, s := range subjects {
		keys = append(keys, model.SeriesKey(s.ID))
	}

	sql := `
		SELECT * FROM series
		WHERE subject_id IN ?
	`

	return store.DBReadThrough[model.SeriesKey, model.Series](ctx, keys, sql, []any{keys})
}

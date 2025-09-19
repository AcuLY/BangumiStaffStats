package subject

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

type (
	Collection = model.Collection
	Subject    = model.Subject
)

func Global(ctx context.Context, subjType int, favRange []int) ([]*Subject, error) {
	sql := `
		SELECT * FROM subjects 
		WHERE subject_type = ? and subject_favorite BETWEEN ? AND ?
	`

	return store.DBRaw[*Subject](ctx, sql, subjType, favRange[0], favRange[1])
}

func Build(ctx context.Context, colls []Collection) ([]*Subject, error) {
	subjs := buildSubjects(colls)
	err := load(ctx, &subjs)
	if err != nil {
		return nil, err
	}

	idToColl := model.ToIDMap(colls)
	for _, subj := range subjs {
		subj.Rate = idToColl[subj.ID].UserRate // 查用户收藏时用用户评分覆盖全站评分
	}

	return subjs, nil
}

func buildSubjects(colls []Collection) []*Subject {
	subjs := make([]*Subject, 0, len(colls))
	for _, coll := range colls {
		subjs = append(subjs, &Subject{ID: coll.ID})
	}
	return subjs
}

func load(ctx context.Context, subjs *[]*Subject) error {
	// 部分用户收藏条目可能以及被删除，需要过滤
	filtered := make([]*Subject, 0, len(*subjs))
	for _, subj := range *subjs {
		if store.SubjectExists(subj.ID) {
			filtered = append(filtered, subj)
		}
	}
	*subjs = filtered

	sql := `
		SELECT * FROM subjects
		WHERE subject_id IN ?
	`
	condFunc := func(subjs []*Subject) []any {
		return []any{model.ToIDs(subjs)}
	}

	return store.DBReadThrough(ctx, subjs, sql, condFunc)
}

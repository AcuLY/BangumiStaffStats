package person

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

type (
	Subject = model.Subject
	Person  = model.Person
	Credit  = model.Credit
)

func Build(ctx context.Context, subjs []*Subject, posID int) (map[*Person][]*Subject, error) {
	crs := buildCredits(subjs, posID)
	if err := loadCredits(ctx, &crs); err != nil {
		return nil, err
	}

	idToSubj := model.ToIDMap(subjs)

	idToPer := make(map[int]*Person, len(crs)) // 人物需要去重
	perToSubjs := make(map[*Person][]*Subject, len(crs))
	for _, cr := range crs {
		per, exists := idToPer[cr.PersonID]
		if !exists {
			per = &Person{ID: cr.PersonID}
			idToPer[cr.PersonID] = per
		}

		subj := idToSubj[cr.SubjectID]
		perToSubjs[per] = append(perToSubjs[per], subj)
	}

	ppl := model.FromIDMap(idToPer)
	if err := loadPeople(ctx, &ppl); err != nil {
		return nil, err
	}

	return perToSubjs, nil
}

func buildCredits(subjs []*Subject, posID int) []*Credit {
	crs := make([]*Credit, 0, len(subjs))
	for _, subj := range subjs {
		crs = append(crs, &Credit{SubjectID: subj.ID, PositionID: posID})
	}
	return crs
}

func loadPeople(ctx context.Context, ppl *[]*Person) error {
	sql := `
		SELECT * FROM people
		WHERE person_id IN ?
	`
	condFunc := func(ppl []*Person) []any {
		return []any{model.ToIDs(ppl)}
	}

	return store.DBReadThrough(ctx, ppl, sql, condFunc)
}

func loadCredits(ctx context.Context, crs *[]*Credit) error {
	sql := `
		SELECT * FROM credits
		WHERE subject_id IN ? AND position_id = ?
	`
	condFunc := func(crs []*Credit) []any {
		if len(crs) == 0 {
			return []any{}
		}
		return []any{model.ToIDs(crs), crs[0].PositionID}
	}

	return store.DBReadThrough(ctx, crs, sql, condFunc)
}

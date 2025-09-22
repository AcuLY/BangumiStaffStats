package person

import (
	"context"

	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

func Build(ctx context.Context, subjs []*m.Subject, posID int) (map[*m.Person][]*m.Subject, error) {
	crs := buildCredits(subjs, posID)
	if err := loadCredits(ctx, &crs); err != nil {
		return nil, err
	}

	idToSubj := m.ToIDMap(subjs)

	idToPer := make(map[int]*m.Person, len(crs)) // 人物需要去重
	perToSubjs := make(map[*m.Person][]*m.Subject, len(crs))
	for _, cr := range crs {
		for _, id := range cr.PersonIDs {
			per, exists := idToPer[id]
			if !exists {
				per = &m.Person{ID: id}
				idToPer[id] = per
			}

			subj := idToSubj[cr.SubjectID]
			perToSubjs[per] = append(perToSubjs[per], subj)
		}
	}

	ppl := m.FromIDMap(idToPer)
	if err := loadPeople(ctx, &ppl); err != nil {
		return nil, err
	}

	return perToSubjs, nil
}

func buildCredits(subjs []*m.Subject, posID int) []*m.CreditGroup {
	crs := make([]*m.CreditGroup, 0, len(subjs))
	for _, subj := range subjs {
		crs = append(crs, &m.CreditGroup{SubjectID: subj.ID, PositionID: posID})
	}
	return crs
}

func loadPeople(ctx context.Context, ppl *[]*m.Person) error {
	sql := `
		SELECT * FROM people
		WHERE person_id IN ?
	`
	condFunc := func(ppl []*m.Person) []any {
		return []any{m.ToIDs(ppl)}
	}

	return store.DBReadThrough(ctx, ppl, sql, condFunc)
}

func loadCredits(ctx context.Context, crs *[]*m.CreditGroup) error {
	sql := `
		SELECT * FROM credits
		WHERE subject_id IN ? AND position_id = ?
	`
	condFunc := func(crs []*m.CreditGroup) []any {
		if len(crs) == 0 {
			return []any{}
		}
		return []any{m.ToIDs(crs), crs[0].PositionID}
	}

	return store.DBReadThroughMany[*m.CreditGroup, m.CreditGroup, *m.Credit](ctx, crs, sql, condFunc, "PersonID")
}

package person

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

func Get(ctx context.Context, ids []model.PersonID) ([]*model.Person, error) {
	sql := `
		SELECT * FROM people
		WHERE person_id IN ?
	`

	return store.DBReadThrough[model.PersonID, *model.Person](ctx, ids, sql, []any{ids})
}

func CreditsByPerson(ctx context.Context, sids []model.SubjectID, posID int) (map[model.PersonID][]model.SubjectID, error) {
	keyCredits := make([]model.Credit, 0, len(sids))
	for _, sid := range sids {
		keyCredits = append(keyCredits, model.Credit{SubjectID: sid, PositionID: posID})
	}

	sql := `
		SELECT * FROM credits
		WHERE subject_id IN ? AND position_id = ?
	`

	credits, err := store.DBReadThrough[model.Credit, model.Credit](ctx, keyCredits, sql, []any{sids, posID})
	if err != nil {
		return nil, err
	}

	persToSubjs := make(map[model.PersonID][]model.SubjectID, len(sids))
	for _, c := range credits {
		persToSubjs[c.PersonID] = append(persToSubjs[c.PersonID], c.SubjectID)
	}

	return persToSubjs, nil
}

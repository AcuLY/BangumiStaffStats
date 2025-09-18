package character

import (
	"context"
	"fmt"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

func Get(ctx context.Context, ids []model.CharacterID) ([]*model.Character, error) {
	sql := `
		SELECT * FROM characters 
		WHERE character_id IN ?
	`

	return store.DBReadThrough[model.CharacterID, *model.Character](ctx, ids, sql, []any{ids})
}

func CharasByPerson(
	ctx context.Context,
	persToSubjs map[model.PersonID][]model.SubjectID,
	posID int,
	orders map[model.SubjectID]int,
) (map[model.PersonID][]model.CharacterID, map[model.CharacterID]model.SubjectID, error) {
	keyObjs := make([]*model.CastKey, 0)
	conds := make([]any, 0)
	for pers, subjs := range persToSubjs {
		for _, subj := range subjs {
			keyObj := &model.CastKey{pers, subj, posID}
			keyObjs = append(keyObjs, keyObj)
			conds = append(conds, *keyObj...)
		}
	}

	// 构造 IN ((?, ?, ?), (?, ?, ?), ...)
	placeholders := make([]string, 0, len(keyObjs))
	for range len(keyObjs) {
		placeholders = append(placeholders, "(?, ?, ?)")
	}
	sql := fmt.Sprintf(`
		SELECT * FROM casts
		WHERE (person_id, subject_id, position_id) IN (%s)
	`, strings.Join(placeholders, ","))

	casts, err := store.DBReadThrough[*model.CastKey, model.Cast](ctx, keyObjs, sql, conds)
	if err != nil {
		return nil, nil, err
	}

	// 可能会有同一角色出现在多个条目的情况，需要选择主条目
	subjSet := make(map[model.Cast]model.SubjectID, len(persToSubjs)) // 键的 Cast 不填 SubjectID
	for _, cast := range casts {
		key := model.Cast{
			Credit:      model.Credit{PersonID: cast.PersonID, PositionID: cast.PositionID},
			CharacterID: cast.CharacterID,
		}
		subj, exists := subjSet[key]

		if !exists || orders[cast.SubjectID] < orders[subj] {
			subjSet[key] = cast.SubjectID
		}
	}
	
	persToCharas := make(map[model.PersonID][]model.CharacterID, len(persToSubjs))
	charaToSubj := make(map[model.CharacterID]model.SubjectID)
	for cast, subj := range subjSet {
		persToCharas[cast.PersonID] = append(persToCharas[cast.PersonID], cast.CharacterID)
		charaToSubj[cast.CharacterID] = subj
	}

	return persToCharas, charaToSubj, nil
}

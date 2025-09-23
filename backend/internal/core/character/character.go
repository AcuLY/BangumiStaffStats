package character

import (
	"context"
	"fmt"
	"strings"

	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

type perChara struct {
	PersonID    int
	CharacterID int
}

func BuildCasts(ctx context.Context, perToSubjs map[*m.Person][]*m.Subject, posID int) (map[*m.Person][]*m.Character, int, error) {
	casts := buildCasts(perToSubjs, posID)
	if err := loadCasts(ctx, &casts); err != nil {
		return nil, 0, err
	}

	// 可能会出现一个人出演的角色出现在多个条目的情况，需要选择主条目
	perToCharas, perCharaToSubj := buildPerToCharas(perToSubjs, casts)

	charas := m.ValuesFlatten(perToCharas)
	if err := loadCharacters(ctx, &charas); err != nil {
		return nil, 0, err
	}

	// loadCharacter 会覆盖指针指向的值，BelongingSubject 需要放到后面填入
	for per, charas := range perToCharas {
		for _, chara := range charas {
			subj := perCharaToSubj[perChara{PersonID: per.ID, CharacterID: chara.ID}]
			chara.BelongingSubject = &m.Subject{Name: subj.Name, NameCN: subj.NameCN}
		}
	}

	return perToCharas, len(charas), nil
}

func buildCasts(perToSubjs map[*m.Person][]*m.Subject, posID int) []*m.Casts {
	casts := make([]*m.Casts, 0)
	for per, subjs := range perToSubjs {
		for _, subj := range subjs {
			casts = append(casts, &m.Casts{PersonID: per.ID, SubjectID: subj.ID, PositionID: posID})
		}
	}
	return casts
}

func buildPerToCharas(perToSubjs map[*m.Person][]*m.Subject, casts []*m.Casts) (map[*m.Person][]*m.Character, map[perChara]*m.Subject) {
	idToPer := m.ToIDMap(m.Keys(perToSubjs))
	idToSubj := m.ToIDMap(m.ValuesFlatten(perToSubjs))

	// (person, character) 对应的 subject 可能不唯一，要选出主条目
	perCharaToSubj := make(map[perChara]*m.Subject, len(casts))
	for _, cast := range casts {
		for _, charaID := range cast.CharacterIDs {
			pc := perChara{PersonID: cast.PersonID, CharacterID: charaID}
			subj := idToSubj[cast.SubjectID]

			prevSubj, exists := perCharaToSubj[pc]
			if !exists || subj.SequelOrder < prevSubj.SequelOrder {
				perCharaToSubj[pc] = subj
			}
		}
	}

	perToCharas := make(map[*m.Person][]*m.Character, len(perToSubjs))
	idToChara := make(map[int]*m.Character, len(casts))
	for pc := range perCharaToSubj {
		per := idToPer[pc.PersonID]
		chara, exists := idToChara[pc.CharacterID]
		if !exists {
			chara = &m.Character{ID: pc.CharacterID}
			idToChara[pc.CharacterID] = chara
		}
		perToCharas[per] = append(perToCharas[per], chara)
	}

	return perToCharas, perCharaToSubj
}

func loadCharacters(ctx context.Context, charas *[]*m.Character) error {
	sql := `
		SELECT * FROM characters 
		WHERE character_id IN ?
	`
	condFunc := func(charas []*m.Character) []any {
		return []any{m.ToIDs(charas)}
	}

	return store.DBReadThrough(ctx, charas, sql, condFunc)
}

func loadCasts(ctx context.Context, casts *[]*m.Casts) error {
	// 占位符长度可能会超出 mysql 最大限制，需要分批查询
	const batchSize = 1000
	allResults := make([]*m.Casts, 0, len(*casts))

	// 构造占位符 ((?,?,?),(?,?,?),...)
	placeholders := make([]string, 0, batchSize)
	for range batchSize {
		placeholders = append(placeholders, "(?, ?, ?)")
	}

	for i := 0; i < len(*casts); i += batchSize {
		end := min(i+batchSize, len(*casts))
		batch := (*casts)[i:end]

		sqlFunc := func(casts []*m.Casts) string {
			return fmt.Sprintf(`
				SELECT subject_id, person_id, position_id, JSON_ARRAYAGG(character_id) as character_ids
				FROM casts
				WHERE (position_id, subject_id, person_id) IN (%s)
				GROUP BY position_id, subject_id, person_id
			`, strings.Join(placeholders[:len(casts)], ","))
		}

		condFunc := func(casts []*m.Casts) []any {
			conds := make([]any, 0, len(casts)*3)
			for _, cast := range casts {
				conds = append(conds, cast.PositionID, cast.SubjectID, cast.PersonID)
			}
			return conds
		}

		err := store.DBReadThroughGenSQL(ctx, &batch, sqlFunc, condFunc)
		if err != nil {
			return err
		}

		allResults = append(allResults, batch...)
	}

	*casts = allResults
	return nil
}

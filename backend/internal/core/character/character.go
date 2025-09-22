package character

import (
	"context"
	"fmt"
	"strings"

	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

func BuildCasts(ctx context.Context, perToSubjs map[*m.Person][]*m.Subject, posID int) (map[*m.Person][]*m.Character, int, error) {
	casts := buildCasts(perToSubjs, posID)
	if err := loadCast(ctx, &casts); err != nil {
		return nil, 0, err
	}

	// 可能会出现一个人出演的角色出现在多个条目的情况，需要选择主条目
	perToChara, charas := buildPerToCharas(perToSubjs, casts)
	if err := loadCharacter(ctx, &charas); err != nil {
		return nil, 0, err
	}

	return perToChara, len(charas), nil
}

func buildCasts(perToSubjs map[*m.Person][]*m.Subject, posID int) []*m.CastGroup {
	casts := make([]*m.CastGroup, 0)
	for per, subjs := range perToSubjs {
		for _, subj := range subjs {
			casts = append(casts, &m.CastGroup{PersonID: per.ID, SubjectID: subj.ID, PositionID: posID})
		}
	}
	return casts
}

func buildPerToCharas(perToSubjs map[*m.Person][]*m.Subject, casts []*m.CastGroup) (map[*m.Person][]*m.Character, []*m.Character) {
	type perChara struct {
		PersonID    int
		CharacterID int
	}
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

	perToChara := make(map[*m.Person][]*m.Character, len(perToSubjs))
	idToChara := make(map[int]*m.Character, len(casts))
	for pc, subj := range perCharaToSubj {
		per := idToPer[pc.PersonID]
		chara, exists := idToChara[pc.CharacterID]
		if !exists {
			chara = &m.Character{ID: pc.CharacterID, BelongingSubject: subj}
			idToChara[pc.CharacterID] = chara
		}
		perToChara[per] = append(perToChara[per], chara)
	}

	return perToChara, m.FromIDMap(idToChara)
}

func loadCharacter(ctx context.Context, charas *[]*m.Character) error {
	sql := `
		SELECT * FROM characters 
		WHERE character_id IN ?
	`
	condFunc := func(charas []*m.Character) []any {
		return []any{m.ToIDs(charas)}
	}

	return store.DBReadThrough(ctx, charas, sql, condFunc)
}

func loadCast(ctx context.Context, casts *[]*m.CastGroup) error {
	// 构造 IN ((?, ?, ?), (?, ?, ?), ...)
	placeholders := make([]string, 0, len(*casts))
	for range len(*casts) {
		placeholders = append(placeholders, "(?, ?, ?)")
	}

	sql := fmt.Sprintf(`
		SELECT * FROM casts
		WHERE (subject_id, person_id, position_id) IN (%s)
	`, strings.Join(placeholders, ","))

	confFunc := func(casts []*m.CastGroup) []any {
		conds := make([]any, 0, len(casts))
		for _, cast := range casts {
			conds = append(conds, []any{cast.SubjectID, cast.PersonID, cast.PositionID}...) // 主键顺序 subject 在 person 前
		}
		return conds
	}

	return store.DBReadThroughMany[*m.CastGroup, m.CastGroup, *m.Cast](ctx, casts, sql, confFunc, "CharacterID")
}

package query

import (
	"context"
	"fmt"
)

// unrestrictedPositions resolves factual identities, not display aliases. Raw
// retained staff need not have a selectable catalog entry. FactSet cast already
// carries the Archive exact/eligible gate; restrict it to the admitted media and
// exact numeric roles without interpreting staff IDs as cast.
func (e *contributionEngine) unrestrictedPositions(ctx context.Context, subjectType string) ([]string, error) {
	keys := make([]string, 0, len(e.staff)+1)
	for id, credits := range e.staff {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		present := false
		for _, credit := range credits {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			if _, ok := e.eligible[credit.SubjectID]; ok {
				present = true
				break
			}
		}
		if !present {
			continue
		}
		key := fmt.Sprintf("staff:%s:%d", subjectType, id)
		e.plans[key] = SelectionPlan{PositionKey: key, RuleKind: "exactStaff", PositionID: id}
		keys = append(keys, key)
	}
	if subjectType == "anime" || subjectType == "game" {
		key := "cast:" + subjectType + ":all"
		e.plans[key] = SelectionPlan{PositionKey: key, RuleKind: "exactCast", RoleTypes: []int64{1, 2, 3, 4, 5, 6}}
		keys = append(keys, key)
	}
	if err := sortSliceContext(ctx, keys, func(i, j int) bool { return keys[i] < keys[j] }); err != nil {
		return nil, err
	}
	return keys, nil
}

func unionRankingPeople(ctx context.Context, positions []PositionResult) ([]PersonSubjects, error) {
	byPerson := make(map[int64]map[int64]struct{})
	for _, position := range positions {
		for _, credit := range position.Contributions {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			if byPerson[credit.PersonID] == nil {
				byPerson[credit.PersonID] = make(map[int64]struct{})
			}
			byPerson[credit.PersonID][credit.SubjectID] = struct{}{}
		}
	}
	result := make([]PersonSubjects, 0, len(byPerson))
	for id, subjects := range byPerson {
		ids := make([]int64, 0, len(subjects))
		for subject := range subjects {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			ids = append(ids, subject)
		}
		ids, err := sortedUniqueInt64(ctx, ids)
		if err != nil {
			return nil, err
		}
		result = append(result, PersonSubjects{PersonID: id, SubjectIDs: ids})
	}
	if err := sortSliceContext(ctx, result, func(i, j int) bool { return result[i].PersonID < result[j].PersonID }); err != nil {
		return nil, err
	}
	return result, nil
}

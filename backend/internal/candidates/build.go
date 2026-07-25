package candidates

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Build creates one immutable current-position core from independent query
// PositionResults. It deliberately ignores Query.RankingPeople, whose
// multi-position AND semantics belong only to rankings.
func Build(ctx context.Context, request BuildRequest) (Core, error) {
	if err := contextError(ctx); err != nil {
		return Core{}, err
	}
	if request.PositionKey == "" {
		return Core{}, fieldError("/input/positionKey")
	}

	positions, current, err := validatePositions(request.Query, request.PositionKey)
	if err != nil {
		return Core{}, err
	}
	references, err := indexPeople(request.People)
	if err != nil {
		return Core{}, err
	}
	people, participating, err := independentPeople(ctx, current)
	if err != nil {
		return Core{}, err
	}
	for _, person := range people {
		if _, found := references[person.PersonID]; !found {
			return Core{}, &Error{
				code: CodePersonReferenceMissing,
				path: "/people",
			}
		}
	}

	effective := request.Query.EffectiveQuery
	effective.PositionKeys = []string{request.PositionKey}
	evaluation, err := statistics.Evaluate(ctx, statistics.EvaluationRequest{
		DataVersion: request.DataVersion,
		Result: query.Result{
			EffectiveQuery:          effective,
			QueryDigest:             request.Query.QueryDigest,
			CollectionAccessCount:   request.Query.CollectionAccessCount,
			EligibleSubjectIDs:      append([]int64(nil), request.Query.EligibleSubjectIDs...),
			PositionResults:         []query.PositionResult{clonePositionResult(current)},
			RankingPeople:           people,
			ParticipatingSubjectIDs: participating,
		},
		Facts:           request.Facts,
		PersonalEntries: request.PersonalEntries,
		Series:          request.Series,
	})
	if err != nil {
		return Core{}, evaluationError(ctx, err)
	}

	rows := make([]Row, 0, len(evaluation.People))
	for _, person := range evaluation.People {
		if err := contextError(ctx); err != nil {
			return Core{}, err
		}
		row := Row{
			Person:           clonePerson(references[person.PersonID]),
			WorkCount:        len(person.Units),
			GlobalAverage:    cloneInt64(person.Global.AverageHundredths),
			GlobalRatedCount: person.Global.RatedUnitCount,
		}
		if person.Personal != nil {
			row.PersonalAverage = cloneInt64(person.Personal.AverageHundredths)
			row.PersonalRatedCount = person.Personal.RatedUnitCount
		}
		rows = append(rows, row)
	}
	sort.Slice(rows, func(left, right int) bool {
		return rows[left].Person.ID < rows[right].Person.ID
	})

	return Core{
		DataVersion:    request.DataVersion,
		QueryDigest:    request.Query.QueryDigest,
		Scope:          request.Query.EffectiveQuery.Scope,
		PositionKey:    request.PositionKey,
		WorkUnit:       evaluation.UnitKind,
		PositionCounts: positions,
		Rows:           rows,
	}, nil
}

func validatePositions(
	result query.Result,
	currentKey string,
) ([]PositionCount, query.PositionResult, error) {
	if len(result.EffectiveQuery.PositionKeys) == 0 ||
		len(result.PositionResults) != len(result.EffectiveQuery.PositionKeys) {
		return nil, query.PositionResult{}, fieldError("/query/positionKeys")
	}
	seen := make(map[string]struct{}, len(result.PositionResults))
	counts := make([]PositionCount, len(result.PositionResults))
	var current query.PositionResult
	foundCurrent := false
	for index, key := range result.EffectiveQuery.PositionKeys {
		position := result.PositionResults[index]
		if key == "" || position.PositionKey != key {
			return nil, query.PositionResult{}, fieldError("/query/positionKeys")
		}
		if _, duplicate := seen[key]; duplicate {
			return nil, query.PositionResult{}, fieldError("/query/positionKeys")
		}
		seen[key] = struct{}{}
		if !strictPositiveUnique(position.CandidatePersonIDs) {
			return nil, query.PositionResult{}, fieldError("/query/positionKeys")
		}
		counts[index] = PositionCount{
			PositionKey: key,
			Count:       len(position.CandidatePersonIDs),
		}
		if key == currentKey {
			current = position
			foundCurrent = true
		}
	}
	if !foundCurrent {
		return nil, query.PositionResult{}, fieldError("/input/positionKey")
	}
	return counts, current, nil
}

func independentPeople(
	ctx context.Context,
	position query.PositionResult,
) ([]query.PersonSubjects, []int64, error) {
	subjectsByPerson := make(map[int64]map[int64]struct{}, len(position.CandidatePersonIDs))
	for _, personID := range position.CandidatePersonIDs {
		subjectsByPerson[personID] = make(map[int64]struct{})
	}
	for _, contribution := range position.Contributions {
		if err := contextError(ctx); err != nil {
			return nil, nil, err
		}
		if contribution.SubjectID <= 0 || contribution.PersonID <= 0 {
			return nil, nil, fieldError("/query/positionKeys")
		}
		subjects, found := subjectsByPerson[contribution.PersonID]
		if !found {
			return nil, nil, fieldError("/query/positionKeys")
		}
		subjects[contribution.SubjectID] = struct{}{}
	}

	people := make([]query.PersonSubjects, 0, len(position.CandidatePersonIDs))
	participatingSet := make(map[int64]struct{})
	for _, personID := range position.CandidatePersonIDs {
		subjectSet := subjectsByPerson[personID]
		if len(subjectSet) == 0 {
			return nil, nil, fieldError("/query/positionKeys")
		}
		subjectIDs := sortedKeys(subjectSet)
		for _, subjectID := range subjectIDs {
			participatingSet[subjectID] = struct{}{}
		}
		people = append(people, query.PersonSubjects{
			PersonID:   personID,
			SubjectIDs: subjectIDs,
		})
	}
	return people, sortedKeys(participatingSet), nil
}

func indexPeople(values []PersonReference) (map[int64]PersonReference, error) {
	result := make(map[int64]PersonReference, len(values))
	for _, value := range values {
		if value.ID <= 0 || value.Name == "" {
			return nil, fieldError("/people")
		}
		if value.NameCN != nil && *value.NameCN == "" {
			return nil, fieldError("/people")
		}
		if _, duplicate := result[value.ID]; duplicate {
			return nil, fieldError("/people")
		}
		result[value.ID] = clonePerson(value)
	}
	return result, nil
}

func strictPositiveUnique(values []int64) bool {
	previous := int64(0)
	for _, value := range values {
		if value <= 0 || value <= previous {
			return false
		}
		previous = value
	}
	return true
}

func sortedKeys(values map[int64]struct{}) []int64 {
	result := make([]int64, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left] < result[right]
	})
	return result
}

func clonePositionResult(value query.PositionResult) query.PositionResult {
	value.CandidatePersonIDs = append([]int64(nil), value.CandidatePersonIDs...)
	value.CandidateSubjectIDs = append([]int64(nil), value.CandidateSubjectIDs...)
	value.Contributions = append([]query.Contribution(nil), value.Contributions...)
	for index := range value.Contributions {
		if value.Contributions[index].SortOrder != nil {
			order := *value.Contributions[index].SortOrder
			value.Contributions[index].SortOrder = &order
		}
	}
	return value
}

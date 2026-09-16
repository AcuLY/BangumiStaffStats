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
	if request.CommonSubjects != nil {
		filtered, err := filterCandidatePositions(ctx, request.Query.PositionResults, request.CommonSubjects)
		if err != nil {
			return Core{}, err
		}
		request.Query.PositionResults = filtered
	}
	positions, selected, err := validatePositions(request.Query, request.PositionKey)
	if err != nil {
		return Core{}, err
	}
	references, err := indexPeople(request.People)
	if err != nil {
		return Core{}, err
	}
	people, participating, positionKeysByPerson, err := independentPeople(ctx, selected)
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
	effective.PositionKeys = make([]string, len(selected))
	positionResults := make([]query.PositionResult, len(selected))
	for index, position := range selected {
		effective.PositionKeys[index] = position.PositionKey
		positionResults[index] = clonePositionResult(position)
	}
	evaluation, err := statistics.EvaluateCandidateMetrics(ctx, statistics.EvaluationRequest{
		DataVersion: request.DataVersion,
		Result: query.Result{
			EffectiveQuery:          effective,
			QueryDigest:             request.Query.QueryDigest,
			CollectionAccessCount:   request.Query.CollectionAccessCount,
			EligibleSubjectIDs:      append([]int64(nil), request.Query.EligibleSubjectIDs...),
			PositionResults:         positionResults,
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
			Person:             clonePerson(references[person.PersonID]),
			PositionKeys:       append([]string(nil), positionKeysByPerson[person.PersonID]...),
			WorkCount:          person.WorkCount,
			GlobalAverage:      cloneInt64(person.GlobalAverage),
			GlobalRatedCount:   person.GlobalRatedCount,
			PersonalAverage:    cloneInt64(person.PersonalAverage),
			PersonalRatedCount: person.PersonalRatedCount,
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
) ([]PositionCount, []query.PositionResult, error) {
	if (len(result.EffectiveQuery.PositionKeys) == 0 && result.EffectiveQuery.PositionScope != "all") ||
		len(result.PositionResults) != len(result.EffectiveQuery.PositionKeys) {
		return nil, nil, fieldError("/query/positionKeys")
	}
	seen := make(map[string]struct{}, len(result.PositionResults))
	counts := make([]PositionCount, len(result.PositionResults))
	selected := make([]query.PositionResult, 0, len(result.PositionResults))
	for index, key := range result.EffectiveQuery.PositionKeys {
		position := result.PositionResults[index]
		if key == "" || position.PositionKey != key {
			return nil, nil, fieldError("/query/positionKeys")
		}
		if _, duplicate := seen[key]; duplicate {
			return nil, nil, fieldError("/query/positionKeys")
		}
		seen[key] = struct{}{}
		if !strictPositiveUnique(position.CandidatePersonIDs) {
			return nil, nil, fieldError("/query/positionKeys")
		}
		counts[index] = PositionCount{
			PositionKey: key,
			Count:       len(position.CandidatePersonIDs),
		}
		if currentKey == "" || key == currentKey {
			selected = append(selected, position)
		}
	}
	if len(selected) == 0 && !(result.EffectiveQuery.PositionScope == "all" && currentKey == "" && len(result.EffectiveQuery.PositionKeys) == 0) {
		return nil, nil, fieldError("/input/positionKey")
	}
	return counts, selected, nil
}

func independentPeople(
	ctx context.Context,
	positions []query.PositionResult,
) ([]query.PersonSubjects, []int64, map[int64][]string, error) {
	subjectsByPerson := make(map[int64]map[int64]struct{})
	positionKeysByPerson := make(map[int64][]string)
	for _, position := range positions {
		for _, personID := range position.CandidatePersonIDs {
			if subjectsByPerson[personID] == nil {
				subjectsByPerson[personID] = make(map[int64]struct{})
			}
			positionKeysByPerson[personID] = append(
				positionKeysByPerson[personID],
				position.PositionKey,
			)
		}
	}
	for _, position := range positions {
		for _, contribution := range position.Contributions {
			if err := contextError(ctx); err != nil {
				return nil, nil, nil, err
			}
			if contribution.SubjectID <= 0 || contribution.PersonID <= 0 {
				return nil, nil, nil, fieldError("/query/positionKeys")
			}
			subjects, found := subjectsByPerson[contribution.PersonID]
			if !found {
				return nil, nil, nil, fieldError("/query/positionKeys")
			}
			subjects[contribution.SubjectID] = struct{}{}
		}
	}

	personIDs := sortedKeys(subjectsByPerson)
	people := make([]query.PersonSubjects, 0, len(personIDs))
	participatingSet := make(map[int64]struct{})
	for _, personID := range personIDs {
		subjectSet := subjectsByPerson[personID]
		if len(subjectSet) == 0 {
			return nil, nil, nil, fieldError("/query/positionKeys")
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
	return people, sortedKeys(participatingSet), positionKeysByPerson, nil
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

func sortedKeys[T any](values map[int64]T) []int64 {
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

// Filter identities by exact overlap but retain their complete query-filtered
// contributions for the established candidate metrics. Never mutate query facts.
func filterCandidatePositions(ctx context.Context, positions []query.PositionResult, common []int64) ([]query.PositionResult, error) {
	subjects := make(map[int64]bool, len(common))
	for _, id := range common {
		subjects[id] = true
	}
	result := make([]query.PositionResult, len(positions))
	for i, position := range positions {
		valid := make(map[int64]bool)
		for _, credit := range position.Contributions {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			if subjects[credit.SubjectID] {
				valid[credit.PersonID] = true
			}
		}
		filtered := query.PositionResult{PositionKey: position.PositionKey}
		for _, id := range position.CandidatePersonIDs {
			if valid[id] {
				filtered.CandidatePersonIDs = append(filtered.CandidatePersonIDs, id)
			}
		}
		participating := make(map[int64]bool)
		for _, credit := range position.Contributions {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			if valid[credit.PersonID] {
				filtered.Contributions = append(filtered.Contributions, credit)
				participating[credit.SubjectID] = true
			}
		}
		filtered.CandidateSubjectIDs = sortedKeys(participating)
		result[i] = filtered
	}
	return result, nil
}

package partners

import (
	"context"
	"fmt"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

type partnerEvidence struct {
	subjects  map[int64]struct{}
	positions map[string]struct{}
}

// Build creates one immutable complete partners core. Source and candidate
// identities intersect at raw Subject level before statistics may merge series.
func Build(ctx context.Context, request BuildRequest) (Core, error) {
	if err := contextError(ctx); err != nil {
		return Core{}, err
	}
	if request.DataVersion == "" || request.Query.QueryDigest == "" {
		return Core{}, fieldError("")
	}
	if request.Input.Source.PersonID <= 0 || len(request.Input.Source.PositionKeys) == 0 {
		return Core{}, fieldError("/input/source")
	}

	positions, positionOrder, err := indexPositionResults(request.Query)
	if err != nil {
		return Core{}, err
	}
	if err := validateBuildInput(request.Input, positions); err != nil {
		return Core{}, err
	}
	references, err := indexPeople(request.People)
	if err != nil {
		return Core{}, err
	}
	sourceReference, found := references[request.Input.Source.PersonID]
	if !found {
		return Core{}, fail(
			CodeEntityNotFound,
			"source person was not found",
			"/input/source/personId",
			"",
			false,
			nil,
		)
	}

	sourceSubjects := make(map[int64]struct{})
	for index, key := range request.Input.Source.PositionKeys {
		matched := false
		for _, contribution := range positions[key].Contributions {
			if err := contextError(ctx); err != nil {
				return Core{}, err
			}
			if contribution.PersonID == request.Input.Source.PersonID {
				matched = true
				sourceSubjects[contribution.SubjectID] = struct{}{}
			}
		}
		if !matched {
			return Core{}, requestFailure(
				"source identity does not match the source person",
				fmt.Sprintf("/input/source/positionKeys/%d", index),
				string(CodePositionNotFound),
			)
		}
	}

	candidateKeys := positionOrder
	if request.Input.CandidatePositionKey != nil {
		candidateKeys = []string{*request.Input.CandidatePositionKey}
	}
	evidenceByPerson := make(map[int64]*partnerEvidence)
	for _, key := range candidateKeys {
		position := positions[key]
		for _, contribution := range position.Contributions {
			if err := contextError(ctx); err != nil {
				return Core{}, err
			}
			if contribution.PersonID == request.Input.Source.PersonID {
				continue
			}
			if _, common := sourceSubjects[contribution.SubjectID]; !common {
				continue
			}
			evidence := evidenceByPerson[contribution.PersonID]
			if evidence == nil {
				evidence = &partnerEvidence{
					subjects:  make(map[int64]struct{}),
					positions: make(map[string]struct{}),
				}
				evidenceByPerson[contribution.PersonID] = evidence
			}
			evidence.subjects[contribution.SubjectID] = struct{}{}
			evidence.positions[key] = struct{}{}
		}
	}

	partnerIDs := make([]int64, 0, len(evidenceByPerson))
	for personID, evidence := range evidenceByPerson {
		if len(evidence.subjects) == 0 {
			continue
		}
		if _, exists := references[personID]; !exists {
			return Core{}, &Error{code: CodePersonReferenceMissing, path: "/people"}
		}
		partnerIDs = append(partnerIDs, personID)
	}
	sort.Slice(partnerIDs, func(left, right int) bool { return partnerIDs[left] < partnerIDs[right] })

	participantSets := make([]query.ParticipantSet, 0, len(partnerIDs)+1)
	participantSets = append(participantSets, query.ParticipantSet{
		RequestID:  "source",
		SubjectIDs: sortedSubjectIDs(sourceSubjects),
	})
	for _, personID := range partnerIDs {
		participantSets = append(participantSets, query.ParticipantSet{
			RequestID:  partnerRequestID(personID),
			SubjectIDs: sortedSubjectIDs(evidenceByPerson[personID].subjects),
		})
	}

	evaluation, err := statistics.Evaluate(ctx, statistics.EvaluationRequest{
		DataVersion: request.DataVersion,
		Result: query.Result{
			EffectiveQuery:          cloneEffectiveQuery(request.Query.EffectiveQuery),
			QueryDigest:             request.Query.QueryDigest,
			CollectionAccessCount:   request.Query.CollectionAccessCount,
			EligibleSubjectIDs:      append([]int64{}, request.Query.EligibleSubjectIDs...),
			PositionResults:         clonePositionResults(request.Query.PositionResults),
			ParticipatingSubjectIDs: append([]int64{}, request.Query.ParticipatingSubjectIDs...),
			ParticipantSets:         participantSets,
		},
		Facts:           request.Facts,
		PersonalEntries: cloneCollectionEntries(request.PersonalEntries),
		Series:          request.Series,
	})
	if err != nil {
		return Core{}, evaluationError(ctx, err)
	}
	if len(evaluation.Sets) != len(participantSets) ||
		evaluation.Sets[0].RequestID != "source" {
		return Core{}, evaluationError(ctx, fmt.Errorf("partners: incomplete participant evaluation"))
	}

	sourceRating, err := selectedRating(request.Query.EffectiveQuery.Scope, evaluation.Sets[0])
	if err != nil {
		return Core{}, err
	}
	core := Core{
		DataVersion: request.DataVersion,
		QueryDigest: request.Query.QueryDigest,
		Scope:       request.Query.EffectiveQuery.Scope,
		WorkUnit:    evaluation.UnitKind,
		Source: SourceCore{
			Person:       clonePerson(sourceReference),
			PositionKeys: append([]string{}, request.Input.Source.PositionKeys...),
			Metrics: SourceMetrics{
				WorkCount:      len(evaluation.Sets[0].Units),
				RatedWorkCount: sourceRating.RatedUnitCount,
				Average:        cloneInt64(sourceRating.AverageHundredths),
			},
		},
		Partners: make([]PartnerCore, 0, len(partnerIDs)),
	}
	for index, personID := range partnerIDs {
		if err := contextError(ctx); err != nil {
			return Core{}, err
		}
		set := evaluation.Sets[index+1]
		if set.RequestID != partnerRequestID(personID) {
			return Core{}, evaluationError(ctx, fmt.Errorf("partners: participant evaluation order changed"))
		}
		rating, ratingErr := selectedRating(request.Query.EffectiveQuery.Scope, set)
		if ratingErr != nil {
			return Core{}, ratingErr
		}
		evidence := evidenceByPerson[personID]
		core.Partners = append(core.Partners, PartnerCore{
			Person:       clonePerson(references[personID]),
			PositionKeys: orderedContributingPositions(positionOrder, evidence.positions),
			Metrics: Metrics{
				WorkCount:      len(set.Units),
				RatedWorkCount: rating.RatedUnitCount,
				Average:        cloneInt64(rating.AverageHundredths),
				Overall:        cloneInt64(rating.OverallHundredths),
			},
			Preference: projectPreference(set.Preference),
		})
	}
	return core, nil
}

func indexPositionResults(
	result query.Result,
) (map[string]query.PositionResult, []string, error) {
	if len(result.EffectiveQuery.PositionKeys) == 0 ||
		len(result.PositionResults) != len(result.EffectiveQuery.PositionKeys) {
		return nil, nil, fieldError("/query/positionKeys")
	}
	positions := make(map[string]query.PositionResult, len(result.PositionResults))
	order := append([]string{}, result.EffectiveQuery.PositionKeys...)
	for index, key := range order {
		position := result.PositionResults[index]
		if key == "" || position.PositionKey != key {
			return nil, nil, fieldError("/query/positionKeys")
		}
		if _, duplicate := positions[key]; duplicate {
			return nil, nil, fieldError("/query/positionKeys")
		}
		candidates := make(map[int64]struct{}, len(position.CandidatePersonIDs))
		for _, personID := range position.CandidatePersonIDs {
			if personID <= 0 {
				return nil, nil, fieldError("/query/positionKeys")
			}
			if _, duplicate := candidates[personID]; duplicate {
				return nil, nil, fieldError("/query/positionKeys")
			}
			candidates[personID] = struct{}{}
		}
		for _, contribution := range position.Contributions {
			if contribution.PositionKey != key ||
				contribution.PersonID <= 0 ||
				contribution.SubjectID <= 0 {
				return nil, nil, fieldError("/query/positionKeys")
			}
			if _, exists := candidates[contribution.PersonID]; !exists {
				return nil, nil, fieldError("/query/positionKeys")
			}
		}
		positions[key] = position
	}
	return positions, order, nil
}

func validateBuildInput(input Input, positions map[string]query.PositionResult) error {
	seen := make(map[string]struct{}, len(input.Source.PositionKeys))
	for index, key := range input.Source.PositionKeys {
		if key == "" {
			return fieldError(fmt.Sprintf("/input/source/positionKeys/%d", index))
		}
		if _, duplicate := seen[key]; duplicate {
			return fieldError(fmt.Sprintf("/input/source/positionKeys/%d", index))
		}
		seen[key] = struct{}{}
		if _, exists := positions[key]; !exists {
			return fieldError(fmt.Sprintf("/input/source/positionKeys/%d", index))
		}
	}
	if input.CandidatePositionKey != nil {
		if _, exists := positions[*input.CandidatePositionKey]; !exists {
			return fieldError("/input/candidatePositionKey")
		}
	}
	return nil
}

func indexPeople(values []PersonReference) (map[int64]PersonReference, error) {
	result := make(map[int64]PersonReference, len(values))
	for _, value := range values {
		if value.ID <= 0 || value.ID > maxJSONSafeInteger || value.Name == "" {
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

func selectedRating(scope string, set statistics.SetEvaluation) (*statistics.RatingSummary, error) {
	switch scope {
	case "global":
		copy := set.Global
		return &copy, nil
	case "personal":
		if set.Personal == nil {
			return nil, evaluationError(context.Background(), fmt.Errorf("partners: personal rating missing"))
		}
		copy := *set.Personal
		return &copy, nil
	default:
		return nil, fieldError("/query/scope")
	}
}

func projectPreference(value *statistics.PreferenceSummary) *Preference {
	if value == nil {
		return nil
	}
	return &Preference{
		ComparableCount:       value.ComparableCount,
		ComparableSeriesCount: value.ComparableSeriesCount,
		EffectiveEvidence:     value.EffectiveEvidence,
		Mean:                  cloneRational(value.Mean),
		EvidenceWeight:        value.EvidenceWeight,
		Score:                 cloneRational(value.Score),
	}
}

func cloneRational(value *statistics.Rational) *statistics.Rational {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func orderedContributingPositions(order []string, selected map[string]struct{}) []string {
	result := make([]string, 0, len(selected))
	for _, key := range order {
		if _, exists := selected[key]; exists {
			result = append(result, key)
		}
	}
	return result
}

func sortedSubjectIDs(values map[int64]struct{}) []int64 {
	result := make([]int64, 0, len(values))
	for subjectID := range values {
		result = append(result, subjectID)
	}
	sort.Slice(result, func(left, right int) bool { return result[left] < result[right] })
	return result
}

func partnerRequestID(personID int64) string {
	return fmt.Sprintf("partner:%d", personID)
}

func cloneEffectiveQuery(value query.EffectiveQuery) query.EffectiveQuery {
	value.CollectionStatuses = append([]string{}, value.CollectionStatuses...)
	value.PositionKeys = append([]string{}, value.PositionKeys...)
	return value
}

func clonePositionResults(values []query.PositionResult) []query.PositionResult {
	result := append([]query.PositionResult{}, values...)
	for index := range result {
		result[index].CandidatePersonIDs = append([]int64{}, result[index].CandidatePersonIDs...)
		result[index].CandidateSubjectIDs = append([]int64{}, result[index].CandidateSubjectIDs...)
		result[index].Contributions = append([]query.Contribution{}, result[index].Contributions...)
		for contributionIndex := range result[index].Contributions {
			if result[index].Contributions[contributionIndex].SortOrder != nil {
				copy := *result[index].Contributions[contributionIndex].SortOrder
				result[index].Contributions[contributionIndex].SortOrder = &copy
			}
		}
	}
	return result
}

func cloneCollectionEntries(values []query.CollectionEntry) []query.CollectionEntry {
	result := append([]query.CollectionEntry{}, values...)
	for index := range result {
		if result[index].PersonalScore != nil {
			copy := *result[index].PersonalScore
			result[index].PersonalScore = &copy
		}
		result[index].Tags = append([]string{}, result[index].Tags...)
	}
	return result
}

package statistics

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// CandidateMetrics contains only the statistical values used by candidate pages.
type CandidateMetrics struct {
	PersonID           int64
	WorkCount          int
	GlobalAverage      *int64
	GlobalRatedCount   int
	PersonalAverage    *int64
	PersonalRatedCount int
}

// CandidateEvaluation excludes contribution evidence, charts and summaries.
type CandidateEvaluation struct {
	UnitKind UnitKind
	People   []CandidateMetrics
}

// EvaluateCandidateMetrics preserves Evaluate's unit and rating semantics while
// computing only candidate counts and averages. Errors return no partial result.
func EvaluateCandidateMetrics(ctx context.Context, request EvaluationRequest) (*CandidateEvaluation, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if !validDataVersion(request.DataVersion) || request.Result.QueryDigest == "" ||
		!validSubjectType(request.Result.EffectiveQuery.SubjectType) {
		return nil, outcome(CodeInputInvalid)
	}
	kind := UnitSubject
	if request.Result.EffectiveQuery.MergeSeries {
		kind = UnitSeries
	}
	personalScope := request.Result.EffectiveQuery.Scope == "personal"
	if !personalScope && request.Result.EffectiveQuery.Scope != "global" {
		return nil, outcome(CodeInputInvalid)
	}
	if (kind == UnitSeries || personalScope) &&
		(request.Series == nil || request.Series.DataVersion() != request.DataVersion) {
		return nil, outcome(CodeVersionMismatch)
	}
	// These indexes retain only references to immutable input facts, avoiding
	// copies of unrelated rating distributions and tags.
	subjects := make(map[int64]query.Subject, len(request.Facts.Subjects))
	for _, subject := range request.Facts.Subjects {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if subject.SubjectID <= 0 || !validSubjectType(subject.SubjectType) {
			return nil, outcome(CodeInputInvalid)
		}
		if _, exists := subjects[subject.SubjectID]; exists {
			return nil, outcome(CodeInputInvalid)
		}
		subjects[subject.SubjectID] = subject
	}
	personal := make(map[int64]*float64)
	if personalScope {
		for _, entry := range request.PersonalEntries {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			if entry.SubjectID <= 0 {
				return nil, outcome(CodeInputInvalid)
			}
			if _, exists := personal[entry.SubjectID]; exists {
				return nil, outcome(CodeInputInvalid)
			}
			personal[entry.SubjectID] = entry.PersonalScore
		}
	}
	globalScore := func(id int64) *float64 { return subjects[id].GlobalScore }
	personalScore := func(id int64) *float64 { return personal[id] }
	globalCache := make(map[int64]decimal)
	personalCache := make(map[int64]decimal)
	people := make([]CandidateMetrics, 0, len(request.Result.RankingPeople))
	seenPeople := make(map[int64]struct{}, len(request.Result.RankingPeople))
	for _, person := range request.Result.RankingPeople {
		if person.PersonID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := seenPeople[person.PersonID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		seenPeople[person.PersonID] = struct{}{}
		ids, err := sortedUniquePositive(ctx, person.SubjectIDs)
		if err != nil {
			return nil, err
		}
		groups := make(map[int64][]int64)
		globalValues := make([]decimal, 0, len(ids))
		personalValues := make([]decimal, 0, len(ids))
		for _, id := range ids {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			subject, exists := subjects[id]
			if !exists || subject.SubjectType != request.Result.EffectiveQuery.SubjectType {
				return nil, outcome(CodeInputInvalid)
			}
			if kind == UnitSeries {
				component, exists := request.Series.bySubject[subjectKey{subjectType: subject.SubjectType, subjectID: id}]
				if !exists {
					return nil, outcome(CodeInputInvalid)
				}
				groups[component.seriesID] = append(groups[component.seriesID], id)
				continue
			}
			globalValues, err = appendCandidateSubjectScore(globalValues, id, globalScore, globalCache)
			if err != nil {
				return nil, err
			}
			if personalScope {
				personalValues, err = appendCandidateSubjectScore(personalValues, id, personalScore, personalCache)
				if err != nil {
					return nil, err
				}
			}
		}
		workCount := len(ids)
		if kind == UnitSeries {
			workCount = len(groups)
			for _, matched := range groups {
				if err := contextError(ctx); err != nil {
					return nil, err
				}
				globalValues, err = appendCandidateUnitScore(globalValues, matched, globalScore)
				if err != nil {
					return nil, err
				}
				if personalScope {
					personalValues, err = appendCandidateUnitScore(personalValues, matched, personalScore)
					if err != nil {
						return nil, err
					}
				}
			}
		}
		globalAverage, err := candidateAverage(globalValues)
		if err != nil {
			return nil, err
		}
		personalAverage, err := candidateAverage(personalValues)
		if err != nil {
			return nil, err
		}
		people = append(people, CandidateMetrics{
			PersonID: person.PersonID, WorkCount: workCount,
			GlobalAverage: globalAverage, GlobalRatedCount: len(globalValues),
			PersonalAverage: personalAverage, PersonalRatedCount: len(personalValues),
		})
	}
	sort.Slice(people, func(i, j int) bool { return people[i].PersonID < people[j].PersonID })
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return &CandidateEvaluation{UnitKind: kind, People: people}, nil
}

func appendCandidateSubjectScore(values []decimal, id int64, score func(int64) *float64, cache map[int64]decimal) ([]decimal, error) {
	value, exists := cache[id]
	if !exists {
		unitValues, err := appendCandidateUnitScore(nil, []int64{id}, score)
		if err != nil {
			return nil, err
		}
		if len(unitValues) != 0 {
			value = unitValues[0]
		}
		cache[id] = value
	}
	if value.value != nil {
		values = append(values, value)
	}
	return values, nil
}

func appendCandidateUnitScore(values []decimal, ids []int64, score func(int64) *float64) ([]decimal, error) {
	normalized, err := normalizedScore(ids, score)
	if err != nil || normalized == nil {
		return values, err
	}
	value, valid, err := decimalFromFloat(*normalized)
	if err != nil {
		return nil, err
	}
	if valid {
		values = append(values, value)
	}
	return values, nil
}

func candidateAverage(values []decimal) (*int64, error) {
	if len(values) == 0 {
		return nil, nil
	}
	average, err := averageHundredths(values)
	if err != nil {
		return nil, err
	}
	return &average, nil
}

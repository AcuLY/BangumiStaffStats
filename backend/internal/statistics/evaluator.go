package statistics

import (
	"context"
	"math"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// EvaluationRequest binds accepted query output and facts to one immutable
// Archive version. PersonalEntries are inspected only for personal scope.
type EvaluationRequest struct {
	DataVersion     string
	Result          query.Result
	Facts           query.FactSet
	PersonalEntries []query.CollectionEntry
	Series          *SeriesIndex
}

// PersonEvaluation is the complete reusable statistics core for one person.
type PersonEvaluation struct {
	PersonID   int64
	Units      []Unit
	Global     RatingSummary
	Personal   *RatingSummary
	Preference *PreferenceSummary
}

// SetEvaluation evaluates one already-intersected raw participant set.
type SetEvaluation struct {
	RequestID  string
	Units      []Unit
	Global     RatingSummary
	Personal   *RatingSummary
	Preference *PreferenceSummary
}

// Evaluation is immutable by construction; exported slices are freshly
// allocated and no internal cache or global publication is retained.
type Evaluation struct {
	DataVersion    string
	QueryDigest    string
	Scope          string
	UnitKind       UnitKind
	CastApplicable bool
	People         []PersonEvaluation
	Sets           []SetEvaluation
	Summary        Summary
}

// Evaluate materializes canonical units once and derives all person and
// participant-set metrics from that same complete core.
func Evaluate(ctx context.Context, request EvaluationRequest) (*Evaluation, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if !validDataVersion(request.DataVersion) || request.Result.QueryDigest == "" {
		return nil, outcome(CodeInputInvalid)
	}
	kind := UnitSubject
	if request.Result.EffectiveQuery.MergeSeries {
		kind = UnitSeries
	}
	if (kind == UnitSeries || request.Result.EffectiveQuery.Scope == "personal") &&
		(request.Series == nil || request.Series.DataVersion() != request.DataVersion) {
		return nil, outcome(CodeVersionMismatch)
	}
	subjects, err := indexSubjectFacts(ctx, request.Facts.Subjects)
	if err != nil {
		return nil, err
	}
	castApplicable, err := selectedCastApplicable(
		ctx,
		request.Result.EffectiveQuery.PositionKeys,
		request.Facts.Plans,
	)
	if err != nil {
		return nil, err
	}
	var personal map[int64]query.CollectionEntry
	switch request.Result.EffectiveQuery.Scope {
	case "global":
		personal = nil
	case "personal":
		personal, err = indexPersonalEntries(ctx, request.PersonalEntries)
		if err != nil {
			return nil, err
		}
	default:
		return nil, outcome(CodeInputInvalid)
	}
	contributions := contributionsByPerson(request.Result.PositionResults)
	people := make([]PersonEvaluation, 0, len(request.Result.RankingPeople))
	for _, person := range request.Result.RankingPeople {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		units, err := materializeUnits(
			ctx,
			kind,
			request.Result.EffectiveQuery.SubjectType,
			person.SubjectIDs,
			subjects,
			personal,
			contributions[person.PersonID],
			request.Series,
		)
		if err != nil {
			return nil, err
		}
		global, personalRating, preference, err := evaluateUnitMetrics(
			ctx,
			request.Result.EffectiveQuery.Scope,
			kind,
			units,
			subjects,
			personal,
			request.Series,
		)
		if err != nil {
			return nil, err
		}
		people = append(people, PersonEvaluation{
			PersonID:   person.PersonID,
			Units:      cloneUnits(units),
			Global:     *global,
			Personal:   personalRating,
			Preference: preference,
		})
	}
	sort.Slice(people, func(left, right int) bool { return people[left].PersonID < people[right].PersonID })

	sets := make([]SetEvaluation, 0, len(request.Result.ParticipantSets))
	for _, set := range request.Result.ParticipantSets {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		units, err := materializeUnits(
			ctx,
			kind,
			request.Result.EffectiveQuery.SubjectType,
			set.SubjectIDs,
			subjects,
			personal,
			nil,
			request.Series,
		)
		if err != nil {
			return nil, err
		}
		global, personalRating, preference, err := evaluateUnitMetrics(
			ctx,
			request.Result.EffectiveQuery.Scope,
			kind,
			units,
			subjects,
			personal,
			request.Series,
		)
		if err != nil {
			return nil, err
		}
		sets = append(sets, SetEvaluation{
			RequestID:  set.RequestID,
			Units:      cloneUnits(units),
			Global:     *global,
			Personal:   personalRating,
			Preference: preference,
		})
	}
	evidence := make([]PersonEvidence, len(people))
	for index := range people {
		hasCast := false
		for _, unit := range people[index].Units {
			for _, contribution := range unit.Contributions {
				if contribution.Kind == "cast" {
					hasCast = true
				}
			}
		}
		evidence[index] = PersonEvidence{
			PersonID:        people[index].PersonID,
			HasCastIdentity: hasCast,
			Units:           cloneUnits(people[index].Units),
		}
	}
	summary, err := BuildSummaryWithOptions(ctx, kind, evidence, SummaryOptions{
		CastApplicable: castApplicable,
	})
	if err != nil {
		return nil, err
	}
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return &Evaluation{
		DataVersion:    request.DataVersion,
		QueryDigest:    request.Result.QueryDigest,
		Scope:          request.Result.EffectiveQuery.Scope,
		UnitKind:       kind,
		CastApplicable: castApplicable,
		People:         people,
		Sets:           sets,
		Summary:        *summary,
	}, nil
}

func selectedCastApplicable(
	ctx context.Context,
	positionKeys []string,
	plans []query.SelectionPlan,
) (bool, error) {
	plansByKey := make(map[string]query.SelectionPlan, len(plans))
	for _, plan := range plans {
		if err := contextError(ctx); err != nil {
			return false, err
		}
		if plan.PositionKey == "" {
			return false, outcome(CodeInputInvalid)
		}
		if _, duplicate := plansByKey[plan.PositionKey]; duplicate {
			return false, outcome(CodeInputInvalid)
		}
		plansByKey[plan.PositionKey] = plan
	}
	for _, key := range positionKeys {
		if err := contextError(ctx); err != nil {
			return false, err
		}
		plan, exists := plansByKey[key]
		if !exists {
			return false, outcome(CodeInputInvalid)
		}
		if plan.RuleKind == "exactCast" {
			return true, nil
		}
	}
	return false, nil
}

func indexSubjectFacts(ctx context.Context, values []query.Subject) (map[int64]query.Subject, error) {
	result := make(map[int64]query.Subject, len(values))
	for _, value := range values {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if value.SubjectID <= 0 || !validSubjectType(value.SubjectType) {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		copy := value
		copy.AirDate = cloneString(value.AirDate)
		copy.GlobalScore = cloneFloat(value.GlobalScore)
		copy.RatingBuckets = append([]query.RatingBucket(nil), value.RatingBuckets...)
		copy.Tags = append([]query.SubjectTag(nil), value.Tags...)
		result[value.SubjectID] = copy
	}
	return result, nil
}

func indexPersonalEntries(ctx context.Context, values []query.CollectionEntry) (map[int64]query.CollectionEntry, error) {
	result := make(map[int64]query.CollectionEntry, len(values))
	for _, value := range values {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if value.SubjectID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, outcome(CodeInputInvalid)
		}
		copy := value
		copy.PersonalScore = cloneFloat(value.PersonalScore)
		copy.Tags = append([]string(nil), value.Tags...)
		result[value.SubjectID] = copy
	}
	return result, nil
}

func materializeUnits(
	ctx context.Context,
	kind UnitKind,
	subjectType string,
	subjectIDs []int64,
	subjects map[int64]query.Subject,
	personal map[int64]query.CollectionEntry,
	contributions []query.Contribution,
	series *SeriesIndex,
) ([]Unit, error) {
	ids, err := sortedUniquePositive(ctx, subjectIDs)
	if err != nil {
		return nil, err
	}
	grouped := make(map[int64][]int64, len(ids))
	complete := make(map[int64][]int64, len(ids))
	for _, subjectID := range ids {
		subject, exists := subjects[subjectID]
		if !exists || subject.SubjectType != subjectType {
			return nil, outcome(CodeInputInvalid)
		}
		unitID := subjectID
		complete[unitID] = []int64{subjectID}
		if kind == UnitSeries {
			component, exists := series.ComponentFor(subjectType, subjectID)
			if !exists {
				return nil, outcome(CodeInputInvalid)
			}
			unitID = component.SeriesID
			complete[unitID] = component.MemberIDs
		}
		grouped[unitID] = append(grouped[unitID], subjectID)
	}
	unitIDs := make([]int64, 0, len(grouped))
	for unitID := range grouped {
		unitIDs = append(unitIDs, unitID)
	}
	sort.Slice(unitIDs, func(left, right int) bool { return unitIDs[left] < unitIDs[right] })
	result := make([]Unit, 0, len(unitIDs))
	for _, unitID := range unitIDs {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		matched := grouped[unitID]
		sort.Slice(matched, func(left, right int) bool { return matched[left] < matched[right] })
		global, err := normalizedScore(matched, func(subjectID int64) *float64 {
			return subjects[subjectID].GlobalScore
		})
		if err != nil {
			return nil, err
		}
		var personalScore *float64
		var latest string
		if personal != nil {
			personalScore, err = normalizedScore(matched, func(subjectID int64) *float64 {
				entry, ok := personal[subjectID]
				if !ok {
					return nil
				}
				if entry.UpdatedAt > latest {
					latest = entry.UpdatedAt
				}
				return entry.PersonalScore
			})
			if err != nil {
				return nil, err
			}
		}
		selectedContributions := make([]query.Contribution, 0)
		matchedSet := make(map[int64]struct{}, len(matched))
		for _, subjectID := range matched {
			matchedSet[subjectID] = struct{}{}
		}
		for _, contribution := range contributions {
			if _, selected := matchedSet[contribution.SubjectID]; selected {
				selectedContributions = append(selectedContributions, contribution)
			}
		}
		sort.Slice(selectedContributions, func(left, right int) bool {
			return contributionLess(selectedContributions[left], selectedContributions[right])
		})
		unit := Unit{
			Kind:              kind,
			UnitID:            unitID,
			CompleteMemberIDs: cloneInt64(complete[unitID]),
			MatchedMemberIDs:  cloneInt64(matched),
			GlobalScore:       global,
			PersonalScore:     personalScore,
			LatestUpdatedAt:   latest,
			Contributions:     cloneContributions(selectedContributions),
		}
		if kind == UnitSubject {
			unit.AirDate = cloneString(subjects[unitID].AirDate)
		}
		result = append(result, unit)
	}
	return result, nil
}

func evaluateUnitMetrics(
	ctx context.Context,
	scope string,
	kind UnitKind,
	units []Unit,
	subjects map[int64]query.Subject,
	personal map[int64]query.CollectionEntry,
	series *SeriesIndex,
) (*RatingSummary, *RatingSummary, *PreferenceSummary, error) {
	globalInputs := make([]RatingInput, len(units))
	personalInputs := make([]RatingInput, len(units))
	ratingBuckets := make([]int64, 10)
	preferenceInputs := make([]PreferenceInput, 0)
	for index, unit := range units {
		globalInputs[index] = RatingInput{UnitID: unit.UnitID, Score: unit.GlobalScore, Date: unit.AirDate}
		personalInputs[index] = RatingInput{UnitID: unit.UnitID, Score: unit.PersonalScore, Date: unit.AirDate}
		for _, subjectID := range unit.MatchedMemberIDs {
			for _, bucket := range subjects[subjectID].RatingBuckets {
				if bucket.Rating < 1 || bucket.Rating > 10 || bucket.Count < 0 ||
					bucket.Count > math.MaxInt64-ratingBuckets[bucket.Rating-1] {
					return nil, nil, nil, outcome(CodeRatingCountInvalid)
				}
				ratingBuckets[bucket.Rating-1] += bucket.Count
			}
			seriesID := subjectID
			if series != nil {
				if component, ok := series.ComponentFor(subjects[subjectID].SubjectType, subjectID); ok {
					seriesID = component.SeriesID
				}
			}
			var personalScore *float64
			if personal != nil {
				entry := personal[subjectID]
				personalScore = entry.PersonalScore
			}
			preferenceInputs = append(preferenceInputs, PreferenceInput{
				SubjectID:     subjectID,
				SeriesID:      seriesID,
				PersonalScore: personalScore,
				GlobalScore:   subjects[subjectID].GlobalScore,
			})
		}
	}
	global, err := EvaluateRatings(ctx, kind, globalInputs, ratingBuckets)
	if err != nil {
		return nil, nil, nil, err
	}
	var personalSummary *RatingSummary
	if scope == "personal" {
		personalSummary, err = EvaluateRatings(ctx, kind, personalInputs, nil)
		if err != nil {
			return nil, nil, nil, err
		}
	}
	preference, err := EvaluatePreference(ctx, scope, kind, preferenceInputs)
	if err != nil {
		return nil, nil, nil, err
	}
	return global, personalSummary, preference, nil
}

func normalizedScore(ids []int64, selectScore func(int64) *float64) (*float64, error) {
	values := make([]decimal, 0, len(ids))
	for _, subjectID := range ids {
		score := selectScore(subjectID)
		if score == nil {
			continue
		}
		value, valid, err := decimalFromFloat(*score)
		if err != nil {
			return nil, err
		}
		if valid {
			values = append(values, value)
		}
	}
	if len(values) == 0 {
		return nil, nil
	}
	hundredths, err := averageHundredths(values)
	if err != nil {
		return nil, err
	}
	value := float64(hundredths) / 100
	return &value, nil
}

func contributionsByPerson(positions []query.PositionResult) map[int64][]query.Contribution {
	result := make(map[int64][]query.Contribution)
	seen := make(map[int64]map[attributionIdentity]struct{})
	for _, position := range positions {
		for _, contribution := range position.Contributions {
			if seen[contribution.PersonID] == nil {
				seen[contribution.PersonID] = make(map[attributionIdentity]struct{})
			}
			identity := contributionIdentity(contribution)
			if _, duplicate := seen[contribution.PersonID][identity]; duplicate {
				continue
			}
			seen[contribution.PersonID][identity] = struct{}{}
			result[contribution.PersonID] = append(result[contribution.PersonID], contribution)
		}
	}
	return result
}

func sortedUniquePositive(ctx context.Context, values []int64) ([]int64, error) {
	result := append([]int64(nil), values...)
	sort.Slice(result, func(left, right int) bool { return result[left] < result[right] })
	write := 0
	for _, value := range result {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if value <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		if write == 0 || result[write-1] != value {
			result[write] = value
			write++
		}
	}
	return result[:write], nil
}

func cloneUnits(values []Unit) []Unit {
	result := make([]Unit, len(values))
	for index, value := range values {
		result[index] = value
		result[index].CompleteMemberIDs = cloneInt64(value.CompleteMemberIDs)
		result[index].MatchedMemberIDs = cloneInt64(value.MatchedMemberIDs)
		result[index].GlobalScore = cloneFloat(value.GlobalScore)
		result[index].PersonalScore = cloneFloat(value.PersonalScore)
		result[index].AirDate = cloneString(value.AirDate)
		result[index].Contributions = cloneContributions(value.Contributions)
	}
	return result
}

func cloneFloat(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

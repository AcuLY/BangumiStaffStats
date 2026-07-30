package query

import (
	"context"
	"errors"
	"fmt"
	"math"
	"slices"
	"sort"
)

// Evaluate applies one normalized query to immutable facts. It returns nil on
// cancellation or any error so callers can never observe a partial result.
func Evaluate(
	ctx context.Context,
	normalized NormalizedQuery,
	facts FactSet,
	collections CollectionSource,
	participantRequests []ParticipantRequest,
) (*Result, error) {
	return evaluate(ctx, normalized, facts, collections, participantRequests, evaluationHooks{})
}

type evaluationHooks struct {
	afterSubjectIndexed func(int)
}

func evaluate(
	ctx context.Context,
	normalized NormalizedQuery,
	facts FactSet,
	collections CollectionSource,
	participantRequests []ParticipantRequest,
	hooks evaluationHooks,
) (*Result, error) {
	if err := contextCause(ctx); err != nil {
		return nil, err
	}

	effective := cloneEffectiveQuery(normalized.Effective)
	subjects, err := indexSubjects(ctx, facts.Subjects, hooks)
	if err != nil {
		return nil, err
	}
	plans, err := indexPlans(ctx, facts.Plans)
	if err != nil {
		return nil, err
	}

	var entries map[int64]CollectionEntry
	collectionAccessCount := 0
	switch effective.Scope {
	case "global":
		entries = nil
	case "personal":
		if collections == nil {
			return nil, errors.New("query: personal scope requires a collection snapshot")
		}
		snapshot, err := collections.Snapshot(ctx, effective.UID)
		if err != nil {
			if cause := contextCause(ctx); cause != nil {
				return nil, cause
			}
			return nil, err
		}
		collectionAccessCount = 1
		if snapshot.UID != effective.UID {
			return nil, errors.New("query: collection snapshot UID mismatch")
		}
		entries, err = indexCollectionEntries(ctx, snapshot.Entries)
		if err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("query: unsupported scope %q", effective.Scope)
	}

	eligible, err := eligibleSubjects(ctx, effective, subjects, entries)
	if err != nil {
		return nil, err
	}
	eligibleSet := make(map[int64]struct{}, len(eligible))
	for _, subjectID := range eligible {
		eligibleSet[subjectID] = struct{}{}
	}

	engine, err := newContributionEngine(ctx, facts, plans, eligibleSet)
	if err != nil {
		return nil, err
	}
	positionResults := make([]PositionResult, 0, len(effective.PositionKeys))
	for _, key := range effective.PositionKeys {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		positionResult, err := engine.position(ctx, key)
		if err != nil {
			return nil, err
		}
		positionResults = append(positionResults, positionResult)
	}

	rankingPeople, err := rankingPeople(ctx, positionResults)
	if err != nil {
		return nil, err
	}
	participating := make([]int64, 0)
	for _, person := range rankingPeople {
		participating = append(participating, person.SubjectIDs...)
	}
	participating, err = sortedUniqueInt64(ctx, participating)
	if err != nil {
		return nil, err
	}

	participantSets := make([]ParticipantSet, 0, len(participantRequests))
	for _, request := range participantRequests {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		subjectIDs, err := engine.participantSubjects(ctx, request)
		if err != nil {
			return nil, err
		}
		participantSets = append(participantSets, ParticipantSet{
			RequestID:  request.RequestID,
			SubjectIDs: subjectIDs,
		})
	}
	if err := contextCause(ctx); err != nil {
		return nil, err
	}

	return &Result{
		EffectiveQuery:          effective,
		QueryDigest:             normalized.Digest,
		CollectionAccessCount:   collectionAccessCount,
		EligibleSubjectIDs:      eligible,
		PositionResults:         positionResults,
		RankingPeople:           rankingPeople,
		ParticipatingSubjectIDs: participating,
		ParticipantSets:         participantSets,
	}, nil
}

func indexSubjects(
	ctx context.Context,
	values []Subject,
	hooks evaluationHooks,
) (map[int64]Subject, error) {
	result := make(map[int64]Subject, len(values))
	for index, value := range values {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if value.SubjectID <= 0 {
			return nil, fmt.Errorf("query: invalid subject ID %d", value.SubjectID)
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, fmt.Errorf("query: duplicate subject ID %d", value.SubjectID)
		}
		value.RatingBuckets = append([]RatingBucket(nil), value.RatingBuckets...)
		value.Tags = append([]SubjectTag(nil), value.Tags...)
		result[value.SubjectID] = value
		if hooks.afterSubjectIndexed != nil {
			hooks.afterSubjectIndexed(index + 1)
		}
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
	}
	return result, nil
}

func indexPlans(ctx context.Context, values []SelectionPlan) (map[string]SelectionPlan, error) {
	result := make(map[string]SelectionPlan, len(values))
	for _, value := range values {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if value.PositionKey == "" {
			return nil, errors.New("query: empty position key")
		}
		if _, duplicate := result[value.PositionKey]; duplicate {
			return nil, fmt.Errorf("query: duplicate selection plan %q", value.PositionKey)
		}
		value.RoleTypes = append([]int64(nil), value.RoleTypes...)
		value.MemberPositionKeys = append([]string(nil), value.MemberPositionKeys...)
		switch value.RuleKind {
		case "exactStaff":
			if value.PositionID <= 0 || len(value.RoleTypes) != 0 || len(value.MemberPositionKeys) != 0 {
				return nil, fmt.Errorf("query: invalid exactStaff plan %q", value.PositionKey)
			}
		case "exactCast":
			if value.PositionID != 0 || len(value.RoleTypes) == 0 || len(value.MemberPositionKeys) != 0 {
				return nil, fmt.Errorf("query: invalid exactCast plan %q", value.PositionKey)
			}
			seenRoles := make(map[int64]struct{}, len(value.RoleTypes))
			for _, role := range value.RoleTypes {
				if role < 1 || role > 6 {
					return nil, fmt.Errorf("query: invalid exactCast role in %q", value.PositionKey)
				}
				if _, duplicate := seenRoles[role]; duplicate {
					return nil, fmt.Errorf("query: duplicate exactCast role in %q", value.PositionKey)
				}
				seenRoles[role] = struct{}{}
			}
		case "staffSetUnion":
			if value.PositionID != 0 || len(value.RoleTypes) != 0 || len(value.MemberPositionKeys) == 0 {
				return nil, fmt.Errorf("query: invalid staffSetUnion plan %q", value.PositionKey)
			}
			seenMembers := make(map[string]struct{}, len(value.MemberPositionKeys))
			for _, member := range value.MemberPositionKeys {
				if err := contextCause(ctx); err != nil {
					return nil, err
				}
				if member == "" {
					return nil, fmt.Errorf("query: empty staffSetUnion member in %q", value.PositionKey)
				}
				if _, duplicate := seenMembers[member]; duplicate {
					return nil, fmt.Errorf("query: duplicate staffSetUnion member in %q", value.PositionKey)
				}
				seenMembers[member] = struct{}{}
			}
		default:
			return nil, fmt.Errorf("query: unsupported selection rule %q", value.RuleKind)
		}
		result[value.PositionKey] = value
	}
	return result, nil
}

func indexCollectionEntries(ctx context.Context, values []CollectionEntry) (map[int64]CollectionEntry, error) {
	result := make(map[int64]CollectionEntry, len(values))
	for _, value := range values {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if value.SubjectID <= 0 {
			return nil, fmt.Errorf("query: invalid collection subject ID %d", value.SubjectID)
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, fmt.Errorf("query: duplicate collection subject ID %d", value.SubjectID)
		}
		value.Tags = append([]string(nil), value.Tags...)
		result[value.SubjectID] = value
	}
	return result, nil
}

func eligibleSubjects(
	ctx context.Context,
	query EffectiveQuery,
	subjects map[int64]Subject,
	entries map[int64]CollectionEntry,
) ([]int64, error) {
	subjectIDs := make([]int64, 0, len(subjects))
	for subjectID := range subjects {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		subjectIDs = append(subjectIDs, subjectID)
	}
	if err := sortSliceContext(ctx, subjectIDs, func(left, right int) bool {
		return subjectIDs[left] < subjectIDs[right]
	}); err != nil {
		return nil, err
	}

	eligible := make([]int64, 0, len(subjectIDs))
	for _, subjectID := range subjectIDs {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		subject := subjects[subjectID]
		if subject.SubjectType != query.SubjectType || (!query.IncludeNSFW && subject.NSFW) {
			continue
		}
		var entry *CollectionEntry
		if query.Scope == "personal" {
			value, ok := entries[subjectID]
			if !ok || !slices.Contains(query.CollectionStatuses, value.Status) {
				continue
			}
			entry = &value
		}
		matches, err := matchesFilters(ctx, subject, entry, query.Filters)
		if err != nil {
			return nil, err
		}
		if matches {
			eligible = append(eligible, subjectID)
		}
	}
	return eligible, nil
}

func matchesFilters(
	ctx context.Context,
	subject Subject,
	entry *CollectionEntry,
	filters *Filters,
) (bool, error) {
	if filters == nil {
		return true, nil
	}
	if filters.SubjectDate != nil {
		if subject.AirDate == nil || subject.AirDatePrecision == nil ||
			*subject.AirDatePrecision < 2 || len(*subject.AirDate) < 7 ||
			!monthMatches((*subject.AirDate)[:7], filters.SubjectDate) {
			return false, nil
		}
	}
	if filters.CollectionUpdatedAt != nil {
		if entry == nil || len(entry.UpdatedAt) < 7 ||
			!monthMatches(entry.UpdatedAt[:7], filters.CollectionUpdatedAt) {
			return false, nil
		}
	}
	if filters.PersonalScore != nil {
		if entry == nil || !validScore(entry.PersonalScore) {
			return false, nil
		}
		matches, err := numberMatches(*entry.PersonalScore, filters.PersonalScore)
		if err != nil || !matches {
			return false, err
		}
	}
	if filters.GlobalScore != nil {
		if !validScore(subject.GlobalScore) {
			return false, nil
		}
		matches, err := numberMatches(*subject.GlobalScore, filters.GlobalScore)
		if err != nil || !matches {
			return false, err
		}
	}
	if filters.ScoreDifference != nil {
		if entry == nil || !validScore(entry.PersonalScore) || !validScore(subject.GlobalScore) {
			return false, nil
		}
		matches, err := numberMatches(
			*entry.PersonalScore-*subject.GlobalScore,
			filters.ScoreDifference,
		)
		if err != nil || !matches {
			return false, err
		}
	}
	if filters.RatingCount != nil {
		ratingCount, err := checkedRatingCount(ctx, subject.RatingBuckets)
		if err != nil {
			return false, err
		}
		matches, err := integerMatches(ratingCount, filters.RatingCount)
		if err != nil || !matches {
			return false, err
		}
	}
	if filters.Tags != nil {
		tags, err := normalizedSubjectTags(ctx, subject.Tags, entry)
		if err != nil {
			return false, err
		}
		if !tagFiltersMatch(tags, *filters.Tags) {
			return false, nil
		}
	}
	return true, nil
}

func monthMatches(value string, limits *MonthRange) bool {
	if limits.Min != nil && value < *limits.Min {
		return false
	}
	if limits.Max != nil && value > *limits.Max {
		return false
	}
	return true
}

func validScore(value *float64) bool {
	return value != nil && !math.IsNaN(*value) && !math.IsInf(*value, 0) &&
		*value >= 1 && *value <= 10
}

func numberMatches(value float64, limits *NumberRange) (bool, error) {
	if limits.Min != nil {
		minimum, err := limits.Min.Float64()
		if err != nil || math.IsNaN(minimum) || math.IsInf(minimum, 0) {
			return false, errors.New("query: invalid normalized number range")
		}
		if value < minimum {
			return false, nil
		}
	}
	if limits.Max != nil {
		maximum, err := limits.Max.Float64()
		if err != nil || math.IsNaN(maximum) || math.IsInf(maximum, 0) {
			return false, errors.New("query: invalid normalized number range")
		}
		if value > maximum {
			return false, nil
		}
	}
	return true, nil
}

func integerMatches(value int64, limits *IntegerRange) (bool, error) {
	if limits.Min != nil {
		minimum, err := limits.Min.Int64()
		if err != nil {
			return false, errors.New("query: invalid normalized integer range")
		}
		if value < minimum {
			return false, nil
		}
	}
	if limits.Max != nil {
		maximum, err := limits.Max.Int64()
		if err != nil {
			return false, errors.New("query: invalid normalized integer range")
		}
		if value > maximum {
			return false, nil
		}
	}
	return true, nil
}

func checkedRatingCount(ctx context.Context, buckets []RatingBucket) (int64, error) {
	var total int64
	for _, bucket := range buckets {
		if err := contextCause(ctx); err != nil {
			return 0, err
		}
		if bucket.Rating < 1 || bucket.Rating > 10 || bucket.Count < 0 {
			return 0, errors.New("query: invalid rating bucket")
		}
		if bucket.Count > math.MaxInt64-total {
			return 0, errors.New("query: rating count overflow")
		}
		total += bucket.Count
	}
	return total, nil
}

func normalizedSubjectTags(
	ctx context.Context,
	subjectTags []SubjectTag,
	entry *CollectionEntry,
) (map[string]struct{}, error) {
	result := make(map[string]struct{}, len(subjectTags))
	for _, tag := range subjectTags {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if tag.Scope != "public" && tag.Scope != "meta" {
			return nil, fmt.Errorf("query: invalid subject tag scope %q", tag.Scope)
		}
		value, err := NormalizeTag(tag.Name)
		if err != nil {
			return nil, fmt.Errorf("query: normalize archive tag: %w", err)
		}
		result[value] = struct{}{}
	}
	if entry != nil {
		for _, tag := range entry.Tags {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			value, err := NormalizeTag(tag)
			if err != nil {
				return nil, fmt.Errorf("query: normalize collection tag: %w", err)
			}
			result[value] = struct{}{}
		}
	}
	return result, nil
}

func tagFiltersMatch(tags map[string]struct{}, filters TagFilters) bool {
	for _, group := range filters.Include {
		found := false
		for _, token := range group.AnyOf {
			if _, ok := tags[token]; ok {
				found = true
				break
			}
		}
		if !found {
			return false
		}
	}
	for _, group := range filters.Exclude {
		all := true
		for _, token := range group.AllOf {
			if _, ok := tags[token]; !ok {
				all = false
				break
			}
		}
		if all {
			return false
		}
	}
	return true
}

type contributionEngine struct {
	plans    map[string]SelectionPlan
	eligible map[int64]struct{}
	staff    map[int64][]StaffCredit
	cast     []CastCredit
	cache    map[string]PositionResult
}

func newContributionEngine(
	ctx context.Context,
	facts FactSet,
	plans map[string]SelectionPlan,
	eligible map[int64]struct{},
) (*contributionEngine, error) {
	staff := make(map[int64][]StaffCredit)
	for _, credit := range facts.StaffCredits {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		staff[credit.PositionID] = append(staff[credit.PositionID], credit)
	}
	cast := make([]CastCredit, 0, len(facts.CastCredits))
	for _, credit := range facts.CastCredits {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		cast = append(cast, credit)
	}
	return &contributionEngine{
		plans:    plans,
		eligible: eligible,
		staff:    staff,
		cast:     cast,
		cache:    make(map[string]PositionResult),
	}, nil
}

func (e *contributionEngine) position(ctx context.Context, key string) (PositionResult, error) {
	if cached, ok := e.cache[key]; ok {
		return cached, nil
	}
	plan, ok := e.plans[key]
	if !ok {
		return PositionResult{}, fmt.Errorf("query: selection plan not found for %q", key)
	}
	contributions := make([]Contribution, 0)
	switch plan.RuleKind {
	case "exactStaff":
		contributions = append(contributions, e.staffContributions(ctx, plan.PositionKey, "", plan.PositionID)...)
	case "exactCast":
		roles := make(map[int64]struct{}, len(plan.RoleTypes))
		for _, role := range plan.RoleTypes {
			roles[role] = struct{}{}
		}
		for _, credit := range e.cast {
			if err := contextCause(ctx); err != nil {
				return PositionResult{}, err
			}
			if _, eligible := e.eligible[credit.SubjectID]; !eligible {
				continue
			}
			if _, selected := roles[credit.RoleType]; !selected {
				continue
			}
			sortOrder := credit.SortOrder
			contributions = append(contributions, Contribution{
				PositionKey: plan.PositionKey,
				Kind:        "cast",
				SubjectID:   credit.SubjectID,
				PersonID:    credit.PersonID,
				CharacterID: credit.CharacterID,
				RoleType:    credit.RoleType,
				SortOrder:   &sortOrder,
			})
		}
	case "staffSetUnion":
		for _, memberKey := range plan.MemberPositionKeys {
			if err := contextCause(ctx); err != nil {
				return PositionResult{}, err
			}
			member, ok := e.plans[memberKey]
			if !ok || member.RuleKind != "exactStaff" {
				return PositionResult{}, fmt.Errorf(
					"query: staff set %q has invalid member %q",
					plan.PositionKey,
					memberKey,
				)
			}
			contributions = append(
				contributions,
				e.staffContributions(ctx, plan.PositionKey, memberKey, member.PositionID)...,
			)
		}
	default:
		return PositionResult{}, fmt.Errorf("query: unsupported selection rule %q", plan.RuleKind)
	}
	if err := contextCause(ctx); err != nil {
		return PositionResult{}, err
	}

	contributions, err := sortedUniqueContributions(ctx, contributions)
	if err != nil {
		return PositionResult{}, err
	}
	personIDs := make([]int64, 0, len(contributions))
	subjectIDs := make([]int64, 0, len(contributions))
	for _, contribution := range contributions {
		personIDs = append(personIDs, contribution.PersonID)
		subjectIDs = append(subjectIDs, contribution.SubjectID)
	}
	candidatePersonIDs, err := sortedUniqueInt64(ctx, personIDs)
	if err != nil {
		return PositionResult{}, err
	}
	candidateSubjectIDs, err := sortedUniqueInt64(ctx, subjectIDs)
	if err != nil {
		return PositionResult{}, err
	}
	result := PositionResult{
		PositionKey:         key,
		CandidatePersonIDs:  candidatePersonIDs,
		CandidateSubjectIDs: candidateSubjectIDs,
		Contributions:       contributions,
	}
	e.cache[key] = result
	return result, nil
}

func (e *contributionEngine) staffContributions(
	ctx context.Context,
	positionKey string,
	memberPositionKey string,
	positionID int64,
) []Contribution {
	result := make([]Contribution, 0)
	for _, credit := range e.staff[positionID] {
		if contextCause(ctx) != nil {
			break
		}
		if _, eligible := e.eligible[credit.SubjectID]; !eligible {
			continue
		}
		result = append(result, Contribution{
			PositionKey:       positionKey,
			MemberPositionKey: memberPositionKey,
			Kind:              "staff",
			SubjectID:         credit.SubjectID,
			PersonID:          credit.PersonID,
			PositionID:        credit.PositionID,
		})
	}
	return result
}

func (e *contributionEngine) participantSubjects(
	ctx context.Context,
	request ParticipantRequest,
) ([]int64, error) {
	if request.RequestID == "" {
		return nil, errors.New("query: empty participant request ID")
	}
	if len(request.People) == 0 {
		return []int64{}, nil
	}
	var intersection map[int64]struct{}
	for _, person := range request.People {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		personSubjects := make(map[int64]struct{})
		for _, key := range person.PositionKeys {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			position, err := e.position(ctx, key)
			if err != nil {
				return nil, err
			}
			for _, contribution := range position.Contributions {
				if err := contextCause(ctx); err != nil {
					return nil, err
				}
				if contribution.PersonID == person.PersonID {
					personSubjects[contribution.SubjectID] = struct{}{}
				}
			}
		}
		if intersection == nil {
			intersection = personSubjects
			continue
		}
		for subjectID := range intersection {
			if _, ok := personSubjects[subjectID]; !ok {
				delete(intersection, subjectID)
			}
		}
	}
	result := make([]int64, 0, len(intersection))
	for subjectID := range intersection {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		result = append(result, subjectID)
	}
	if err := sortSliceContext(ctx, result, func(left, right int) bool {
		return result[left] < result[right]
	}); err != nil {
		return nil, err
	}
	return result, nil
}

func rankingPeople(ctx context.Context, positions []PositionResult) ([]PersonSubjects, error) {
	if len(positions) == 0 {
		return []PersonSubjects{}, nil
	}
	people := make(map[int64]struct{}, len(positions[0].CandidatePersonIDs))
	for _, personID := range positions[0].CandidatePersonIDs {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		people[personID] = struct{}{}
	}
	for _, position := range positions[1:] {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		selected := make(map[int64]struct{}, len(position.CandidatePersonIDs))
		for _, personID := range position.CandidatePersonIDs {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			selected[personID] = struct{}{}
		}
		for personID := range people {
			if err := contextCause(ctx); err != nil {
				return nil, err
			}
			if _, ok := selected[personID]; !ok {
				delete(people, personID)
			}
		}
	}
	personIDs := make([]int64, 0, len(people))
	for personID := range people {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		personIDs = append(personIDs, personID)
	}
	if err := sortSliceContext(ctx, personIDs, func(left, right int) bool {
		return personIDs[left] < personIDs[right]
	}); err != nil {
		return nil, err
	}

	result := make([]PersonSubjects, 0, len(personIDs))
	for _, personID := range personIDs {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		subjects := make([]int64, 0)
		for _, position := range positions {
			for _, contribution := range position.Contributions {
				if err := contextCause(ctx); err != nil {
					return nil, err
				}
				if contribution.PersonID == personID {
					subjects = append(subjects, contribution.SubjectID)
				}
			}
		}
		subjectIDs, err := sortedUniqueInt64(ctx, subjects)
		if err != nil {
			return nil, err
		}
		result = append(result, PersonSubjects{
			PersonID:   personID,
			SubjectIDs: subjectIDs,
		})
	}
	return result, nil
}

func sortedUniqueContributions(ctx context.Context, values []Contribution) ([]Contribution, error) {
	type contributionIdentity struct {
		positionKey       string
		memberPositionKey string
		kind              string
		subjectID         int64
		personID          int64
		positionID        int64
		characterID       int64
		roleType          int64
		sortOrder         int64
	}
	seen := make(map[contributionIdentity]struct{}, len(values))
	result := make([]Contribution, 0, len(values))
	for _, value := range values {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		identity := contributionIdentity{
			positionKey:       value.PositionKey,
			memberPositionKey: value.MemberPositionKey,
			kind:              value.Kind,
			subjectID:         value.SubjectID,
			personID:          value.PersonID,
			positionID:        value.PositionID,
			characterID:       value.CharacterID,
			roleType:          value.RoleType,
			sortOrder:         contributionSortOrder(value),
		}
		if _, duplicate := seen[identity]; duplicate {
			continue
		}
		seen[identity] = struct{}{}
		result = append(result, value)
	}
	if err := sortSliceContext(ctx, result, func(left, right int) bool {
		a, b := result[left], result[right]
		switch {
		case a.SubjectID != b.SubjectID:
			return a.SubjectID < b.SubjectID
		case a.PersonID != b.PersonID:
			return a.PersonID < b.PersonID
		case a.PositionID != b.PositionID:
			return a.PositionID < b.PositionID
		case a.CharacterID != b.CharacterID:
			return a.CharacterID < b.CharacterID
		case a.RoleType != b.RoleType:
			return a.RoleType < b.RoleType
		case contributionSortOrder(a) != contributionSortOrder(b):
			return contributionSortOrder(a) < contributionSortOrder(b)
		case a.MemberPositionKey != b.MemberPositionKey:
			return a.MemberPositionKey < b.MemberPositionKey
		case a.Kind != b.Kind:
			return a.Kind < b.Kind
		default:
			return a.PositionKey < b.PositionKey
		}
	}); err != nil {
		return nil, err
	}
	return result, nil
}

func contributionSortOrder(value Contribution) int64 {
	if value.SortOrder == nil {
		return 0
	}
	return *value.SortOrder
}

type contextSortCanceled struct {
	err error
}

func sortSliceContext(
	ctx context.Context,
	values any,
	less func(left, right int) bool,
) (err error) {
	if err := contextCause(ctx); err != nil {
		return err
	}
	defer func() {
		recovered := recover()
		if recovered == nil {
			return
		}
		if canceled, ok := recovered.(contextSortCanceled); ok {
			err = canceled.err
			return
		}
		panic(recovered)
	}()
	comparisons := 0
	sort.Slice(values, func(left, right int) bool {
		comparisons++
		if comparisons&255 == 0 {
			if cause := contextCause(ctx); cause != nil {
				panic(contextSortCanceled{err: cause})
			}
		}
		return less(left, right)
	})
	return contextCause(ctx)
}

func sortedUniqueInt64(ctx context.Context, values []int64) ([]int64, error) {
	if len(values) == 0 {
		return []int64{}, nil
	}
	result := make([]int64, 0, len(values))
	for _, value := range values {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	if err := sortSliceContext(ctx, result, func(left, right int) bool {
		return result[left] < result[right]
	}); err != nil {
		return nil, err
	}
	write := 1
	for read := 1; read < len(result); read++ {
		if err := contextCause(ctx); err != nil {
			return nil, err
		}
		if result[read] != result[write-1] {
			result[write] = result[read]
			write++
		}
	}
	return result[:write], nil
}

func cloneEffectiveQuery(value EffectiveQuery) EffectiveQuery {
	value.CollectionStatuses = append([]string(nil), value.CollectionStatuses...)
	value.PositionKeys = append([]string(nil), value.PositionKeys...)
	value.Filters = cloneFilters(value.Filters)
	return value
}

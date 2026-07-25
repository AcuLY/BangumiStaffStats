package costar

import (
	"context"
	"errors"
	"fmt"
	"math"
	"regexp"
	"sort"
	"strconv"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

var (
	dataVersionPattern = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	queryDigestPattern = regexp.MustCompile(`^q1:[0-9a-f]{64}$`)
)

type participantEvidence struct {
	input     ParticipantInput
	subjects  map[int64]struct{}
	bySubject map[int64][]query.Contribution
}

// RequiredArchiveReferenceIDs returns the exact bounded person, Subject, and
// Character references needed to build this input's complete immutable core.
func RequiredArchiveReferenceIDs(
	result query.Result,
	input Input,
	series *statistics.SeriesIndex,
) ([]int64, []int64, []int64, error) {
	participants, err := collectParticipantEvidence(result, input)
	if err != nil {
		return nil, nil, nil, err
	}
	personIDs := make([]int64, len(participants))
	rawSubjectIDs := make(map[int64]struct{})
	for index, participant := range participants {
		personIDs[index] = participant.input.PersonID
		for subjectID := range participant.subjects {
			rawSubjectIDs[subjectID] = struct{}{}
		}
	}
	subjectIDs := make(map[int64]struct{}, len(rawSubjectIDs))
	if result.EffectiveQuery.MergeSeries {
		if series == nil {
			return nil, nil, nil, fieldError("")
		}
		for subjectID := range rawSubjectIDs {
			component, found := series.ComponentFor(
				result.EffectiveQuery.SubjectType,
				subjectID,
			)
			if !found {
				return nil, nil, nil, fieldError("")
			}
			for _, memberID := range component.MemberIDs {
				subjectIDs[memberID] = struct{}{}
			}
		}
	} else {
		subjectIDs = rawSubjectIDs
	}

	common := intersectParticipantSubjects(participants)
	characters := make(map[int64]struct{})
	for _, participant := range participants {
		for subjectID := range common {
			for _, contribution := range participant.bySubject[subjectID] {
				if contribution.Kind == "cast" {
					if contribution.CharacterID <= 0 {
						return nil, nil, nil, fieldError("")
					}
					characters[contribution.CharacterID] = struct{}{}
				}
			}
		}
	}
	return append([]int64{}, personIDs...),
		sortedSubjectIDs(subjectIDs),
		sortedSubjectIDs(characters),
		nil
}

// Build creates one complete immutable pair/group core. Every union,
// intersection, and matrix cell is fixed at raw Subject level before the
// statistics authority is allowed to merge series.
func Build(ctx context.Context, request BuildRequest) (Core, error) {
	if err := contextError(ctx); err != nil {
		return Core{}, err
	}
	if !dataVersionPattern.MatchString(request.DataVersion) ||
		!queryDigestPattern.MatchString(request.Query.QueryDigest) {
		return Core{}, fieldError("")
	}
	if request.Query.EffectiveQuery.Scope != "global" &&
		request.Query.EffectiveQuery.Scope != "personal" {
		return Core{}, fieldError("/query/scope")
	}
	participants, err := collectParticipantEvidence(request.Query, request.Input)
	if err != nil {
		return Core{}, err
	}
	people, err := indexPeople(request.Evidence.People)
	if err != nil {
		return Core{}, err
	}
	for index, participant := range participants {
		if _, found := people[participant.input.PersonID]; !found {
			return Core{}, fail(
				CodeEntityNotFound,
				"Participant person was not found.",
				fmt.Sprintf("/input/participants/%d/personId", index),
				"",
				false,
				nil,
			)
		}
	}
	facts, err := indexSubjectFacts(request.Facts.Subjects)
	if err != nil {
		return Core{}, err
	}
	subjects, err := indexSubjectReferences(request.Evidence.Subjects)
	if err != nil {
		return Core{}, err
	}
	characters, err := indexCharacterReferences(request.Evidence.Characters)
	if err != nil {
		return Core{}, err
	}
	personal, err := personalEntryIndex(
		request.Query.EffectiveQuery.Scope,
		request.PersonalEntries,
	)
	if err != nil {
		return Core{}, err
	}

	participantSets := make([]query.ParticipantSet, 0, len(participants)+1+45)
	for index, participant := range participants {
		participantSets = append(participantSets, query.ParticipantSet{
			RequestID:  participantRequestID(index),
			SubjectIDs: sortedSubjectIDs(participant.subjects),
		})
	}
	commonSubjects := intersectParticipantSubjects(participants)
	participantSets = append(participantSets, query.ParticipantSet{
		RequestID:  "common",
		SubjectIDs: sortedSubjectIDs(commonSubjects),
	})
	if len(participants) >= 3 {
		for left := 0; left < len(participants); left++ {
			for right := left + 1; right < len(participants); right++ {
				participantSets = append(participantSets, query.ParticipantSet{
					RequestID: matrixRequestID(left, right),
					SubjectIDs: intersectTwoSubjects(
						participants[left].subjects,
						participants[right].subjects,
					),
				})
			}
		}
	}

	evaluation, err := statistics.Evaluate(ctx, statistics.EvaluationRequest{
		DataVersion: request.DataVersion,
		Result: query.Result{
			EffectiveQuery:          cloneEffectiveQuery(request.Query.EffectiveQuery),
			QueryDigest:             request.Query.QueryDigest,
			CollectionAccessCount:   request.Query.CollectionAccessCount,
			EligibleSubjectIDs:      cloneSlice(request.Query.EligibleSubjectIDs),
			PositionResults:         clonePositionResults(request.Query.PositionResults),
			ParticipatingSubjectIDs: cloneSlice(request.Query.ParticipatingSubjectIDs),
			ParticipantSets:         participantSets,
		},
		Facts:           request.Facts,
		PersonalEntries: cloneCollectionEntries(request.PersonalEntries),
		Series:          request.Series,
	})
	if err != nil {
		return Core{}, evaluationError(ctx, err)
	}
	if evaluation.DataVersion != request.DataVersion ||
		evaluation.QueryDigest != request.Query.QueryDigest ||
		evaluation.Scope != request.Query.EffectiveQuery.Scope ||
		len(evaluation.Sets) != len(participantSets) {
		return Core{}, evaluationError(ctx, errors.New("costar: evaluation authority mismatch"))
	}

	core := Core{
		DataVersion:  request.DataVersion,
		QueryDigest:  request.Query.QueryDigest,
		Scope:        request.Query.EffectiveQuery.Scope,
		Kind:         "pair",
		WorkUnit:     evaluation.UnitKind,
		Participants: make([]ParticipantCore, 0, len(participants)),
		Ratings:      make([]RatingDataset, 0),
		Matrix:       make([]MatrixPair, 0),
	}
	if len(participants) >= 3 {
		core.Kind = "group"
	}
	unionUnits := make(map[int64]struct{})
	for index, participant := range participants {
		set := evaluation.Sets[index]
		if set.RequestID != participantRequestID(index) {
			return Core{}, evaluationError(ctx, errors.New("costar: participant evaluation order changed"))
		}
		rating, err := selectedRating(core.Scope, set)
		if err != nil {
			return Core{}, err
		}
		for _, unit := range set.Units {
			unionUnits[unit.UnitID] = struct{}{}
		}
		core.Participants = append(core.Participants, ParticipantCore{
			Person:       clonePerson(people[participant.input.PersonID]),
			PositionKeys: cloneSlice(participant.input.PositionKeys),
			Metrics: Metrics{
				WorkCount:      len(set.Units),
				RatedWorkCount: rating.RatedUnitCount,
				Average:        cloneInt64(rating.AverageHundredths),
			},
		})
	}

	commonIndex := len(participants)
	commonSet := evaluation.Sets[commonIndex]
	if commonSet.RequestID != "common" {
		return Core{}, evaluationError(ctx, errors.New("costar: common evaluation order changed"))
	}
	commonUnits := cloneUnits(commonSet.Units)
	for unitIndex := range commonUnits {
		commonUnits[unitIndex].Contributions = commonContributions(
			commonUnits[unitIndex],
			participants,
		)
	}
	works, err := buildWorks(
		ctx,
		request.Query.EffectiveQuery.SubjectType,
		commonUnits,
		participants,
		facts,
		subjects,
		characters,
		personal,
		request.Series,
	)
	if err != nil {
		return Core{}, err
	}
	core.Works = works
	commonRating, err := selectedRating(core.Scope, commonSet)
	if err != nil {
		return Core{}, err
	}
	core.Summary = Summary{
		UnionWorkCount:  len(unionUnits),
		CommonWorkCount: len(commonSet.Units),
		RatedWorkCount:  commonRating.RatedUnitCount,
		Average:         cloneInt64(commonRating.AverageHundredths),
	}
	if core.Scope == "personal" {
		globalRated := commonSet.Global.RatedUnitCount
		core.Summary.GlobalRatedWorkCount = &globalRated
		core.Summary.GlobalAverage = cloneInt64(commonSet.Global.AverageHundredths)
		core.Summary.Highest, core.Summary.Lowest = personalExtrema(commonSet.Units)
	}
	core.Tags = buildTags(
		commonSet.Units,
		facts,
		personal,
		core.Scope == "personal",
	)

	if len(commonSet.Units) != 0 {
		datasets := make([]RatingDataset, 0, len(participants)+1)
		commonDataset, err := buildRatingDataset(
			"common",
			nil,
			commonSet,
			subjects,
			request.Query.EffectiveQuery.SubjectType,
			request.Series,
		)
		if err != nil {
			return Core{}, err
		}
		datasets = append(datasets, commonDataset)
		for index, participant := range participants {
			personID := participant.input.PersonID
			dataset, err := buildRatingDataset(
				"participant",
				&personID,
				evaluation.Sets[index],
				subjects,
				request.Query.EffectiveQuery.SubjectType,
				request.Series,
			)
			if err != nil {
				return Core{}, err
			}
			datasets = append(datasets, dataset)
		}
		core.Ratings = datasets
	}
	if core.Scope == "personal" {
		core.Preference, err = buildPreference(
			commonSet,
			subjects,
			request.Query.EffectiveQuery.SubjectType,
			request.Series,
		)
		if err != nil {
			return Core{}, err
		}
	}
	if core.Kind == "group" {
		setIndex := commonIndex + 1
		for left := 0; left < len(participants); left++ {
			for right := left + 1; right < len(participants); right++ {
				set := evaluation.Sets[setIndex]
				if set.RequestID != matrixRequestID(left, right) {
					return Core{}, evaluationError(
						ctx,
						errors.New("costar: matrix evaluation order changed"),
					)
				}
				rating, err := selectedRating(core.Scope, set)
				if err != nil {
					return Core{}, err
				}
				core.Matrix = append(core.Matrix, MatrixPair{
					LeftPersonID:  participants[left].input.PersonID,
					RightPersonID: participants[right].input.PersonID,
					Metrics: Metrics{
						WorkCount:      len(set.Units),
						RatedWorkCount: rating.RatedUnitCount,
						Average:        cloneInt64(rating.AverageHundredths),
					},
				})
				setIndex++
			}
		}
	}
	return CloneCore(core), nil
}

func collectParticipantEvidence(
	result query.Result,
	input Input,
) ([]participantEvidence, error) {
	if len(input.Participants) < 2 || len(input.Participants) > 10 {
		return nil, requestFailure(
			"participant count must be between 2 and 10",
			"/input/participants",
			string(CodeParticipantLimitExceeded),
		)
	}
	positions, err := indexPositionResults(result)
	if err != nil {
		return nil, err
	}
	seenPeople := make(map[int64]struct{}, len(input.Participants))
	totalIdentities := 0
	output := make([]participantEvidence, len(input.Participants))
	for participantIndex, participant := range input.Participants {
		if participant.PersonID <= 0 || participant.PersonID > maxJSONSafeInteger {
			return nil, fieldError(fmt.Sprintf("/input/participants/%d/personId", participantIndex))
		}
		if _, duplicate := seenPeople[participant.PersonID]; duplicate {
			return nil, requestFailure(
				"participants must be unique",
				fmt.Sprintf("/input/participants/%d/personId", participantIndex),
				"DUPLICATE",
			)
		}
		seenPeople[participant.PersonID] = struct{}{}
		if len(participant.PositionKeys) == 0 {
			return nil, fieldError(fmt.Sprintf(
				"/input/participants/%d/positionKeys",
				participantIndex,
			))
		}
		totalIdentities += len(participant.PositionKeys)
		if totalIdentities > 20 {
			return nil, requestFailure(
				"total participant identities exceed the limit",
				fmt.Sprintf("/input/participants/%d/positionKeys", participantIndex),
				string(CodeIdentityLimitExceeded),
			)
		}
		evidence := participantEvidence{
			input: ParticipantInput{
				PersonID:     participant.PersonID,
				PositionKeys: cloneSlice(participant.PositionKeys),
			},
			subjects:  make(map[int64]struct{}),
			bySubject: make(map[int64][]query.Contribution),
		}
		seenPositions := make(map[string]struct{}, len(participant.PositionKeys))
		for positionIndex, key := range participant.PositionKeys {
			path := fmt.Sprintf(
				"/input/participants/%d/positionKeys/%d",
				participantIndex,
				positionIndex,
			)
			if key == "" {
				return nil, fieldError(path)
			}
			if _, duplicate := seenPositions[key]; duplicate {
				return nil, requestFailure(
					"participant identities must be unique",
					path,
					"DUPLICATE",
				)
			}
			seenPositions[key] = struct{}{}
			position, found := positions[key]
			if !found {
				return nil, requestFailure(
					"participant identity is not selected by the query",
					path,
					string(CodePositionNotFound),
				)
			}
			matched := false
			for _, contribution := range position.Contributions {
				if contribution.PersonID != participant.PersonID {
					continue
				}
				matched = true
				evidence.subjects[contribution.SubjectID] = struct{}{}
				evidence.bySubject[contribution.SubjectID] = append(
					evidence.bySubject[contribution.SubjectID],
					cloneQueryContribution(contribution),
				)
			}
			if !matched {
				return nil, requestFailure(
					"participant identity does not match the participant",
					path,
					string(CodePositionNotFound),
				)
			}
		}
		output[participantIndex] = evidence
	}
	return output, nil
}

func indexPositionResults(result query.Result) (map[string]query.PositionResult, error) {
	if len(result.EffectiveQuery.PositionKeys) == 0 ||
		len(result.PositionResults) != len(result.EffectiveQuery.PositionKeys) {
		return nil, fieldError("/query/positionKeys")
	}
	positions := make(map[string]query.PositionResult, len(result.PositionResults))
	for index, key := range result.EffectiveQuery.PositionKeys {
		position := result.PositionResults[index]
		if key == "" || position.PositionKey != key {
			return nil, fieldError("/query/positionKeys")
		}
		if _, duplicate := positions[key]; duplicate {
			return nil, fieldError("/query/positionKeys")
		}
		for _, contribution := range position.Contributions {
			if contribution.PositionKey != key ||
				contribution.PersonID <= 0 ||
				contribution.SubjectID <= 0 {
				return nil, fieldError("/query/positionKeys")
			}
		}
		positions[key] = position
	}
	return positions, nil
}

func indexPeople(values []PersonReference) (map[int64]PersonReference, error) {
	result := make(map[int64]PersonReference, len(values))
	for _, value := range values {
		if value.ID <= 0 || value.ID > maxJSONSafeInteger || value.Name == "" {
			return nil, fieldError("")
		}
		if value.NameCN != nil && *value.NameCN == "" {
			return nil, fieldError("")
		}
		if _, duplicate := result[value.ID]; duplicate {
			return nil, fieldError("")
		}
		result[value.ID] = clonePerson(value)
	}
	return result, nil
}

func indexSubjectFacts(values []query.Subject) (map[int64]query.Subject, error) {
	result := make(map[int64]query.Subject, len(values))
	for _, value := range values {
		if value.SubjectID <= 0 || value.SubjectType == "" {
			return nil, fieldError("")
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, fieldError("")
		}
		copy := value
		copy.AirDate = cloneString(value.AirDate)
		copy.GlobalScore = cloneFloat64(value.GlobalScore)
		copy.RatingBuckets = cloneSlice(value.RatingBuckets)
		copy.Tags = cloneSlice(value.Tags)
		result[value.SubjectID] = copy
	}
	return result, nil
}

func indexSubjectReferences(
	values []SubjectReference,
) (map[int64]SubjectReference, error) {
	result := make(map[int64]SubjectReference, len(values))
	for _, value := range values {
		if value.ID <= 0 || value.Name == "" {
			return nil, fieldError("")
		}
		if _, duplicate := result[value.ID]; duplicate {
			return nil, fieldError("")
		}
		result[value.ID] = cloneSubject(value)
	}
	return result, nil
}

func indexCharacterReferences(
	values []CharacterReference,
) (map[int64]CharacterReference, error) {
	result := make(map[int64]CharacterReference, len(values))
	for _, value := range values {
		if value.ID == nil || *value.ID <= 0 || value.Key == "" || value.Name == "" {
			return nil, fieldError("")
		}
		if _, duplicate := result[*value.ID]; duplicate {
			return nil, fieldError("")
		}
		result[*value.ID] = cloneCharacter(value)
	}
	return result, nil
}

func personalEntryIndex(
	scope string,
	values []query.CollectionEntry,
) (map[int64]query.CollectionEntry, error) {
	if scope == "global" {
		return nil, nil
	}
	if scope != "personal" {
		return nil, fieldError("/query/scope")
	}
	result := make(map[int64]query.CollectionEntry, len(values))
	for _, value := range values {
		if value.SubjectID <= 0 {
			return nil, fieldError("")
		}
		if _, duplicate := result[value.SubjectID]; duplicate {
			return nil, fieldError("")
		}
		copy := value
		copy.PersonalScore = cloneFloat64(value.PersonalScore)
		copy.Tags = cloneSlice(value.Tags)
		result[value.SubjectID] = copy
	}
	return result, nil
}

func intersectParticipantSubjects(values []participantEvidence) map[int64]struct{} {
	result := make(map[int64]struct{})
	if len(values) == 0 {
		return result
	}
	for subjectID := range values[0].subjects {
		result[subjectID] = struct{}{}
	}
	for _, participant := range values[1:] {
		for subjectID := range result {
			if _, found := participant.subjects[subjectID]; !found {
				delete(result, subjectID)
			}
		}
	}
	return result
}

func intersectTwoSubjects(
	left map[int64]struct{},
	right map[int64]struct{},
) []int64 {
	values := make(map[int64]struct{})
	for subjectID := range left {
		if _, found := right[subjectID]; found {
			values[subjectID] = struct{}{}
		}
	}
	return sortedSubjectIDs(values)
}

func commonContributions(
	unit statistics.Unit,
	participants []participantEvidence,
) []query.Contribution {
	result := make([]query.Contribution, 0)
	for _, participant := range participants {
		for _, subjectID := range unit.MatchedMemberIDs {
			for _, contribution := range participant.bySubject[subjectID] {
				result = append(result, cloneQueryContribution(contribution))
			}
		}
	}
	sort.Slice(result, func(left, right int) bool {
		a, b := result[left], result[right]
		switch {
		case a.PersonID != b.PersonID:
			return a.PersonID < b.PersonID
		case a.SubjectID != b.SubjectID:
			return a.SubjectID < b.SubjectID
		case a.PositionKey != b.PositionKey:
			return a.PositionKey < b.PositionKey
		case a.MemberPositionKey != b.MemberPositionKey:
			return a.MemberPositionKey < b.MemberPositionKey
		case a.CharacterID != b.CharacterID:
			return a.CharacterID < b.CharacterID
		default:
			return a.RoleType < b.RoleType
		}
	})
	return result
}

func selectedRating(
	scope string,
	set statistics.SetEvaluation,
) (*statistics.RatingSummary, error) {
	switch scope {
	case "global":
		copy := set.Global
		return &copy, nil
	case "personal":
		if set.Personal == nil {
			return nil, evaluationError(
				context.Background(),
				errors.New("costar: personal rating missing"),
			)
		}
		copy := *set.Personal
		return &copy, nil
	default:
		return nil, fieldError("/query/scope")
	}
}

func personalExtrema(units []statistics.Unit) (*int64, *int64) {
	var highest, lowest *int64
	for _, unit := range units {
		score := scoreHundredths(unit.PersonalScore)
		if score == nil {
			continue
		}
		if highest == nil || *score > *highest {
			highest = cloneInt64(score)
		}
		if lowest == nil || *score < *lowest {
			lowest = cloneInt64(score)
		}
	}
	return highest, lowest
}

func buildWorks(
	ctx context.Context,
	subjectType string,
	units []statistics.Unit,
	participants []participantEvidence,
	facts map[int64]query.Subject,
	subjects map[int64]SubjectReference,
	characters map[int64]CharacterReference,
	personal map[int64]query.CollectionEntry,
	series *statistics.SeriesIndex,
) ([]WorkItem, error) {
	result := make([]WorkItem, 0, len(units))
	for _, unit := range units {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if unit.UnitID <= 0 || len(unit.MatchedMemberIDs) == 0 {
			return nil, fieldError("")
		}
		for _, subjectID := range unit.CompleteMemberIDs {
			if _, found := subjects[subjectID]; !found {
				return nil, fail(
					CodeReferenceMissing,
					"co-star subject reference is missing",
					"",
					"",
					true,
					nil,
				)
			}
		}
		workParticipants, err := projectWorkParticipants(unit, participants, characters)
		if err != nil {
			return nil, err
		}
		if unit.Kind == statistics.UnitSubject {
			subject, found := subjects[unit.UnitID]
			fact, factFound := facts[unit.UnitID]
			if !found || !factFound ||
				len(unit.CompleteMemberIDs) != 1 ||
				len(unit.MatchedMemberIDs) != 1 ||
				unit.CompleteMemberIDs[0] != unit.UnitID ||
				unit.MatchedMemberIDs[0] != unit.UnitID {
				return nil, fieldError("")
			}
			var collection *CollectionEvidence
			if personal != nil {
				entry, found := personal[unit.UnitID]
				if !found {
					return nil, fieldError("")
				}
				collection = &CollectionEvidence{
					Score:     scoreHundredths(entry.PersonalScore),
					UpdatedAt: nonEmptyString(entry.UpdatedAt),
				}
			}
			result = append(result, WorkItem{
				Kind: "subject",
				Subject: &SubjectWork{
					Key:          subjectKey(unit.UnitID),
					Subject:      cloneSubject(subject),
					MetaTags:     sortedTagNames(fact.Tags, "meta"),
					GlobalScore:  scoreHundredths(unit.GlobalScore),
					Personal:     collection,
					Participants: workParticipants,
				},
			})
			continue
		}
		if unit.Kind != statistics.UnitSeries || series == nil {
			return nil, fieldError("")
		}
		component, found := series.ComponentFor(subjectType, unit.MatchedMemberIDs[0])
		if !found || component.SeriesID != unit.UnitID ||
			!samePositiveSet(component.MemberIDs, unit.CompleteMemberIDs) {
			return nil, fieldError("")
		}
		representative, found := subjects[component.RepresentativeID]
		if !found {
			return nil, fail(
				CodeReferenceMissing,
				"co-star representative reference is missing",
				"",
				"",
				true,
				nil,
			)
		}
		matched := make(map[int64]struct{}, len(unit.MatchedMemberIDs))
		for _, subjectID := range unit.MatchedMemberIDs {
			matched[subjectID] = struct{}{}
		}
		members := make([]SeriesMember, 0, len(component.MemberIDs))
		for _, subjectID := range component.MemberIDs {
			reference, found := subjects[subjectID]
			if !found {
				return nil, fieldError("")
			}
			_, isMatched := matched[subjectID]
			members = append(members, SeriesMember{
				SubjectReference: cloneSubject(reference),
				Matched:          isMatched,
			})
		}
		result = append(result, WorkItem{
			Kind: "series",
			Series: &SeriesWork{
				Key:                       seriesKey(unit.UnitID),
				SeriesID:                  unit.UnitID,
				Representative:            cloneSubject(representative),
				MatchedWorkCount:          len(unit.MatchedMemberIDs),
				MemberCount:               len(component.MemberIDs),
				Members:                   members,
				GlobalScore:               scoreHundredths(unit.GlobalScore),
				PersonalScore:             scoreHundredths(unit.PersonalScore),
				LatestCollectionUpdatedAt: nonEmptyString(unit.LatestUpdatedAt),
				Participants:              workParticipants,
			},
		})
	}
	sort.Slice(result, func(left, right int) bool {
		return workKey(result[left]) < workKey(result[right])
	})
	return result, nil
}

type contributionIdentity struct {
	kind             string
	positionKey      string
	exactPositionKey string
	characterID      int64
	roleType         int64
}

type contributionAggregate struct {
	identity contributionIdentity
	subjects map[int64]struct{}
}

func projectWorkParticipants(
	unit statistics.Unit,
	participants []participantEvidence,
	characters map[int64]CharacterReference,
) ([]WorkParticipant, error) {
	result := make([]WorkParticipant, 0, len(participants))
	matched := make(map[int64]struct{}, len(unit.MatchedMemberIDs))
	for _, subjectID := range unit.MatchedMemberIDs {
		matched[subjectID] = struct{}{}
	}
	for _, participant := range participants {
		aggregates := make(map[contributionIdentity]*contributionAggregate)
		participantSubjects := make(map[int64]struct{})
		for subjectID := range matched {
			for _, value := range participant.bySubject[subjectID] {
				participantSubjects[subjectID] = struct{}{}
				identity := contributionIdentity{
					kind:        value.Kind,
					positionKey: value.PositionKey,
				}
				switch value.Kind {
				case "staff":
					identity.exactPositionKey = value.PositionKey
					if value.MemberPositionKey != "" {
						identity.exactPositionKey = value.MemberPositionKey
					}
				case "cast":
					identity.characterID = value.CharacterID
					identity.roleType = value.RoleType
					if _, found := characters[value.CharacterID]; !found ||
						value.RoleType < 1 || value.RoleType > 6 {
						return nil, fieldError("")
					}
				default:
					return nil, fieldError("")
				}
				aggregate := aggregates[identity]
				if aggregate == nil {
					aggregate = &contributionAggregate{
						identity: identity,
						subjects: make(map[int64]struct{}),
					}
					aggregates[identity] = aggregate
				}
				aggregate.subjects[subjectID] = struct{}{}
			}
		}
		if len(participantSubjects) != len(unit.MatchedMemberIDs) {
			return nil, evaluationError(
				context.Background(),
				errors.New("costar: common unit lacks participant provenance"),
			)
		}
		ordered := make([]*contributionAggregate, 0, len(aggregates))
		for _, aggregate := range aggregates {
			ordered = append(ordered, aggregate)
		}
		sort.Slice(ordered, func(left, right int) bool {
			a, b := ordered[left].identity, ordered[right].identity
			switch {
			case a.positionKey != b.positionKey:
				return a.positionKey < b.positionKey
			case a.exactPositionKey != b.exactPositionKey:
				return a.exactPositionKey < b.exactPositionKey
			case a.characterID != b.characterID:
				return a.characterID < b.characterID
			default:
				return a.roleType < b.roleType
			}
		})
		credits := make([]Contribution, 0, len(ordered))
		for _, aggregate := range ordered {
			var workCount *int
			if unit.Kind == statistics.UnitSeries {
				count := len(aggregate.subjects)
				workCount = &count
			}
			if aggregate.identity.kind == "staff" {
				credits = append(credits, Contribution{
					Kind: "staff",
					Staff: &StaffContribution{
						PositionKey:      aggregate.identity.positionKey,
						ExactPositionKey: aggregate.identity.exactPositionKey,
						Provenance:       "exact",
						WorkCount:        workCount,
					},
				})
			} else {
				credits = append(credits, Contribution{
					Kind: "cast",
					Cast: &CastContribution{
						PositionKey: aggregate.identity.positionKey,
						Character:   cloneCharacter(characters[aggregate.identity.characterID]),
						RoleType:    aggregate.identity.roleType,
						RoleLabel:   roleLabel(aggregate.identity.roleType),
						Provenance:  "exact",
						WorkCount:   workCount,
					},
				})
			}
		}
		workParticipant := WorkParticipant{
			PersonID: participant.input.PersonID,
			Credits:  credits,
		}
		if unit.Kind == statistics.UnitSeries {
			count := len(participantSubjects)
			workParticipant.WorkCount = &count
		}
		result = append(result, workParticipant)
	}
	return result, nil
}

func buildTags(
	units []statistics.Unit,
	facts map[int64]query.Subject,
	personal map[int64]query.CollectionEntry,
	includePersonal bool,
) Tags {
	meta := make(map[string]*tagAggregate)
	community := make(map[string]*tagAggregate)
	personalTags := make(map[string]*tagAggregate)
	for _, unit := range units {
		unitMeta := make(map[string]string)
		unitCommunity := make(map[string]string)
		unitPersonal := make(map[string]string)
		for _, subjectID := range unit.MatchedMemberIDs {
			for _, tag := range facts[subjectID].Tags {
				target := unitCommunity
				if tag.Scope == "meta" {
					target = unitMeta
				}
				addNormalizedTag(target, tag.Name)
			}
			if includePersonal {
				for _, tag := range personal[subjectID].Tags {
					addNormalizedTag(unitPersonal, tag)
				}
			}
		}
		mergeUnitTags(meta, unitMeta)
		mergeUnitTags(community, unitCommunity)
		mergeUnitTags(personalTags, unitPersonal)
	}
	result := Tags{
		Meta:      boundedTags(meta, 6),
		Community: boundedTags(community, 8),
	}
	if includePersonal {
		result.Personal = boundedTags(personalTags, 6)
	}
	return result
}

type tagAggregate struct {
	name  string
	count int
	key   string
}

func addNormalizedTag(target map[string]string, name string) {
	trimmed := query.TrimV1(name)
	key := normalizeSearch(trimmed)
	if key == "" {
		return
	}
	if existing, found := target[key]; !found || trimmed < existing {
		target[key] = trimmed
	}
}

func mergeUnitTags(target map[string]*tagAggregate, unit map[string]string) {
	for key, name := range unit {
		value := target[key]
		if value == nil {
			value = &tagAggregate{name: name, key: key}
			target[key] = value
		}
		if name < value.name {
			value.name = name
		}
		value.count++
	}
}

func boundedTags(values map[string]*tagAggregate, limit int) []TagCount {
	ordered := make([]*tagAggregate, 0, len(values))
	for _, value := range values {
		ordered = append(ordered, value)
	}
	sort.Slice(ordered, func(left, right int) bool {
		if ordered[left].count != ordered[right].count {
			return ordered[left].count > ordered[right].count
		}
		return ordered[left].key < ordered[right].key
	})
	if len(ordered) > limit {
		ordered = ordered[:limit]
	}
	result := make([]TagCount, len(ordered))
	for index, value := range ordered {
		result[index] = TagCount{Name: value.name, Count: value.count}
	}
	return result
}

func buildRatingDataset(
	kind string,
	personID *int64,
	set statistics.SetEvaluation,
	subjects map[int64]SubjectReference,
	subjectType string,
	series *statistics.SeriesIndex,
) (RatingDataset, error) {
	references, err := unitReferences(set.Units, subjects, subjectType, series)
	if err != nil {
		return RatingDataset{}, err
	}
	global, err := ratingDistribution(
		set.Units,
		set.Global,
		references,
		func(unit statistics.Unit) *float64 { return unit.GlobalScore },
	)
	if err != nil {
		return RatingDataset{}, err
	}
	result := RatingDataset{
		Kind:     kind,
		PersonID: cloneInt64(personID),
		Global:   global,
	}
	if set.Personal != nil {
		personal, err := ratingDistribution(
			set.Units,
			*set.Personal,
			references,
			func(unit statistics.Unit) *float64 { return unit.PersonalScore },
		)
		if err != nil {
			return RatingDataset{}, err
		}
		result.Personal = &personal
	}
	return result, nil
}

func ratingDistribution(
	units []statistics.Unit,
	summary statistics.RatingSummary,
	references map[int64]RatingExample,
	scoreOf func(statistics.Unit) *float64,
) (RatingDistribution, error) {
	buckets := make([]RatingBucket, 10)
	for index := range buckets {
		buckets[index] = RatingBucket{
			Score:    index + 1,
			Examples: make([]RatingExample, 0),
		}
	}
	for _, unit := range units {
		score := scoreOf(unit)
		if score == nil || *score == 0 {
			continue
		}
		bucket := int(math.Floor(*score + 0.5))
		if bucket < 1 || bucket > 10 {
			return RatingDistribution{}, fieldError("")
		}
		reference, found := references[unit.UnitID]
		if !found {
			return RatingDistribution{}, fieldError("")
		}
		value := &buckets[bucket-1]
		value.Count++
		if len(value.Examples) < 8 {
			value.Examples = append(value.Examples, cloneRatingExample(reference))
		} else {
			value.HiddenCount++
		}
	}
	if summary.RatedUnitCount != sumBucketCounts(buckets) {
		return RatingDistribution{}, fieldError("")
	}
	timeline := make([]RatingTimelinePoint, len(summary.Timeline))
	for index, point := range summary.Timeline {
		timeline[index] = RatingTimelinePoint{
			Year:    point.Year,
			Quarter: point.Quarter,
			Average: point.AverageHundredths,
			Count:   point.RatedUnitCount,
		}
	}
	return RatingDistribution{
		ValidCount: summary.RatedUnitCount,
		Average:    cloneInt64(summary.AverageHundredths),
		Buckets:    buckets,
		Timeline:   timeline,
	}, nil
}

func buildPreference(
	set statistics.SetEvaluation,
	subjects map[int64]SubjectReference,
	subjectType string,
	series *statistics.SeriesIndex,
) (*Preference, error) {
	source := set.Preference
	if source == nil {
		return &Preference{
			EvidenceWeight: statistics.Rational{Numerator: "0", Denominator: "1"},
			Preferred:      make([]PreferenceItem, 0),
			Conservative:   make([]PreferenceItem, 0),
		}, nil
	}
	result := &Preference{
		ComparableCount:       source.ComparableCount,
		ComparableSeriesCount: source.ComparableSeriesCount,
		EffectiveEvidence:     source.EffectiveEvidence,
		Mean:                  cloneRational(source.Mean),
		EvidenceWeight:        source.EvidenceWeight,
		Score:                 cloneRational(source.Score),
		Preferred:             make([]PreferenceItem, 0),
		Conservative:          make([]PreferenceItem, 0),
	}
	references, err := unitReferences(set.Units, subjects, subjectType, series)
	if err != nil {
		return nil, err
	}
	items := make([]PreferenceItem, 0)
	for _, unit := range set.Units {
		personal := scoreHundredths(unit.PersonalScore)
		global := scoreHundredths(unit.GlobalScore)
		if personal == nil || global == nil {
			continue
		}
		reference, found := references[unit.UnitID]
		if !found {
			return nil, fieldError("")
		}
		items = append(items, PreferenceItem{
			Unit:                 cloneRatingExample(reference),
			PersonalScore:        *personal,
			GlobalScore:          *global,
			DifferenceHundredths: *personal - *global,
		})
	}
	sort.Slice(items, func(left, right int) bool {
		if items[left].DifferenceHundredths != items[right].DifferenceHundredths {
			return items[left].DifferenceHundredths > items[right].DifferenceHundredths
		}
		return items[left].Unit.Key < items[right].Unit.Key
	})
	for _, item := range items {
		if item.DifferenceHundredths > 0 && len(result.Preferred) < 3 {
			result.Preferred = append(result.Preferred, item)
		}
	}
	sort.Slice(items, func(left, right int) bool {
		if items[left].DifferenceHundredths != items[right].DifferenceHundredths {
			return items[left].DifferenceHundredths < items[right].DifferenceHundredths
		}
		return items[left].Unit.Key < items[right].Unit.Key
	})
	for _, item := range items {
		if item.DifferenceHundredths < 0 && len(result.Conservative) < 3 {
			result.Conservative = append(result.Conservative, item)
		}
	}
	return result, nil
}

func unitReferences(
	units []statistics.Unit,
	subjects map[int64]SubjectReference,
	subjectType string,
	series *statistics.SeriesIndex,
) (map[int64]RatingExample, error) {
	result := make(map[int64]RatingExample, len(units))
	for _, unit := range units {
		var reference SubjectReference
		switch unit.Kind {
		case statistics.UnitSubject:
			var found bool
			reference, found = subjects[unit.UnitID]
			if !found {
				return nil, fail(
					CodeReferenceMissing,
					"co-star subject reference is missing",
					"",
					"",
					true,
					nil,
				)
			}
		case statistics.UnitSeries:
			if series == nil || len(unit.MatchedMemberIDs) == 0 {
				return nil, fieldError("")
			}
			component, found := series.ComponentFor(subjectType, unit.MatchedMemberIDs[0])
			if !found || component.SeriesID != unit.UnitID {
				return nil, fieldError("")
			}
			reference, found = subjects[component.RepresentativeID]
			if !found {
				return nil, fail(
					CodeReferenceMissing,
					"co-star representative reference is missing",
					"",
					"",
					true,
					nil,
				)
			}
		default:
			return nil, fieldError("")
		}
		result[unit.UnitID] = RatingExample{
			Kind:   unit.Kind,
			Key:    unitKey(unit.Kind, unit.UnitID),
			ID:     unit.UnitID,
			Name:   reference.Name,
			NameCN: cloneString(reference.NameCN),
		}
	}
	return result, nil
}

func cloneEffectiveQuery(value query.EffectiveQuery) query.EffectiveQuery {
	value.CollectionStatuses = cloneSlice(value.CollectionStatuses)
	value.PositionKeys = cloneSlice(value.PositionKeys)
	return value
}

func clonePositionResults(values []query.PositionResult) []query.PositionResult {
	result := cloneSlice(values)
	for index := range result {
		result[index].CandidatePersonIDs = cloneSlice(result[index].CandidatePersonIDs)
		result[index].CandidateSubjectIDs = cloneSlice(result[index].CandidateSubjectIDs)
		result[index].Contributions = cloneSlice(result[index].Contributions)
		for contributionIndex := range result[index].Contributions {
			result[index].Contributions[contributionIndex] = cloneQueryContribution(
				result[index].Contributions[contributionIndex],
			)
		}
	}
	return result
}

func cloneQueryContribution(value query.Contribution) query.Contribution {
	if value.SortOrder != nil {
		copy := *value.SortOrder
		value.SortOrder = &copy
	}
	return value
}

func cloneCollectionEntries(values []query.CollectionEntry) []query.CollectionEntry {
	result := cloneSlice(values)
	for index := range result {
		result[index].PersonalScore = cloneFloat64(result[index].PersonalScore)
		result[index].Tags = cloneSlice(result[index].Tags)
	}
	return result
}

func cloneUnits(values []statistics.Unit) []statistics.Unit {
	result := cloneSlice(values)
	for index := range result {
		result[index].CompleteMemberIDs = cloneSlice(result[index].CompleteMemberIDs)
		result[index].MatchedMemberIDs = cloneSlice(result[index].MatchedMemberIDs)
		result[index].GlobalScore = cloneFloat64(result[index].GlobalScore)
		result[index].PersonalScore = cloneFloat64(result[index].PersonalScore)
		result[index].AirDate = cloneString(result[index].AirDate)
		result[index].Contributions = cloneSlice(result[index].Contributions)
		for contributionIndex := range result[index].Contributions {
			result[index].Contributions[contributionIndex] = cloneQueryContribution(
				result[index].Contributions[contributionIndex],
			)
		}
	}
	return result
}

func cloneFloat64(value *float64) *float64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneRational(value *statistics.Rational) *statistics.Rational {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func sortedSubjectIDs(values map[int64]struct{}) []int64 {
	result := make([]int64, 0, len(values))
	for value := range values {
		result = append(result, value)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left] < result[right]
	})
	return result
}

func samePositiveSet(left, right []int64) bool {
	a := cloneSlice(left)
	b := cloneSlice(right)
	sort.Slice(a, func(i, j int) bool { return a[i] < a[j] })
	sort.Slice(b, func(i, j int) bool { return b[i] < b[j] })
	if len(a) != len(b) {
		return false
	}
	for index := range a {
		if a[index] <= 0 || a[index] != b[index] ||
			(index > 0 && a[index-1] == a[index]) {
			return false
		}
	}
	return true
}

func sortedTagNames(values []query.SubjectTag, scope string) []string {
	result := make([]string, 0)
	seen := make(map[string]struct{})
	for _, value := range values {
		if value.Scope != scope || value.Name == "" {
			continue
		}
		if _, duplicate := seen[value.Name]; duplicate {
			continue
		}
		seen[value.Name] = struct{}{}
		result = append(result, value.Name)
	}
	sort.Slice(result, func(left, right int) bool {
		a, b := normalizeSearch(result[left]), normalizeSearch(result[right])
		if a != b {
			return a < b
		}
		return result[left] < result[right]
	})
	if len(result) > 16 {
		result = result[:16]
	}
	return result
}

func scoreHundredths(value *float64) *int64 {
	if value == nil || math.IsNaN(*value) || math.IsInf(*value, 0) ||
		*value <= 0 || *value > 10 {
		return nil
	}
	result := int64(math.Round(*value * 100))
	return &result
}

func nonEmptyString(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}

func participantRequestID(index int) string {
	return fmt.Sprintf("participant:%d", index)
}

func matrixRequestID(left, right int) string {
	return fmt.Sprintf("matrix:%d:%d", left, right)
}

func subjectKey(id int64) string { return "subject:" + strconv.FormatInt(id, 10) }
func seriesKey(id int64) string  { return "series:" + strconv.FormatInt(id, 10) }

func unitKey(kind statistics.UnitKind, id int64) string {
	if kind == statistics.UnitSeries {
		return seriesKey(id)
	}
	return subjectKey(id)
}

func roleLabel(roleType int64) string {
	switch roleType {
	case 1:
		return "主役"
	case 2:
		return "配角"
	case 3:
		return "客串"
	default:
		return "其他"
	}
}

func sumBucketCounts(values []RatingBucket) int {
	total := 0
	for _, value := range values {
		total += value.Count
	}
	return total
}

func workKey(value WorkItem) string {
	if value.Subject != nil {
		return value.Subject.Key
	}
	if value.Series != nil {
		return value.Series.Key
	}
	return ""
}

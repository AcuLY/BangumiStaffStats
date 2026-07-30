package persondetail

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

// Build constructs one complete immutable person core from the accepted query
// and statistics authorities plus a bounded Archive evidence projection.
func Build(ctx context.Context, request BuildRequest) (Core, error) {
	if err := contextError(ctx); err != nil {
		return Core{}, err
	}
	if !dataVersionPattern.MatchString(request.DataVersion) ||
		!queryDigestPattern.MatchString(request.Query.QueryDigest) ||
		request.PersonID <= 0 ||
		request.PersonID > maxJSONSafeInteger {
		return Core{}, fieldError("")
	}
	if request.Query.QueryDigest != request.Evaluation.QueryDigest ||
		request.DataVersion != request.Evaluation.DataVersion ||
		request.Query.EffectiveQuery.Scope != request.Evaluation.Scope {
		return Core{}, fail(
			CodeInternal,
			"person detail is unavailable",
			"",
			"",
			true,
			errors.New("persondetail: authority identity mismatch"),
		)
	}
	if request.Evidence.Person.ID == 0 {
		return Core{}, fail(CodeEntityNotFound, "person not found", "", "", false, nil)
	}
	if request.Evidence.Person.ID != request.PersonID ||
		request.Evidence.Person.Name == "" {
		return Core{}, fail(
			CodeInternal,
			"person detail is unavailable",
			"",
			"",
			true,
			errors.New("persondetail: invalid person evidence"),
		)
	}

	personSubjects, eligible := rankingPerson(
		request.Query.RankingPeople,
		request.PersonID,
	)
	if !eligible {
		return Core{}, fail(
			CodePersonNotInQueryResult,
			"person is not in the query result",
			"/input/personId",
			string(CodePersonNotInQueryResult),
			false,
			nil,
		)
	}
	evaluated, found := evaluatedPerson(request.Evaluation.People, request.PersonID)
	if !found {
		return Core{}, fail(
			CodeInternal,
			"person detail is unavailable",
			"",
			"",
			true,
			errors.New("persondetail: eligible person missing statistics"),
		)
	}
	if !samePositiveSet(personSubjects.SubjectIDs, matchedSubjectIDs(evaluated.Units)) {
		return Core{}, fail(
			CodeInternal,
			"person detail is unavailable",
			"",
			"",
			true,
			errors.New("persondetail: person membership/statistics mismatch"),
		)
	}

	subjectFacts, err := indexSubjectFacts(request.Facts.Subjects)
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
	var personal map[int64]query.CollectionEntry
	switch request.Query.EffectiveQuery.Scope {
	case "global":
		personal = nil
	case "personal":
		personal, err = indexPersonalEntries(request.PersonalEntries)
		if err != nil {
			return Core{}, err
		}
	default:
		return Core{}, fieldError("/query/scope")
	}

	works, err := buildWorks(
		ctx,
		request.Query.EffectiveQuery.SubjectType,
		evaluated.Units,
		subjectFacts,
		subjects,
		characters,
		personal,
		request.Series,
	)
	if err != nil {
		return Core{}, err
	}
	characterItems, err := buildCharacters(
		ctx,
		evaluated.Units,
		subjects,
		characters,
	)
	if err != nil {
		return Core{}, err
	}
	if !request.Evaluation.CastApplicable && len(characterItems) != 0 {
		return Core{}, fail(
			CodeInternal,
			"person detail is unavailable",
			"",
			"",
			true,
			errors.New("persondetail: cast evidence without cast capability"),
		)
	}
	metrics, err := buildMetrics(request.Query.EffectiveQuery.Scope, evaluated)
	if err != nil {
		return Core{}, err
	}
	tags := buildTags(
		evaluated.Units,
		subjectFacts,
		personal,
		request.Query.EffectiveQuery.Scope == "personal",
	)
	ratings, err := buildRatings(evaluated, works)
	if err != nil {
		return Core{}, err
	}
	preference, err := buildPreference(evaluated, works)
	if err != nil {
		return Core{}, err
	}
	characterCount := (*int)(nil)
	if request.Evaluation.CastApplicable {
		count := len(characterItems)
		characterCount = &count
	}
	result := Core{
		DataVersion: request.DataVersion,
		QueryDigest: request.Query.QueryDigest,
		Scope:       request.Query.EffectiveQuery.Scope,
		Person:      clonePersonProfile(request.Evidence.Person),
		Summary: Summary{
			WorkUnit:       request.Evaluation.UnitKind,
			WorkCount:      len(evaluated.Units),
			CharacterCount: characterCount,
		},
		Metrics:        metrics,
		Tags:           tags,
		Ratings:        ratings,
		Preference:     preference,
		Works:          works,
		Characters:     characterItems,
		CastApplicable: request.Evaluation.CastApplicable,
	}
	return CloneCore(result), nil
}

func rankingPerson(values []query.PersonSubjects, personID int64) (query.PersonSubjects, bool) {
	for _, value := range values {
		if value.PersonID == personID {
			result := value
			result.SubjectIDs = append([]int64(nil), value.SubjectIDs...)
			return result, true
		}
	}
	return query.PersonSubjects{}, false
}

func evaluatedPerson(
	values []statistics.PersonEvaluation,
	personID int64,
) (statistics.PersonEvaluation, bool) {
	found := false
	var result statistics.PersonEvaluation
	for _, value := range values {
		if value.PersonID != personID {
			continue
		}
		if found {
			return statistics.PersonEvaluation{}, false
		}
		found = true
		result = value
	}
	return result, found
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
		copy.RatingBuckets = append([]query.RatingBucket(nil), value.RatingBuckets...)
		copy.Tags = append([]query.SubjectTag(nil), value.Tags...)
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
		result[value.ID] = cloneSubjectReference(value)
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
		result[*value.ID] = cloneCharacterReference(value)
	}
	return result, nil
}

func indexPersonalEntries(
	values []query.CollectionEntry,
) (map[int64]query.CollectionEntry, error) {
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
		copy.Tags = append([]string(nil), value.Tags...)
		result[value.SubjectID] = copy
	}
	return result, nil
}

func buildWorks(
	ctx context.Context,
	subjectType string,
	units []statistics.Unit,
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
					CodeInternal,
					"person detail is unavailable",
					"",
					"",
					true,
					fmt.Errorf("persondetail: subject reference missing"),
				)
			}
		}
		contributions, err := projectContributions(unit, characters)
		if err != nil {
			return nil, err
		}
		if unit.Kind == statistics.UnitSubject {
			subject, found := subjects[unit.UnitID]
			fact, factFound := facts[unit.UnitID]
			if !found || !factFound || len(unit.CompleteMemberIDs) != 1 ||
				unit.CompleteMemberIDs[0] != unit.UnitID ||
				len(unit.MatchedMemberIDs) != 1 ||
				unit.MatchedMemberIDs[0] != unit.UnitID {
				return nil, fieldError("")
			}
			var collection *CollectionEvidence
			if personal != nil {
				entry, exists := personal[unit.UnitID]
				if !exists {
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
					Key:           subjectKey(unit.UnitID),
					Subject:       cloneSubjectReference(subject),
					MetaTags:      sortedTagNames(fact.Tags, "meta"),
					GlobalScore:   scoreHundredths(unit.GlobalScore),
					Personal:      collection,
					Contributions: contributions,
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
			return nil, fieldError("")
		}
		matched := make(map[int64]struct{}, len(unit.MatchedMemberIDs))
		for _, subjectID := range unit.MatchedMemberIDs {
			matched[subjectID] = struct{}{}
		}
		members := make([]SeriesMember, 0, len(component.MemberIDs))
		for _, subjectID := range component.MemberIDs {
			reference, exists := subjects[subjectID]
			if !exists {
				return nil, fieldError("")
			}
			_, isMatched := matched[subjectID]
			members = append(members, SeriesMember{
				SubjectReference: cloneSubjectReference(reference),
				Matched:          isMatched,
			})
		}
		result = append(result, WorkItem{
			Kind: "series",
			Series: &SeriesWork{
				Key:                       seriesKey(unit.UnitID),
				SeriesID:                  unit.UnitID,
				Representative:            cloneSubjectReference(representative),
				MatchedWorkCount:          len(unit.MatchedMemberIDs),
				MemberCount:               len(component.MemberIDs),
				Members:                   members,
				GlobalScore:               scoreHundredths(unit.GlobalScore),
				PersonalScore:             scoreHundredths(unit.PersonalScore),
				LatestCollectionUpdatedAt: nonEmptyString(unit.LatestUpdatedAt),
				Contributions:             contributions,
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

func projectContributions(
	unit statistics.Unit,
	characters map[int64]CharacterReference,
) ([]Contribution, error) {
	aggregates := make(map[contributionIdentity]*contributionAggregate)
	for _, value := range unit.Contributions {
		if value.SubjectID <= 0 || value.PositionKey == "" {
			return nil, fieldError("")
		}
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
			if identity.exactPositionKey == "" {
				return nil, fieldError("")
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
		aggregate.subjects[value.SubjectID] = struct{}{}
	}
	values := make([]*contributionAggregate, 0, len(aggregates))
	for _, value := range aggregates {
		values = append(values, value)
	}
	sort.Slice(values, func(left, right int) bool {
		a, b := values[left].identity, values[right].identity
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
	result := make([]Contribution, 0, len(values))
	for _, aggregate := range values {
		var workCount *int
		if unit.Kind == statistics.UnitSeries {
			count := len(aggregate.subjects)
			workCount = &count
		}
		if aggregate.identity.kind == "staff" {
			result = append(result, Contribution{
				Kind: "staff",
				Staff: &StaffContribution{
					PositionKey:      aggregate.identity.positionKey,
					ExactPositionKey: aggregate.identity.exactPositionKey,
					Provenance:       "exact",
					WorkCount:        workCount,
				},
			})
			continue
		}
		result = append(result, Contribution{
			Kind: "cast",
			Cast: &CastContribution{
				PositionKey: aggregate.identity.positionKey,
				Character: cloneCharacterReference(
					characters[aggregate.identity.characterID],
				),
				RoleType:   aggregate.identity.roleType,
				RoleLabel:  roleLabel(aggregate.identity.roleType),
				Provenance: "exact",
				WorkCount:  workCount,
			},
		})
	}
	return result, nil
}

type characterAggregate struct {
	reference   CharacterReference
	appearances map[int64]*CharacterAppearance
}

func buildCharacters(
	ctx context.Context,
	units []statistics.Unit,
	subjects map[int64]SubjectReference,
	characters map[int64]CharacterReference,
) ([]CharacterItem, error) {
	aggregates := make(map[int64]*characterAggregate)
	for _, unit := range units {
		for _, value := range unit.Contributions {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			if value.Kind != "cast" {
				continue
			}
			character, found := characters[value.CharacterID]
			subject, subjectFound := subjects[value.SubjectID]
			if !found || !subjectFound || value.RoleType < 1 || value.RoleType > 6 {
				return nil, fieldError("")
			}
			aggregate := aggregates[value.CharacterID]
			if aggregate == nil {
				aggregate = &characterAggregate{
					reference:   cloneCharacterReference(character),
					appearances: make(map[int64]*CharacterAppearance),
				}
				aggregates[value.CharacterID] = aggregate
			}
			appearance := aggregate.appearances[value.SubjectID]
			if appearance == nil {
				appearance = &CharacterAppearance{
					Subject:   cloneSubjectReference(subject),
					RoleType:  value.RoleType,
					RoleLabel: roleLabel(value.RoleType),
				}
				aggregate.appearances[value.SubjectID] = appearance
			} else if value.RoleType < appearance.RoleType {
				appearance.RoleType = value.RoleType
				appearance.RoleLabel = roleLabel(value.RoleType)
			}
			if !containsString(appearance.PositionKeys, value.PositionKey) {
				appearance.PositionKeys = append(appearance.PositionKeys, value.PositionKey)
			}
		}
	}
	ids := make([]int64, 0, len(aggregates))
	for id := range aggregates {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(left, right int) bool { return ids[left] < ids[right] })
	result := make([]CharacterItem, 0, len(ids))
	for _, id := range ids {
		aggregate := aggregates[id]
		subjectIDs := make([]int64, 0, len(aggregate.appearances))
		for subjectID := range aggregate.appearances {
			subjectIDs = append(subjectIDs, subjectID)
		}
		sort.Slice(subjectIDs, func(left, right int) bool {
			return subjectIDs[left] < subjectIDs[right]
		})
		appearances := make([]CharacterAppearance, 0, len(subjectIDs))
		primaryRole := int64(7)
		for _, subjectID := range subjectIDs {
			appearance := *aggregate.appearances[subjectID]
			sort.Strings(appearance.PositionKeys)
			if appearance.RoleType < primaryRole {
				primaryRole = appearance.RoleType
			}
			appearances = append(appearances, appearance)
		}
		result = append(result, CharacterItem{
			Character:   cloneCharacterReference(aggregate.reference),
			PrimaryRole: primaryRole,
			RoleLabel:   roleLabel(primaryRole),
			WorkCount:   len(appearances),
			Appearances: appearances,
		})
	}
	return result, nil
}

func buildMetrics(scope string, evaluated statistics.PersonEvaluation) (Metrics, error) {
	rating := &evaluated.Global
	result := Metrics{}
	if scope == "personal" {
		if evaluated.Personal == nil {
			return Metrics{}, fieldError("")
		}
		rating = evaluated.Personal
		result.GlobalAverage = cloneInt64(evaluated.Global.AverageHundredths)
		var highest, lowest *int64
		for _, unit := range evaluated.Units {
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
		result.Highest = highest
		result.Lowest = lowest
	}
	result.RatedWorkCount = rating.RatedUnitCount
	result.Average = cloneInt64(rating.AverageHundredths)
	result.Overall = cloneInt64(rating.OverallHundredths)
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

func buildRatings(
	evaluated statistics.PersonEvaluation,
	works []WorkItem,
) (Ratings, error) {
	if len(evaluated.Units) != len(works) {
		return Ratings{}, fieldError("")
	}
	references := make(map[int64]RatingExample, len(works))
	for _, work := range works {
		example, err := workExample(work)
		if err != nil {
			return Ratings{}, err
		}
		references[example.ID] = example
	}
	global, err := ratingDistribution(
		evaluated.Units,
		evaluated.Global,
		references,
		func(unit statistics.Unit) *float64 { return unit.GlobalScore },
	)
	if err != nil {
		return Ratings{}, err
	}
	result := Ratings{Global: global}
	if evaluated.Personal != nil {
		personal, err := ratingDistribution(
			evaluated.Units,
			*evaluated.Personal,
			references,
			func(unit statistics.Unit) *float64 { return unit.PersonalScore },
		)
		if err != nil {
			return Ratings{}, err
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
	evaluated statistics.PersonEvaluation,
	works []WorkItem,
) (*Preference, error) {
	if evaluated.Preference == nil {
		return nil, nil
	}
	source := evaluated.Preference
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
	references := make(map[int64]RatingExample, len(works))
	for _, work := range works {
		reference, err := workExample(work)
		if err != nil {
			return nil, err
		}
		references[reference.ID] = reference
	}
	items := make([]PreferenceItem, 0)
	for _, unit := range evaluated.Units {
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

func workExample(value WorkItem) (RatingExample, error) {
	if value.Subject != nil {
		return RatingExample{
			Kind:   statistics.UnitSubject,
			Key:    value.Subject.Key,
			ID:     value.Subject.Subject.ID,
			Name:   value.Subject.Subject.Name,
			NameCN: cloneString(value.Subject.Subject.NameCN),
		}, nil
	}
	if value.Series != nil {
		return RatingExample{
			Kind:   statistics.UnitSeries,
			Key:    value.Series.Key,
			ID:     value.Series.SeriesID,
			Name:   value.Series.Representative.Name,
			NameCN: cloneString(value.Series.Representative.NameCN),
		}, nil
	}
	return RatingExample{}, fieldError("")
}

func matchedSubjectIDs(units []statistics.Unit) []int64 {
	values := make([]int64, 0)
	for _, unit := range units {
		values = append(values, unit.MatchedMemberIDs...)
	}
	sort.Slice(values, func(left, right int) bool { return values[left] < values[right] })
	write := 0
	for _, value := range values {
		if write == 0 || values[write-1] != value {
			values[write] = value
			write++
		}
	}
	return values[:write]
}

func samePositiveSet(left, right []int64) bool {
	a := append([]int64(nil), left...)
	b := append([]int64(nil), right...)
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

func subjectKey(id int64) string { return "subject:" + strconv.FormatInt(id, 10) }

func seriesKey(id int64) string { return "series:" + strconv.FormatInt(id, 10) }

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

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func sumBucketCounts(values []RatingBucket) int {
	total := 0
	for _, value := range values {
		total += value.Count
	}
	return total
}

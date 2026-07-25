package statistics

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// PersonEvidence is the complete immutable core for one person.
type PersonEvidence struct {
	PersonID        int64
	HasCastIdentity bool
	Units           []Unit
}

// SummaryOptions carries query-level applicability that cannot be inferred
// from result rows when a selected identity has no matches.
type SummaryOptions struct {
	CastApplicable bool
}

// BuildSummary de-duplicates complete-core entities while retaining exact
// canonical contribution attribution. Callers with query-level identity
// information should use BuildSummaryWithOptions.
func BuildSummary(ctx context.Context, kind UnitKind, people []PersonEvidence) (*Summary, error) {
	return BuildSummaryWithOptions(ctx, kind, people, SummaryOptions{})
}

// BuildSummaryWithOptions preserves applicability independently of matches.
func BuildSummaryWithOptions(
	ctx context.Context,
	kind UnitKind,
	people []PersonEvidence,
	options SummaryOptions,
) (*Summary, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if !validUnitKind(kind) {
		return nil, outcome(CodeInputInvalid)
	}
	personIDs := make(map[int64]struct{}, len(people))
	unitIDs := make(map[int64]struct{})
	matchedIDs := make(map[int64]struct{})
	completeIDs := make(map[int64]struct{})
	characterIDs := make(map[int64]struct{})
	hasCast := options.CastApplicable
	attributions := make([]query.Contribution, 0)
	seenAttributions := make(map[attributionIdentity]struct{})
	for _, person := range people {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		if person.PersonID <= 0 {
			return nil, outcome(CodeInputInvalid)
		}
		personIDs[person.PersonID] = struct{}{}
		hasCast = hasCast || person.HasCastIdentity
		for _, unit := range person.Units {
			if err := contextError(ctx); err != nil {
				return nil, err
			}
			if unit.Kind != kind || unit.UnitID <= 0 {
				return nil, outcome(CodeInputInvalid)
			}
			unitIDs[unit.UnitID] = struct{}{}
			for _, subjectID := range unit.MatchedMemberIDs {
				if err := contextError(ctx); err != nil {
					return nil, err
				}
				if subjectID <= 0 {
					return nil, outcome(CodeInputInvalid)
				}
				matchedIDs[subjectID] = struct{}{}
			}
			for _, subjectID := range unit.CompleteMemberIDs {
				if err := contextError(ctx); err != nil {
					return nil, err
				}
				if subjectID <= 0 {
					return nil, outcome(CodeInputInvalid)
				}
				completeIDs[subjectID] = struct{}{}
			}
			for _, contribution := range unit.Contributions {
				if err := contextError(ctx); err != nil {
					return nil, err
				}
				if contribution.PersonID != person.PersonID {
					return nil, outcome(CodeInputInvalid)
				}
				identity := contributionIdentity(contribution)
				if _, duplicate := seenAttributions[identity]; duplicate {
					continue
				}
				seenAttributions[identity] = struct{}{}
				attributions = append(attributions, contribution)
				if contribution.Kind == "cast" {
					hasCast = true
					if contribution.CharacterID <= 0 {
						return nil, outcome(CodeInputInvalid)
					}
					characterIDs[contribution.CharacterID] = struct{}{}
				}
			}
		}
	}
	canceled := false
	sort.Slice(attributions, func(left, right int) bool {
		if context.Cause(ctx) != nil {
			canceled = true
			return contributionLess(attributions[left], attributions[right])
		}
		return contributionLess(attributions[left], attributions[right])
	})
	if canceled {
		return nil, contextError(ctx)
	}
	sortedUnitIDs, err := sortedKeysContext(ctx, unitIDs)
	if err != nil {
		return nil, err
	}
	sortedMatchedIDs, err := sortedKeysContext(ctx, matchedIDs)
	if err != nil {
		return nil, err
	}
	sortedCompleteIDs, err := sortedKeysContext(ctx, completeIDs)
	if err != nil {
		return nil, err
	}
	sortedCharacterIDs, err := sortedKeysContext(ctx, characterIDs)
	if err != nil {
		return nil, err
	}
	copiedAttributions, err := cloneContributionsContext(ctx, attributions)
	if err != nil {
		return nil, err
	}
	result := &Summary{
		PersonCount:        len(personIDs),
		UnitKind:           kind,
		UnitIDs:            sortedUnitIDs,
		MatchedSubjectIDs:  sortedMatchedIDs,
		CompleteSubjectIDs: sortedCompleteIDs,
		CharacterIDs:       sortedCharacterIDs,
		Attributions:       copiedAttributions,
	}
	if kind == UnitSubject {
		result.WorkCount = len(unitIDs)
		result.MatchedSubjectIDs = nil
		result.CompleteSubjectIDs = nil
	} else {
		result.WorkCount = len(matchedIDs)
		seriesCount := len(unitIDs)
		result.SeriesCount = &seriesCount
	}
	if hasCast {
		characterCount := len(characterIDs)
		result.CharacterCount = &characterCount
	} else {
		result.CharacterIDs = nil
	}
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

type attributionIdentity struct {
	positionKey       string
	memberPositionKey string
	kind              string
	subjectID         int64
	personID          int64
	positionID        int64
	characterID       int64
	roleType          int64
	sortOrder         int64
	hasSortOrder      bool
}

func contributionIdentity(value query.Contribution) attributionIdentity {
	identity := attributionIdentity{
		positionKey:       value.PositionKey,
		memberPositionKey: value.MemberPositionKey,
		kind:              value.Kind,
		subjectID:         value.SubjectID,
		personID:          value.PersonID,
		positionID:        value.PositionID,
		characterID:       value.CharacterID,
		roleType:          value.RoleType,
	}
	if value.SortOrder != nil {
		identity.sortOrder = *value.SortOrder
		identity.hasSortOrder = true
	}
	return identity
}

func contributionLess(left, right query.Contribution) bool {
	switch {
	case left.PersonID != right.PersonID:
		return left.PersonID < right.PersonID
	case left.SubjectID != right.SubjectID:
		return left.SubjectID < right.SubjectID
	case left.PositionID != right.PositionID:
		return left.PositionID < right.PositionID
	case left.CharacterID != right.CharacterID:
		return left.CharacterID < right.CharacterID
	case left.RoleType != right.RoleType:
		return left.RoleType < right.RoleType
	case (left.SortOrder != nil) != (right.SortOrder != nil):
		return left.SortOrder == nil
	case contributionSortOrder(left) != contributionSortOrder(right):
		return contributionSortOrder(left) < contributionSortOrder(right)
	case left.MemberPositionKey != right.MemberPositionKey:
		return left.MemberPositionKey < right.MemberPositionKey
	case left.Kind != right.Kind:
		return left.Kind < right.Kind
	default:
		return left.PositionKey < right.PositionKey
	}
}

func contributionSortOrder(value query.Contribution) int64 {
	if value.SortOrder == nil {
		return 0
	}
	return *value.SortOrder
}

func sortedKeysContext(ctx context.Context, values map[int64]struct{}) ([]int64, error) {
	result := make([]int64, 0, len(values))
	for value := range values {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		result = append(result, value)
	}
	canceled := false
	sort.Slice(result, func(left, right int) bool {
		if context.Cause(ctx) != nil {
			canceled = true
		}
		return result[left] < result[right]
	})
	if canceled {
		return nil, contextError(ctx)
	}
	return result, nil
}

func cloneContributionsContext(
	ctx context.Context,
	values []query.Contribution,
) ([]query.Contribution, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if len(values) == 0 {
		return nil, nil
	}
	result := make([]query.Contribution, len(values))
	for index, value := range values {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		result[index] = value
		if value.SortOrder != nil {
			order := *value.SortOrder
			result[index].SortOrder = &order
		}
	}
	return result, nil
}

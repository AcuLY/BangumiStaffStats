package persondetail

import (
	"context"
	"math"
	"sort"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

// NormalizeView applies exact section defaults and rejects cross-scope or
// cross-section sort values before any expensive computation.
func NormalizeView(
	scope string,
	workUnit statistics.UnitKind,
	castApplicable bool,
	input *ViewInput,
) (View, error) {
	result := View{
		Section:  SectionWorks,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	}
	if input != nil {
		if input.Section != nil {
			result.Section = *input.Section
		}
		if input.Search != nil {
			result.Search = *input.Search
		}
		if input.Order != nil {
			result.Order = *input.Order
		}
		if input.Page != nil {
			result.Page = *input.Page
		}
		if input.PageSize != nil {
			result.PageSize = *input.PageSize
		}
	}
	if result.Section == SectionCharacters {
		result.Sort = SortRole
	} else {
		result.Sort = SortGlobalScore
	}
	if input != nil && input.Sort != nil {
		result.Sort = *input.Sort
	}

	if !utf8.ValidString(result.Search) || utf8.RuneCountInString(result.Search) > 256 {
		return View{}, viewFailure("/view/search", "OUT_OF_RANGE")
	}
	if result.Order != OrderAscending && result.Order != OrderDescending {
		return View{}, viewFailure("/view/order", "UNSUPPORTED_VALUE")
	}
	if result.Page < 1 || result.Page > maxJSONSafeInteger {
		return View{}, viewFailure("/view/page", "OUT_OF_RANGE")
	}
	if result.PageSize != 5 && result.PageSize != 10 && result.PageSize != 20 {
		return View{}, viewFailure("/view/pageSize", "UNSUPPORTED_VALUE")
	}

	switch result.Section {
	case SectionWorks:
		switch result.Sort {
		case SortGlobalScore:
		case SortPersonalScore, SortCollectionUpdatedAt:
			if scope != "personal" {
				return View{}, fieldError("/view/sort")
			}
		case SortSeriesSize:
			if workUnit != statistics.UnitSeries {
				return View{}, viewFailure("/view/sort", "UNSUPPORTED_VALUE")
			}
		default:
			return View{}, viewFailure("/view/sort", "UNSUPPORTED_VALUE")
		}
	case SectionCharacters:
		if !castApplicable {
			return View{}, capabilityError("/view/section")
		}
		switch result.Sort {
		case SortRole, SortWorkCount, SortName:
		default:
			return View{}, viewFailure("/view/sort", "UNSUPPORTED_VALUE")
		}
	default:
		return View{}, viewFailure("/view/section", "UNSUPPORTED_VALUE")
	}
	if scope != "global" && scope != "personal" {
		return View{}, fieldError("/query/scope")
	}
	result.Search = normalizeSearch(result.Search)
	return result, nil
}

// Project derives an independent page without mutating the complete core.
func Project(ctx context.Context, value Core, view View) (Projection, error) {
	if err := contextError(ctx); err != nil {
		return Projection{}, err
	}
	normalized, err := NormalizeView(
		value.Scope,
		value.Summary.WorkUnit,
		value.CastApplicable,
		&ViewInput{
			Section:  &view.Section,
			Search:   &view.Search,
			Sort:     &view.Sort,
			Order:    &view.Order,
			Page:     &view.Page,
			PageSize: &view.PageSize,
		},
	)
	if err != nil {
		return Projection{}, err
	}
	result := Projection{
		Core:    CloneCore(value),
		Section: normalized.Section,
		Pagination: Pagination{
			Page:     normalized.Page,
			PageSize: normalized.PageSize,
		},
	}
	// The selected page is returned separately. Complete section arrays are
	// removed from the embedded core so a transport cannot accidentally expose
	// the unbounded set beside the page.
	result.Core.Works = nil
	result.Core.Characters = nil

	if normalized.Section == SectionWorks {
		items, total, projectErr := projectWorks(ctx, value.Works, normalized)
		if projectErr != nil {
			return Projection{}, projectErr
		}
		result.Works = items
		result.Characters = nil
		result.Pagination.Total = total
		return result, nil
	}
	items, total, err := projectCharacters(ctx, value.Characters, normalized)
	if err != nil {
		return Projection{}, err
	}
	result.Characters = items
	result.Works = nil
	result.Pagination.Total = total
	return result, nil
}

func projectWorks(
	ctx context.Context,
	values []WorkItem,
	view View,
) ([]WorkItem, int, error) {
	ordered := cloneWorks(values)
	for _, value := range ordered {
		if err := validateWorkItem(value); err != nil {
			return nil, 0, err
		}
	}
	sort.Slice(ordered, func(left, right int) bool {
		return compareWork(ordered[left], ordered[right], view) < 0
	})
	filtered := make([]WorkItem, 0, len(ordered))
	for _, value := range ordered {
		if err := contextError(ctx); err != nil {
			return nil, 0, err
		}
		if view.Search != "" && !workMatches(value, view.Search) {
			continue
		}
		filtered = append(filtered, cloneWorkItem(value))
	}
	total := len(filtered)
	start := checkedPageStart(view.Page, view.PageSize, total)
	end := start + view.PageSize
	if end > total {
		end = total
	}
	return cloneWorks(filtered[start:end]), total, nil
}

func projectCharacters(
	ctx context.Context,
	values []CharacterItem,
	view View,
) ([]CharacterItem, int, error) {
	ordered := cloneCharacters(values)
	for _, value := range ordered {
		if value.Character.Key == "" || value.WorkCount < 1 ||
			len(value.Appearances) != value.WorkCount {
			return nil, 0, fieldError("")
		}
	}
	sort.Slice(ordered, func(left, right int) bool {
		return compareCharacter(ordered[left], ordered[right], view) < 0
	})
	filtered := make([]CharacterItem, 0, len(ordered))
	for _, value := range ordered {
		if err := contextError(ctx); err != nil {
			return nil, 0, err
		}
		if view.Search != "" &&
			!strings.Contains(normalizeSearch(value.Character.Name), view.Search) &&
			(value.Character.NameCN == nil ||
				!strings.Contains(normalizeSearch(*value.Character.NameCN), view.Search)) {
			continue
		}
		filtered = append(filtered, cloneCharacterItem(value))
	}
	total := len(filtered)
	start := checkedPageStart(view.Page, view.PageSize, total)
	end := start + view.PageSize
	if end > total {
		end = total
	}
	return cloneCharacters(filtered[start:end]), total, nil
}

func compareWork(left, right WorkItem, view View) int {
	var primary int
	var presenceOnly bool
	switch view.Sort {
	case SortGlobalScore:
		primary, presenceOnly = compareOptionalInt64Primary(
			workGlobalScore(left),
			workGlobalScore(right),
		)
	case SortPersonalScore:
		primary, presenceOnly = compareOptionalInt64Primary(
			workPersonalScore(left),
			workPersonalScore(right),
		)
	case SortCollectionUpdatedAt:
		primary, presenceOnly = compareOptionalStringPrimary(
			workCollectionUpdatedAt(left),
			workCollectionUpdatedAt(right),
		)
	case SortSeriesSize:
		primary = compareInt(workSeriesSize(left), workSeriesSize(right))
	}
	if primary != 0 {
		if presenceOnly {
			return primary
		}
		if view.Order == OrderDescending {
			return -primary
		}
		return primary
	}
	// Stable fallbacks are invariant to direction and keep missing primary
	// values last through the optional comparison above.
	if score, presence := compareOptionalInt64Primary(
		workGlobalScore(left),
		workGlobalScore(right),
	); score != 0 {
		if presence {
			return score
		}
		return -score
	}
	if name := strings.Compare(workSearchName(left), workSearchName(right)); name != 0 {
		return name
	}
	return strings.Compare(workKey(left), workKey(right))
}

func compareCharacter(left, right CharacterItem, view View) int {
	var primary int
	switch view.Sort {
	case SortRole:
		// Smaller role_type is more prominent. Convert to a larger-is-better
		// priority so desc places main roles first.
		primary = compareInt(rolePriority(left.PrimaryRole), rolePriority(right.PrimaryRole))
	case SortWorkCount:
		primary = compareInt(left.WorkCount, right.WorkCount)
	case SortName:
		primary = strings.Compare(characterSearchName(left), characterSearchName(right))
	}
	if primary != 0 {
		if view.Order == OrderDescending {
			return -primary
		}
		return primary
	}
	if works := compareInt(left.WorkCount, right.WorkCount); works != 0 {
		return -works
	}
	if role := compareInt(rolePriority(left.PrimaryRole), rolePriority(right.PrimaryRole)); role != 0 {
		return -role
	}
	if name := strings.Compare(characterSearchName(left), characterSearchName(right)); name != 0 {
		return name
	}
	return strings.Compare(left.Character.Key, right.Character.Key)
}

func compareOptionalInt64Primary(left, right *int64) (int, bool) {
	switch {
	case left == nil && right == nil:
		return 0, false
	case left == nil:
		return 1, true
	case right == nil:
		return -1, true
	case *left < *right:
		return -1, false
	case *left > *right:
		return 1, false
	default:
		return 0, false
	}
}

func compareOptionalStringPrimary(left, right *string) (int, bool) {
	switch {
	case left == nil && right == nil:
		return 0, false
	case left == nil:
		return 1, true
	case right == nil:
		return -1, true
	default:
		return strings.Compare(*left, *right), false
	}
}

func compareInt(left, right int) int {
	switch {
	case left < right:
		return -1
	case left > right:
		return 1
	default:
		return 0
	}
}

func normalizeSearch(value string) string {
	return cases.Fold().String(norm.NFKC.String(query.TrimV1(value)))
}

func workMatches(value WorkItem, search string) bool {
	if value.Subject != nil {
		return subjectMatches(value.Subject.Subject, search)
	}
	if value.Series == nil {
		return false
	}
	if subjectMatches(value.Series.Representative, search) {
		return true
	}
	for _, member := range value.Series.Members {
		if subjectMatches(member.SubjectReference, search) {
			return true
		}
	}
	return false
}

func subjectMatches(value SubjectReference, search string) bool {
	return strings.Contains(normalizeSearch(value.Name), search) ||
		(value.NameCN != nil && strings.Contains(normalizeSearch(*value.NameCN), search))
}

func workGlobalScore(value WorkItem) *int64 {
	if value.Subject != nil {
		return value.Subject.GlobalScore
	}
	if value.Series != nil {
		return value.Series.GlobalScore
	}
	return nil
}

func workPersonalScore(value WorkItem) *int64 {
	if value.Subject != nil && value.Subject.Personal != nil {
		return value.Subject.Personal.Score
	}
	if value.Series != nil {
		return value.Series.PersonalScore
	}
	return nil
}

func workCollectionUpdatedAt(value WorkItem) *string {
	if value.Subject != nil && value.Subject.Personal != nil {
		return value.Subject.Personal.UpdatedAt
	}
	if value.Series != nil {
		return value.Series.LatestCollectionUpdatedAt
	}
	return nil
}

func workSeriesSize(value WorkItem) int {
	if value.Series == nil {
		return 0
	}
	return value.Series.MemberCount
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

func workSearchName(value WorkItem) string {
	var reference SubjectReference
	if value.Subject != nil {
		reference = value.Subject.Subject
	} else if value.Series != nil {
		reference = value.Series.Representative
	}
	if reference.NameCN != nil {
		return normalizeSearch(*reference.NameCN)
	}
	return normalizeSearch(reference.Name)
}

func characterSearchName(value CharacterItem) string {
	if value.Character.NameCN != nil {
		return normalizeSearch(*value.Character.NameCN)
	}
	return normalizeSearch(value.Character.Name)
}

func rolePriority(roleType int64) int {
	if roleType < 1 || roleType > 6 {
		return 0
	}
	return 7 - int(roleType)
}

func checkedPageStart(page int64, pageSize, total int) int {
	offset := page - 1
	if offset > int64(math.MaxInt)/int64(pageSize) {
		return total
	}
	start := offset * int64(pageSize)
	if start >= int64(total) {
		return total
	}
	return int(start)
}

func validateWorkItem(value WorkItem) error {
	if value.Kind == "subject" && value.Subject != nil && value.Series == nil &&
		value.Subject.Key != "" && value.Subject.Subject.ID > 0 {
		return nil
	}
	if value.Kind == "series" && value.Series != nil && value.Subject == nil &&
		value.Series.Key != "" && value.Series.SeriesID > 0 &&
		value.Series.MemberCount == len(value.Series.Members) &&
		value.Series.MatchedWorkCount > 0 &&
		value.Series.MatchedWorkCount <= value.Series.MemberCount {
		return nil
	}
	return fieldError("")
}

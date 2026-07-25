package costar

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Project derives an independently-owned common-work page without mutating
// invariant participants, summary, evidence, matrix, or the cached core.
func Project(ctx context.Context, core Core, view View) (Projection, error) {
	if err := contextError(ctx); err != nil {
		return Projection{}, err
	}
	if err := validateView(
		core.Scope,
		core.WorkUnit == statistics.UnitSeries,
		view,
	); err != nil {
		return Projection{}, err
	}
	if err := validateCore(core); err != nil {
		return Projection{}, err
	}
	view.Search = normalizeSearch(view.Search)
	ordered := cloneWorks(core.Works)
	for _, work := range ordered {
		if err := validateWork(work, core.Participants); err != nil {
			return Projection{}, err
		}
	}
	sort.Slice(ordered, func(left, right int) bool {
		return compareWork(ordered[left], ordered[right], view) < 0
	})
	filtered := make([]WorkItem, 0, len(ordered))
	for _, work := range ordered {
		if err := contextError(ctx); err != nil {
			return Projection{}, err
		}
		if view.Search != "" && !workMatches(work, view.Search) {
			continue
		}
		filtered = append(filtered, cloneWork(work))
	}
	total := len(filtered)
	start := checkedPageStart(view.Page, view.PageSize, total)
	end := start + view.PageSize
	if end > total {
		end = total
	}
	invariants := CloneCore(core)
	invariants.Works = nil
	return Projection{
		Core:  invariants,
		Items: cloneWorks(filtered[start:end]),
		Pagination: Pagination{
			Page:     view.Page,
			PageSize: view.PageSize,
			Total:    total,
		},
	}, nil
}

func validateCore(core Core) error {
	if !dataVersionPattern.MatchString(core.DataVersion) ||
		!queryDigestPattern.MatchString(core.QueryDigest) ||
		(core.Scope != "global" && core.Scope != "personal") ||
		(core.Kind != "pair" && core.Kind != "group") ||
		(core.WorkUnit != statistics.UnitSubject &&
			core.WorkUnit != statistics.UnitSeries) ||
		len(core.Participants) < 2 || len(core.Participants) > 10 ||
		core.Summary.UnionWorkCount < core.Summary.CommonWorkCount ||
		(core.Works != nil && core.Summary.CommonWorkCount != len(core.Works)) ||
		core.Summary.RatedWorkCount < 0 {
		return fieldError("")
	}
	if (len(core.Participants) == 2) != (core.Kind == "pair") {
		return fieldError("")
	}
	seen := make(map[int64]struct{}, len(core.Participants))
	totalIdentities := 0
	for _, participant := range core.Participants {
		if participant.Person.ID <= 0 ||
			len(participant.PositionKeys) == 0 ||
			participant.Metrics.WorkCount < 1 ||
			participant.Metrics.RatedWorkCount < 0 {
			return fieldError("")
		}
		if _, duplicate := seen[participant.Person.ID]; duplicate {
			return fieldError("")
		}
		seen[participant.Person.ID] = struct{}{}
		totalIdentities += len(participant.PositionKeys)
	}
	if totalIdentities > 20 {
		return fieldError("")
	}
	if core.Scope == "global" {
		if core.Summary.GlobalRatedWorkCount != nil ||
			core.Summary.GlobalAverage != nil ||
			core.Summary.Highest != nil ||
			core.Summary.Lowest != nil ||
			core.Tags.Personal != nil ||
			core.Preference != nil {
			return fieldError("")
		}
		for _, dataset := range core.Ratings {
			if dataset.Personal != nil {
				return fieldError("")
			}
		}
	} else {
		if core.Summary.GlobalRatedWorkCount == nil ||
			core.Tags.Personal == nil ||
			core.Preference == nil {
			return fieldError("")
		}
		for _, dataset := range core.Ratings {
			if dataset.Personal == nil {
				return fieldError("")
			}
		}
	}
	if core.Summary.CommonWorkCount == 0 && len(core.Ratings) != 0 {
		return fieldError("")
	}
	if core.Summary.CommonWorkCount != 0 &&
		len(core.Ratings) != len(core.Participants)+1 {
		return fieldError("")
	}
	expectedPairs := 0
	if core.Kind == "group" {
		expectedPairs = len(core.Participants) * (len(core.Participants) - 1) / 2
	}
	if len(core.Matrix) != expectedPairs {
		return fieldError("")
	}
	if err := validateMatrixOrder(core); err != nil {
		return fieldError("")
	}
	return nil
}

func validateWork(value WorkItem, participants []ParticipantCore) error {
	var values []WorkParticipant
	switch {
	case value.Kind == "subject" && value.Subject != nil && value.Series == nil:
		if value.Subject.Key == "" || value.Subject.Subject.ID <= 0 {
			return fieldError("")
		}
		values = value.Subject.Participants
	case value.Kind == "series" && value.Series != nil && value.Subject == nil:
		if value.Series.Key == "" || value.Series.SeriesID <= 0 ||
			value.Series.MatchedWorkCount < 1 ||
			value.Series.MemberCount != len(value.Series.Members) ||
			value.Series.MatchedWorkCount > value.Series.MemberCount {
			return fieldError("")
		}
		values = value.Series.Participants
	default:
		return fieldError("")
	}
	if len(values) != len(participants) {
		return fieldError("")
	}
	for index, participant := range values {
		if participant.PersonID != participants[index].Person.ID ||
			len(participant.Credits) == 0 {
			return fieldError("")
		}
		if value.Kind == "subject" && participant.WorkCount != nil {
			return fieldError("")
		}
		if value.Kind == "series" &&
			(participant.WorkCount == nil || *participant.WorkCount < 1) {
			return fieldError("")
		}
	}
	return nil
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
		(value.NameCN != nil &&
			strings.Contains(normalizeSearch(*value.NameCN), search))
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

func checkedPageStart(page int64, pageSize, total int) int {
	offset := page - 1
	if offset < 0 || pageSize <= 0 ||
		offset > int64(math.MaxInt)/int64(pageSize) {
		return total
	}
	start := offset * int64(pageSize)
	if start >= int64(total) {
		return total
	}
	return int(start)
}

func matrixPairIDs(values []ParticipantCore) [][2]int64 {
	result := make([][2]int64, 0, len(values)*(len(values)-1)/2)
	for left := 0; left < len(values); left++ {
		for right := left + 1; right < len(values); right++ {
			result = append(result, [2]int64{
				values[left].Person.ID,
				values[right].Person.ID,
			})
		}
	}
	return result
}

func validateMatrixOrder(core Core) error {
	if core.Kind == "pair" {
		if len(core.Matrix) != 0 {
			return errors.New("costar: pair contains matrix")
		}
		return nil
	}
	expected := matrixPairIDs(core.Participants)
	if len(expected) != len(core.Matrix) {
		return errors.New("costar: matrix length mismatch")
	}
	for index, pair := range expected {
		if core.Matrix[index].LeftPersonID != pair[0] ||
			core.Matrix[index].RightPersonID != pair[1] {
			return errors.New("costar: matrix order mismatch")
		}
	}
	return nil
}

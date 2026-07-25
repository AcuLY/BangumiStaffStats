package persondetail

import (
	"context"
	"encoding/json"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestNormalizeViewEnforcesScopeSectionCapabilities(t *testing.T) {
	view, err := NormalizeView("global", statistics.UnitSubject, false, nil)
	if err != nil {
		t.Fatal(err)
	}
	if view.Section != SectionWorks ||
		view.Sort != SortGlobalScore ||
		view.Order != OrderDescending ||
		view.Page != 1 ||
		view.PageSize != 10 {
		t.Fatalf("defaults = %+v", view)
	}

	characters := SectionCharacters
	_, err = NormalizeView("global", statistics.UnitSubject, false, &ViewInput{
		Section: &characters,
	})
	assertFailure(t, err, CodeCapabilityNotAvailable, "/view/section")

	personalSort := SortPersonalScore
	_, err = NormalizeView("global", statistics.UnitSubject, true, &ViewInput{
		Sort: &personalSort,
	})
	assertFailure(t, err, CodeFieldInvalid, "/view/sort")

	seriesSort := SortSeriesSize
	_, err = NormalizeView("personal", statistics.UnitSubject, true, &ViewInput{
		Sort: &seriesSort,
	})
	assertFailure(t, err, CodeFieldInvalid, "/view/sort")

	workSort := SortGlobalScore
	_, err = NormalizeView("personal", statistics.UnitSeries, true, &ViewInput{
		Section: &characters,
		Sort:    &workSort,
	})
	assertFailure(t, err, CodeFieldInvalid, "/view/sort")
}

func TestProjectWorksUsesMissingLastSearchAndCheckedPagination(t *testing.T) {
	core, err := Build(context.Background(), detailBuildRequest(t, true, false))
	if err != nil {
		t.Fatal(err)
	}
	core.Works[0].Subject.GlobalScore = nil
	before, err := json.Marshal(core)
	if err != nil {
		t.Fatal(err)
	}
	projected, err := Project(context.Background(), core, View{
		Section:  SectionWorks,
		Sort:     SortGlobalScore,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(projected.Works) != 2 ||
		projected.Works[0].Subject.Subject.ID != 102 ||
		projected.Works[1].Subject.Subject.ID != 101 {
		t.Fatalf("missing-last works = %+v", projected.Works)
	}
	if projected.Core.Works != nil || projected.Core.Characters != nil {
		t.Fatal("projection leaked complete section arrays")
	}
	after, err := json.Marshal(core)
	if err != nil {
		t.Fatal(err)
	}
	if string(before) != string(after) {
		t.Fatal("projection mutated complete core")
	}

	projected, err = Project(context.Background(), core, View{
		Section:  SectionWorks,
		Search:   "甲作",
		Sort:     SortGlobalScore,
		Order:    OrderAscending,
		Page:     maxJSONSafeInteger,
		PageSize: 20,
	})
	if err != nil {
		t.Fatal(err)
	}
	if projected.Pagination.Total != 1 || len(projected.Works) != 0 {
		t.Fatalf("out-of-range page = %+v", projected)
	}
}

func TestProjectSeriesSearchesEveryCompleteMember(t *testing.T) {
	core, err := Build(context.Background(), detailBuildRequest(t, true, true))
	if err != nil {
		t.Fatal(err)
	}
	projected, err := Project(context.Background(), core, View{
		Section:  SectionWorks,
		Search:   "丙作",
		Sort:     SortSeriesSize,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 5,
	})
	if err != nil {
		t.Fatal(err)
	}
	if projected.Pagination.Total != 1 ||
		len(projected.Works) != 1 ||
		projected.Works[0].Series == nil {
		t.Fatalf("series member search = %+v", projected)
	}
}

func TestProjectCharactersUsesOwnNameAndStrictTotalOrder(t *testing.T) {
	core, err := Build(context.Background(), detailBuildRequest(t, false, false))
	if err != nil {
		t.Fatal(err)
	}
	projected, err := Project(context.Background(), core, View{
		Section:  SectionCharacters,
		Search:   "配角",
		Sort:     SortRole,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatal(err)
	}
	if projected.Pagination.Total != 1 ||
		!slices.Equal(
			[]string{projected.Characters[0].Character.Key},
			[]string{"character:502"},
		) {
		t.Fatalf("character projection = %+v", projected)
	}
}

func assertFailure(t *testing.T, err error, code Code, path string) {
	t.Helper()
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != code || failure.Path() != path {
		t.Fatalf("failure = %#v, want code=%s path=%s", err, code, path)
	}
}

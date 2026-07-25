package candidates

import (
	"context"
	"errors"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestNormalizeViewDefaultsAndScopeSpecificSorts(t *testing.T) {
	global, err := NormalizeView("global", nil)
	if err != nil {
		t.Fatalf("global defaults: %v", err)
	}
	if global != (View{
		Sort:     SortCount,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	}) {
		t.Fatalf("global defaults = %+v", global)
	}
	globalAverage := SortGlobalAverage
	_, err = NormalizeView("global", &ViewInput{Sort: &globalAverage})
	if code, ok := ErrorCode(err); !ok || code != CodeFieldInvalid {
		t.Fatalf("global globalAverage = %v, code=%q, ok=%v", err, code, ok)
	}
	if _, err := NormalizeView("personal", &ViewInput{Sort: &globalAverage}); err != nil {
		t.Fatalf("personal globalAverage: %v", err)
	}
}

func TestNormalizeOperationCapabilities(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:2"},
	}
	operation, err := NormalizeOperation(effective, OperationInput{
		PositionKey: "staff:anime:2",
	})
	if err != nil || operation.PositionKey != "staff:anime:2" {
		t.Fatalf("valid operation = %+v, %v", operation, err)
	}
	_, err = NormalizeOperation(effective, OperationInput{
		PositionKey: "staff:anime:74",
	})
	var candidateError *Error
	if !errors.As(err, &candidateError) ||
		candidateError.Path() != "/input/positionKey" {
		t.Fatalf("unknown position = %v", err)
	}
	_, err = NormalizeOperation(effective, OperationInput{
		PositionKey:       "staff:anime:2",
		RefreshCollection: true,
	})
	if !errors.As(err, &candidateError) ||
		candidateError.Path() != "/refreshCollection" {
		t.Fatalf("global refresh = %v", err)
	}
	globalAverage := SortGlobalAverage
	_, err = NormalizeOperation(effective, OperationInput{
		PositionKey: "staff:anime:2",
		View:        &ViewInput{Sort: &globalAverage},
	})
	if !errors.As(err, &candidateError) ||
		candidateError.Path() != "/view/sort" {
		t.Fatalf("global sort = %v", err)
	}

	effective.Scope = "personal"
	if _, err := NormalizeOperation(effective, OperationInput{
		PositionKey:       "staff:anime:2",
		View:              &ViewInput{Sort: &globalAverage},
		RefreshCollection: true,
	}); err != nil {
		t.Fatalf("personal capabilities: %v", err)
	}
}

func TestProjectRanksBeforeSearchAndKeepsMissingLast(t *testing.T) {
	core := Core{
		Scope:       "global",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       8,
		}},
	}
	for id := int64(1); id <= 8; id++ {
		name := "Other"
		if id == 2 || id == 8 {
			name = "Match"
		}
		average := int64(1000 - id)
		core.Rows = append(core.Rows, Row{
			Person:           PersonReference{ID: id, Name: name},
			WorkCount:        int(9 - id),
			GlobalAverage:    &average,
			GlobalRatedCount: 1,
		})
	}
	view, err := NormalizeView("global", &ViewInput{
		Search: pointer("match"),
	})
	if err != nil {
		t.Fatalf("NormalizeView: %v", err)
	}
	page, err := Project(context.Background(), core, view)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if page.Total != 2 ||
		!slices.Equal(
			[]int{page.Items[0].Rank, page.Items[1].Rank},
			[]int{2, 8},
		) {
		t.Fatalf("rank-gap page = %+v", page)
	}
	if page.PositionCounts[0].Count != 8 {
		t.Fatalf("position count changed: %+v", page.PositionCounts)
	}

	missingCore := Core{
		Scope:       "global",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       3,
		}},
		Rows: []Row{
			{
				Person:           PersonReference{ID: 1, Name: "High"},
				WorkCount:        1,
				GlobalAverage:    pointer(int64(900)),
				GlobalRatedCount: 1,
			},
			{
				Person:           PersonReference{ID: 2, Name: "Low"},
				WorkCount:        1,
				GlobalAverage:    pointer(int64(500)),
				GlobalRatedCount: 1,
			},
			{
				Person:    PersonReference{ID: 3, Name: "Missing"},
				WorkCount: 9,
			},
		},
	}
	sortAverage := SortAverage
	orderAscending := OrderAscending
	view, err = NormalizeView("global", &ViewInput{
		Sort:  &sortAverage,
		Order: &orderAscending,
	})
	if err != nil {
		t.Fatalf("NormalizeView average: %v", err)
	}
	page, err = Project(context.Background(), missingCore, view)
	if err != nil {
		t.Fatalf("Project average: %v", err)
	}
	if !slices.Equal(
		[]int64{
			page.Items[0].Person.ID,
			page.Items[1].Person.ID,
			page.Items[2].Person.ID,
		},
		[]int64{2, 1, 3},
	) {
		t.Fatalf("missing-last order = %+v", page.Items)
	}
}

func TestProjectSearchUsesPinnedUnicodeNormalization(t *testing.T) {
	nameCN := "动画监督"
	core := Core{
		Scope:       "global",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       3,
		}},
		Rows: []Row{
			{
				Person: PersonReference{
					ID:     1,
					Name:   "Director",
					NameCN: &nameCN,
				},
				WorkCount: 3,
			},
			{
				Person:    PersonReference{ID: 2, Name: "Anime"},
				WorkCount: 2,
			},
			{
				Person:    PersonReference{ID: 3, Name: "Straße"},
				WorkCount: 1,
			},
		},
	}
	testCases := []struct {
		name   string
		search string
		wantID int64
	}{
		{
			name:   "Chinese name with pinned boundary whitespace",
			search: "\u3000动画\u3000",
			wantID: 1,
		},
		{
			name:   "NFKC compatibility characters",
			search: "ＡＮＩＭＥ",
			wantID: 2,
		},
		{
			name:   "full Unicode case fold",
			search: "STRASSE",
			wantID: 3,
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			view, err := NormalizeView("global", &ViewInput{
				Search: &testCase.search,
			})
			if err != nil {
				t.Fatalf("NormalizeView: %v", err)
			}
			page, err := Project(context.Background(), core, view)
			if err != nil {
				t.Fatalf("Project: %v", err)
			}
			if page.Total != 1 ||
				len(page.Items) != 1 ||
				page.Items[0].Person.ID != testCase.wantID {
				t.Fatalf("search result = %+v", page)
			}
		})
	}
}

func TestProjectPersonalAverageAndGlobalAverageAreDistinct(t *testing.T) {
	core := Core{
		Scope:       "personal",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       2,
		}},
		Rows: []Row{
			{
				Person:             PersonReference{ID: 1, Name: "One"},
				WorkCount:          1,
				GlobalAverage:      pointer(int64(900)),
				GlobalRatedCount:   1,
				PersonalAverage:    pointer(int64(500)),
				PersonalRatedCount: 1,
			},
			{
				Person:             PersonReference{ID: 2, Name: "Two"},
				WorkCount:          1,
				GlobalAverage:      pointer(int64(500)),
				GlobalRatedCount:   1,
				PersonalAverage:    pointer(int64(900)),
				PersonalRatedCount: 1,
			},
		},
	}
	personalSort := SortAverage
	view, err := NormalizeView("personal", &ViewInput{Sort: &personalSort})
	if err != nil {
		t.Fatalf("personal view: %v", err)
	}
	page, err := Project(context.Background(), core, view)
	if err != nil {
		t.Fatalf("personal Project: %v", err)
	}
	if page.Items[0].Person.ID != 2 {
		t.Fatalf("personal average first = %d", page.Items[0].Person.ID)
	}

	globalSort := SortGlobalAverage
	view, err = NormalizeView("personal", &ViewInput{Sort: &globalSort})
	if err != nil {
		t.Fatalf("global-average view: %v", err)
	}
	page, err = Project(context.Background(), core, view)
	if err != nil {
		t.Fatalf("global-average Project: %v", err)
	}
	if page.Items[0].Person.ID != 1 {
		t.Fatalf("global average first = %d", page.Items[0].Person.ID)
	}
}

func TestProjectCheckedOutOfRangePageAndCancellation(t *testing.T) {
	core := Core{
		Scope:       "global",
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		PositionCounts: []PositionCount{{
			PositionKey: "staff:anime:2",
			Count:       1,
		}},
		Rows: []Row{{
			Person:    PersonReference{ID: 1, Name: "One"},
			WorkCount: 1,
		}},
	}
	maxPage := maxJSONSafeInteger
	view, err := NormalizeView("global", &ViewInput{Page: &maxPage})
	if err != nil {
		t.Fatalf("NormalizeView: %v", err)
	}
	page, err := Project(context.Background(), core, view)
	if err != nil || page.Total != 1 || len(page.Items) != 0 {
		t.Fatalf("out-of-range page = %+v, %v", page, err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = Project(ctx, core, view)
	if code, ok := ErrorCode(err); !ok || code != CodeCanceled ||
		!errors.Is(err, context.Canceled) {
		t.Fatalf("cancellation = %v, code=%q, ok=%v", err, code, ok)
	}
}

func pointer[T any](value T) *T {
	return &value
}

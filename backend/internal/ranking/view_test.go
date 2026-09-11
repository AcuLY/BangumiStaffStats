package ranking

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestLocationUsesFullRankAndSearchedPageWithoutMovingPage(t *testing.T) {
	value := core{Scope: "global", Rows: make([]rowCore, 12)}
	for index := range value.Rows {
		value.Rows[index] = rowCore{
			Person:     PersonReference{ID: int64(index + 1), Name: fmt.Sprintf("Person %d", index+1)},
			WorkCount:  12 - index,
			SearchName: "person",
		}
		if index >= 5 {
			value.Rows[index].SearchName = "selected"
		}
	}
	for _, test := range []struct {
		name, search string
		id           int64
		rank         int
		page         int64
	}{
		{"off page", "", 8, 8, 2},
		{"search changes page only", "selected", 8, 8, 1},
		{"search excludes ranked person", "person", 8, 8, 0},
		{"not in ranking", "", 99, 0, 0},
	} {
		t.Run(test.name, func(t *testing.T) {
			view := View{Search: test.search, Sort: "count", Order: statistics.Descending, Page: 3, PageSize: 5, LocatePersonID: &test.id}
			result, err := project(context.Background(), value, view, nil)
			if err != nil {
				t.Fatal(err)
			}
			if result.pagination.Page != 3 || result.location == nil || result.location.PersonID != test.id {
				t.Fatalf("location or requested page changed: %+v", result)
			}
			location := result.location
			if test.rank == 0 {
				if location.Rank != nil {
					t.Fatal("unranked person has a rank")
				}
			} else if location.Rank == nil || *location.Rank != test.rank {
				t.Fatalf("rank = %+v", location)
			}
			if test.page == 0 {
				if location.Page != nil {
					t.Fatal("excluded person has a page")
				}
			} else if location.Page == nil || *location.Page != test.page {
				t.Fatalf("page = %+v", location)
			}
			data, err := result.MarshalEnvelope("request")
			if err != nil || !json.Valid(data) {
				t.Fatalf("envelope: %s, %v", data, err)
			}
		})
	}
}

func TestLocationViewRequiresSafePositivePersonID(t *testing.T) {
	for _, raw := range []string{`null`, `0`, `-1`, `1.5`, `9007199254740992`, `"8"`, `true`} {
		if _, err := normalizeView(json.RawMessage(`{"locatePersonId":`+raw+`}`), "global"); err == nil {
			t.Fatalf("accepted %s", raw)
		}
	}
	view, err := normalizeView(json.RawMessage(`{"locatePersonId":8e0}`), "global")
	if err != nil || view.LocatePersonID == nil || *view.LocatePersonID != 8 {
		t.Fatalf("safe integer rejected: %+v, %v", view, err)
	}
}

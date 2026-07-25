package partners

import (
	"context"
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestProjectKeepsCompleteLeadersAndRanksBeforeSearch(t *testing.T) {
	core := partnerViewCore("global")
	for id := int64(1); id <= 8; id++ {
		name := "Other"
		if id == 2 || id == 8 {
			name = "Match"
		}
		average := int64(900 - id)
		overall := int64(700 + id)
		core.Partners = append(core.Partners, PartnerCore{
			Person:       PersonReference{ID: id + 1, Name: name},
			PositionKeys: []string{"staff:anime:2"},
			Metrics: Metrics{
				WorkCount:      int(9 - id),
				RatedWorkCount: 1,
				Average:        &average,
				Overall:        &overall,
			},
		})
	}
	view, err := parseView(
		json.RawMessage(`{"search":"match","sort":"count","pageSize":5}`),
		"global",
	)
	if err != nil {
		t.Fatalf("parseView: %v", err)
	}
	page, err := Project(context.Background(), core, view)
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if page.Summary.PartnerCount != 8 || page.Total != 2 ||
		!slices.Equal([]int{page.Items[0].Rank, page.Items[1].Rank}, []int{2, 8}) {
		t.Fatalf("rank-gap page = %+v", page)
	}
	if len(page.Summary.Leaders) != 3 ||
		page.Summary.Leaders[2].Metric != SortOverall ||
		page.Summary.Leaders[2].Item == nil ||
		page.Summary.Leaders[2].Item.Person.ID != 9 {
		t.Fatalf("complete leaders = %+v", page.Summary.Leaders)
	}
}

func TestProjectMissingMetricsStayLastForBothDirections(t *testing.T) {
	core := partnerViewCore("global")
	high, low := int64(900), int64(500)
	core.Partners = []PartnerCore{
		partnerForView(2, "High", 1, &high, &high),
		partnerForView(3, "Low", 1, &low, &low),
		partnerForView(4, "Missing", 9, nil, nil),
	}
	for _, direction := range []statistics.Direction{
		statistics.Ascending,
		statistics.Descending,
	} {
		page, err := Project(context.Background(), core, View{
			Sort:     SortAverage,
			Order:    direction,
			Page:     1,
			PageSize: 10,
		})
		if err != nil {
			t.Fatalf("%s: %v", direction, err)
		}
		if page.Items[len(page.Items)-1].Person.ID != 4 {
			t.Fatalf("%s missing-last = %+v", direction, page.Items)
		}
	}
}

func TestMarshalEnvelopeScopeSafetyAndZeroEvidence(t *testing.T) {
	global := partnerViewCore("global")
	global.Partners = []PartnerCore{partnerForView(2, "Partner", 1, nil, nil)}
	page, err := Project(context.Background(), global, View{
		Sort: SortCount, Order: statistics.Descending, Page: 1, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("global Project: %v", err)
	}
	projection, err := NewProjection(page, testDataVersion, "global", nil)
	if err != nil {
		t.Fatalf("global NewProjection: %v", err)
	}
	data, err := projection.MarshalEnvelope("req-global")
	if err != nil {
		t.Fatalf("global MarshalEnvelope: %v", err)
	}
	if strings.Contains(string(data), `"preference"`) ||
		strings.Contains(string(data), `"collection"`) {
		t.Fatalf("global leaked personal members: %s", data)
	}

	personal := partnerViewCore("personal")
	personal.Partners = []PartnerCore{{
		Person:       PersonReference{ID: 2, Name: "Partner"},
		PositionKeys: []string{"staff:anime:2"},
		Metrics:      Metrics{WorkCount: 1},
		Preference: &Preference{
			EvidenceWeight: statistics.Rational{Numerator: "0", Denominator: "1"},
		},
	}}
	page, err = Project(context.Background(), personal, View{
		Sort: SortPreference, Order: statistics.Descending, Page: 1, PageSize: 10,
	})
	if err != nil {
		t.Fatalf("personal Project: %v", err)
	}
	if page.Summary.Leaders[3].Item != nil {
		t.Fatalf("zero evidence preference leader = %+v", page.Summary.Leaders[3])
	}
	projection, err = NewProjection(page, testDataVersion, "personal", &CollectionFreshness{
		FetchedAt:    time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC),
		WarningCodes: []string{},
	})
	if err != nil {
		t.Fatalf("personal NewProjection: %v", err)
	}
	data, err = projection.MarshalEnvelope("req-personal")
	if err != nil {
		t.Fatalf("personal MarshalEnvelope: %v", err)
	}
	for _, expected := range []string{
		`"preference":{"comparableCount":0`,
		`"mean":null`,
		`"evidenceWeight":{"numerator":"0","denominator":"1"}`,
		`"score":null`,
		`"collection":`,
	} {
		if !strings.Contains(string(data), expected) {
			t.Fatalf("missing %s in %s", expected, data)
		}
	}
}

func partnerViewCore(scope string) Core {
	return Core{
		DataVersion: testDataVersion,
		QueryDigest: testQueryDigest,
		Scope:       scope,
		WorkUnit:    statistics.UnitSubject,
		Source: SourceCore{
			Person:       PersonReference{ID: 1, Name: "Source"},
			PositionKeys: []string{"staff:anime:3"},
			Metrics:      SourceMetrics{WorkCount: 3},
		},
	}
}

func partnerForView(
	id int64,
	name string,
	count int,
	average *int64,
	overall *int64,
) PartnerCore {
	return PartnerCore{
		Person:       PersonReference{ID: id, Name: name},
		PositionKeys: []string{"staff:anime:2"},
		Metrics: Metrics{
			WorkCount:      count,
			RatedWorkCount: boolCount(average != nil),
			Average:        cloneInt64(average),
			Overall:        cloneInt64(overall),
		},
	}
}

func boolCount(value bool) int {
	if value {
		return 1
	}
	return 0
}

package partners

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
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

func TestProjectMetricScaleIsStableAcrossSearchPageSizeAndOrder(t *testing.T) {
	core := partnerViewCore("personal")
	average := int64(800)
	for id := int64(2); id <= 9; id++ {
		partner := partnerForView(id, "Visible", int(10-id), &average, &average)
		score := statistics.Rational{Numerator: "1", Denominator: "5"}
		if id == 9 {
			partner.Person.Name = "Hidden negative maximum"
			score.Numerator = "-4"
		}
		partner.Preference = &Preference{Score: &score, EvidenceWeight: statistics.Rational{Numerator: "1", Denominator: "6"}}
		core.Partners = append(core.Partners, partner)
	}
	want := statistics.MetricScale{Metric: "preference", Kind: "linear", Max: statistics.Rational{Numerator: "4", Denominator: "5"}}
	for _, view := range []View{
		{Sort: SortPreference, Order: statistics.Descending, Page: 1, PageSize: 5},
		{Sort: SortPreference, Order: statistics.Descending, Page: 2, PageSize: 5},
		{Search: "Visible", Sort: SortPreference, Order: statistics.Descending, Page: 1, PageSize: 10},
		{Search: "Nobody", Sort: SortPreference, Order: statistics.Ascending, Page: 5, PageSize: 20},
	} {
		page, err := Project(context.Background(), core, view)
		if err != nil || !reflect.DeepEqual(page.MetricScale, want) {
			t.Fatalf("view %+v: scale %#v, error %v", view, page.MetricScale, err)
		}
		if page.Summary.Leaders[3].Item == nil || page.Summary.Leaders[3].Item.Preference.Score.Numerator != "1" {
			t.Fatal("absolute scale replaced the signed preference leader")
		}
		page.MetricScale.Max = statistics.Rational{Numerator: "99", Denominator: "1"}
	}
	if core.Partners[7].Preference.Score.Numerator != "-4" {
		t.Fatal("projection mutated the core preference")
	}
}

func TestProjectMetricScaleDistinguishesZeroMissingAndFilteredPopulations(t *testing.T) {
	request := partnerBuildRequest(t, "global")
	request.Query.EffectiveQuery.MergeSeries = false
	request.Series = nil
	request.Query.PositionResults[0].CandidateSubjectIDs = []int64{101, 102}
	request.Query.PositionResults[0].Contributions = append(request.Query.PositionResults[0].Contributions, query.Contribution{
		PositionKey: "staffset:anime:creative", MemberPositionKey: "staff:anime:3", Kind: "staff", SubjectID: 102, PersonID: 1, PositionID: 3,
	})
	request.Query.PositionResults[1].Contributions = append(request.Query.PositionResults[1].Contributions, query.Contribution{
		PositionKey: "staff:anime:2", Kind: "staff", SubjectID: 101, PersonID: 3, PositionID: 2,
	})
	castKey := "cast:anime:main"
	for index, candidateKey := range []*string{nil, &castKey} {
		request.Input.CandidatePositionKey = candidateKey
		core, err := Build(context.Background(), request)
		if err != nil {
			t.Fatal(err)
		}
		page, err := Project(context.Background(), core, View{Sort: SortCount, Order: statistics.Descending, Page: 1, PageSize: 5})
		if err != nil || page.MetricScale.Max != int64(2-index) {
			t.Fatalf("filtered count scale = %+v, error %v", page.MetricScale, err)
		}
	}
	core := partnerViewCore("personal")
	partner := partnerForView(2, "Partner", 1, nil, nil)
	partner.Preference = &Preference{EvidenceWeight: statistics.Rational{Numerator: "0", Denominator: "1"}}
	core.Partners = []PartnerCore{partner}
	for _, metric := range []Sort{SortAverage, SortOverall, SortPreference} {
		page, err := Project(context.Background(), core, View{Sort: metric, Order: statistics.Descending, Page: 1, PageSize: 5})
		if err != nil || page.MetricScale.Max != nil {
			t.Fatalf("missing %s scale = %+v, error %v", metric, page.MetricScale, err)
		}
	}
	zero := statistics.Rational{Numerator: "0", Denominator: "1"}
	core.Partners[0].Preference.Score = &zero
	page, err := Project(context.Background(), core, View{Sort: SortPreference, Order: statistics.Descending, Page: 1, PageSize: 5})
	if err != nil || page.MetricScale.Max != zero {
		t.Fatalf("zero scale = %+v, error %v", page.MetricScale, err)
	}
	core.Partners = nil
	page, err = Project(context.Background(), core, View{Sort: SortCount, Order: statistics.Descending, Page: 1, PageSize: 5})
	if err != nil || page.MetricScale.Max != nil {
		t.Fatalf("empty count scale = %+v, error %v", page.MetricScale, err)
	}
}

func TestProjectMetricScaleMatchesSharedCompletePopulationGoldens(t *testing.T) {
	for _, filename := range []string{"global.json", "personal.json", "many-identities.json"} {
		data, err := os.ReadFile(filepath.Join("..", "..", "..", "contracts", "goldens", "api", "partners", "cases", filename))
		if err != nil {
			t.Fatal(err)
		}
		var corpus struct {
			Cases []struct {
				ID      string `json:"id"`
				Request struct {
					Query struct {
						Scope string `json:"scope"`
					} `json:"query"`
					View json.RawMessage `json:"view"`
				} `json:"request"`
				Expected struct {
					Body struct {
						Data struct {
							WorkUnit    statistics.UnitKind `json:"workUnit"`
							Source      SourceCore          `json:"source"`
							MetricScale json.RawMessage     `json:"metricScale"`
						} `json:"data"`
					} `json:"body"`
				} `json:"expected"`
				Assertions struct {
					Population []PartnerCore `json:"metricScalePopulation"`
				} `json:"assertions"`
			} `json:"cases"`
		}
		if err := json.Unmarshal(data, &corpus); err != nil {
			t.Fatal(err)
		}
		for _, test := range corpus.Cases {
			t.Run(test.ID, func(t *testing.T) {
				if test.Assertions.Population == nil {
					t.Fatal("complete population evidence is missing")
				}
				core := partnerViewCore(test.Request.Query.Scope)
				core.Source = test.Expected.Body.Data.Source
				core.WorkUnit = test.Expected.Body.Data.WorkUnit
				core.Partners = test.Assertions.Population
				view, err := parseView(test.Request.View, core.Scope)
				if err != nil {
					t.Fatal(err)
				}
				page, err := Project(context.Background(), core, view)
				if err != nil {
					t.Fatal(err)
				}
				actual, err := json.Marshal(page.MetricScale)
				if err != nil {
					t.Fatal(err)
				}
				var got, want any
				if err := json.Unmarshal(actual, &got); err != nil {
					t.Fatal(err)
				}
				if err := json.Unmarshal(test.Expected.Body.Data.MetricScale, &want); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("complete-set scale = %s, want %s", actual, test.Expected.Body.Data.MetricScale)
				}
			})
		}
	}
}

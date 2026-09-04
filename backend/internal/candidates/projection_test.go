package candidates

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestMarshalEnvelopeUsesExactPositionCountWireKeys(t *testing.T) {
	page := Page{
		PositionCounts: []PositionCount{
			{PositionKey: "staff:anime:2", Count: 2},
			{PositionKey: "staff:anime:74", Count: 1},
		},
		PositionKey: "staff:anime:2",
		WorkUnit:    statistics.UnitSubject,
		Items:       []Item{},
		Page:        1,
		PageSize:    10,
		Total:       0,
	}

	for _, testCase := range []struct {
		name       string
		scope      string
		collection *CollectionFreshness
	}{
		{name: "global", scope: "global"},
		{
			name:  "personal",
			scope: "personal",
			collection: &CollectionFreshness{
				FetchedAt:    time.Date(2026, 8, 27, 0, 0, 0, 0, time.UTC),
				WarningCodes: []string{},
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			projection, err := NewProjection(
				page,
				"dv1-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				testCase.scope,
				testCase.collection,
			)
			if err != nil {
				t.Fatalf("NewProjection: %v", err)
			}
			data, err := projection.MarshalEnvelope("req-position-count-keys")
			if err != nil {
				t.Fatalf("MarshalEnvelope: %v", err)
			}
			if strings.Contains(string(data), `"PositionKey"`) ||
				strings.Contains(string(data), `"Count"`) {
				t.Fatalf("upper-camel position count keys leaked: %s", data)
			}

			var envelope struct {
				Data struct {
					Summary struct {
						PositionCounts []map[string]json.RawMessage `json:"positionCounts"`
					} `json:"summary"`
				} `json:"data"`
			}
			if err := json.Unmarshal(data, &envelope); err != nil {
				t.Fatalf("decode raw envelope: %v", err)
			}
			if len(envelope.Data.Summary.PositionCounts) != 2 {
				t.Fatalf("position counts = %#v", envelope.Data.Summary.PositionCounts)
			}
			for index, want := range page.PositionCounts {
				entry := envelope.Data.Summary.PositionCounts[index]
				if len(entry) != 2 || entry["positionKey"] == nil || entry["count"] == nil {
					t.Fatalf("position count keys = %#v", entry)
				}
				var gotPositionKey string
				var gotCount int
				if err := json.Unmarshal(entry["positionKey"], &gotPositionKey); err != nil {
					t.Fatalf("decode positionKey: %v", err)
				}
				if err := json.Unmarshal(entry["count"], &gotCount); err != nil {
					t.Fatalf("decode count: %v", err)
				}
				if gotPositionKey != want.PositionKey || gotCount != want.Count {
					t.Fatalf(
						"position count = %q/%d, want %q/%d",
						gotPositionKey,
						gotCount,
						want.PositionKey,
						want.Count,
					)
				}
			}
		})
	}
}

func TestMarshalEnvelopeRepresentsAllPositionModeAndItemIdentities(t *testing.T) {
	page := Page{
		PositionCounts: []PositionCount{{PositionKey: "staff:anime:2", Count: 1}},
		PositionKey:    "",
		WorkUnit:       statistics.UnitSubject,
		Items: []Item{{
			Rank:         1,
			Person:       PersonReference{ID: 1, Name: "One"},
			PositionKeys: []string{"staff:anime:2"},
			WorkCount:    2,
		}},
		Page: 1, PageSize: 10, Total: 1,
	}
	projection, err := NewProjection(page, testDataVersion, "global", nil)
	if err != nil {
		t.Fatalf("NewProjection: %v", err)
	}
	data, err := projection.MarshalEnvelope("req-all")
	if err != nil {
		t.Fatalf("MarshalEnvelope: %v", err)
	}
	var envelope struct {
		Data struct {
			PositionKey *string `json:"positionKey"`
			Items       []struct {
				PositionKeys []string `json:"positionKeys"`
			} `json:"items"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if envelope.Data.PositionKey != nil ||
		len(envelope.Data.Items) != 1 ||
		!slices.Equal(envelope.Data.Items[0].PositionKeys, []string{"staff:anime:2"}) {
		t.Fatalf("all projection = %s", data)
	}
}

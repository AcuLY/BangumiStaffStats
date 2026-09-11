package persondetail

import (
	"context"
	"encoding/json"
	"testing"
)

func TestArchivePersonSummarySurvivesAllDetailViews(t *testing.T) {
	store := loadPersonDetailArchive(t)
	service := newPersonDetailService(t, store, nil)
	const want = "金标简介。\nLiteral <b>text</b> [b]text[/b] 😀"
	request := Request{
		Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`),
		Input: json.RawMessage(`{"personId":101}`),
	}
	for _, view := range []string{
		`{}`,
		`{"search":"金标","page":2,"pageSize":5}`,
		`{"sort":"globalScore","order":"asc","pageSize":5}`,
		`{"section":"characters","sort":"name"}`,
	} {
		t.Run(view, func(t *testing.T) {
			request.View = json.RawMessage(view)
			result, err := service.Execute(context.Background(), request)
			if err != nil {
				t.Fatal(err)
			}
			if result.Core.Person.Summary == nil || *result.Core.Person.Summary != want {
				t.Fatalf("Archive summary = %v", result.Core.Person.Summary)
			}
			encoded, err := result.MarshalEnvelope("summary-view-test")
			if err != nil {
				t.Fatal(err)
			}
			var envelope struct {
				Data struct {
					Person PersonProfile `json:"person"`
				} `json:"data"`
			}
			if err := json.Unmarshal(encoded, &envelope); err != nil {
				t.Fatal(err)
			}
			if envelope.Data.Person.Summary == nil || *envelope.Data.Person.Summary != want {
				t.Fatalf("wire biography = %v", envelope.Data.Person.Summary)
			}
			*result.Core.Person.Summary = "changed by caller"
		})
	}
	stats := service.results.Stats()
	if stats.Publications != 1 || stats.Hits != 3 {
		t.Fatalf("biography must use the existing complete-core cache: %+v", stats)
	}
}

func TestArchiveAbsentPersonSummaryIsOmitted(t *testing.T) {
	store := loadPersonDetailArchive(t)
	evidence, err := LoadArchiveEvidence(context.Background(), store, "anime", 100, nil)
	if err != nil {
		t.Fatal(err)
	}
	if evidence.Person.Summary != nil {
		t.Fatalf("absent Archive biography became %+v", evidence.Person.Summary)
	}
	service := newPersonDetailService(t, store, nil)
	result, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`),
		Input: json.RawMessage(`{"personId":100}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := result.MarshalEnvelope("absent-summary-test")
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Data struct {
			Person map[string]json.RawMessage `json:"person"`
		} `json:"data"`
	}
	if err := json.Unmarshal(encoded, &envelope); err != nil {
		t.Fatal(err)
	}
	if _, exists := envelope.Data.Person["summary"]; exists {
		t.Fatal("an absent Archive biography must omit the optional wire field")
	}
}

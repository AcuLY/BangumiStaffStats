package costar

import (
	"context"
	"encoding/json"
	"testing"
)

func TestProjectKeepsInvariantEvidenceAndOwnsPage(t *testing.T) {
	core, err := Build(context.Background(), pairBuildRequest(t, false))
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	if err := validateCore(core); err != nil {
		t.Fatalf("validateCore: %v core=%+v", err, core)
	}
	for _, work := range core.Works {
		if err := validateWork(work, core.Participants); err != nil {
			t.Fatalf("validateWork: %v work=%+v", err, work)
		}
	}
	projected, err := Project(context.Background(), core, View{
		Sort:     SortGlobalScore,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	if projected.Pagination.Total != 1 ||
		len(projected.Items) != 1 ||
		projected.Core.Works != nil ||
		projected.Core.Summary.CommonWorkCount != core.Summary.CommonWorkCount ||
		projected.Core.Summary.Average == core.Summary.Average ||
		*projected.Core.Summary.Average != *core.Summary.Average {
		t.Fatalf("projection = %+v", projected)
	}
	projected.Items[0].Subject.Subject.Name = "mutated"
	if core.Works[0].Subject.Subject.Name == "mutated" {
		t.Fatal("projected item aliases cached core")
	}
}

func TestMarshalPairGlobalStructurallyOmitsPersonalAndMatrix(t *testing.T) {
	core, err := Build(context.Background(), pairBuildRequest(t, false))
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	projected, err := Project(context.Background(), core, View{
		Sort:     SortGlobalScore,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	})
	if err != nil {
		t.Fatalf("Project: %v", err)
	}
	body, err := projected.MarshalEnvelope("req-1")
	if err != nil {
		t.Fatalf("MarshalEnvelope: %v", err)
	}
	var envelope map[string]any
	if err := json.Unmarshal(body, &envelope); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	data := envelope["data"].(map[string]any)
	if _, found := data["preference"]; found {
		t.Fatal("global preference leaked")
	}
	if _, found := data["matrix"]; found {
		t.Fatal("pair matrix leaked")
	}
	tags := data["tags"].(map[string]any)
	if _, found := tags["personal"]; found {
		t.Fatal("global personal tags leaked")
	}
}

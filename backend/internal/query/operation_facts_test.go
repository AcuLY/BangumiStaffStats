package query

import (
	"context"
	"fmt"
	"reflect"
	"testing"
)

func TestFactualOperationPlansDistinctPositions(t *testing.T) {
	facts := FactSet{
		Subjects:     []Subject{{SubjectID: 1, SubjectType: "anime"}, {SubjectID: 2, SubjectType: "book"}},
		StaffCredits: []StaffCredit{{1, 10, 2}, {1, 10, 2}, {1, 11, 2}, {1, 10, 10}, {1, 10, 999}, {2, 10, 998}, {3, 10, 997}, {1, 10, 0}, {1, 10, -1}},
		Plans:        []SelectionPlan{{PositionKey: "staff:anime:2", RuleKind: "exactStaff", PositionID: 2}},
	}
	originalCredits := append([]StaffCredit(nil), facts.StaffCredits...)
	originalPlans := append([]SelectionPlan(nil), facts.Plans...)
	got, err := factualOperationPlans(context.Background(), facts, "anime")
	if err != nil {
		t.Fatal(err)
	}
	want := []SelectionPlan{
		{PositionKey: "cast:anime:all", RuleKind: "exactCast", RoleTypes: []int64{1, 2, 3, 4, 5, 6}},
		{PositionKey: "staff:anime:10", RuleKind: "exactStaff", PositionID: 10},
		{PositionKey: "staff:anime:2", RuleKind: "exactStaff", PositionID: 2},
		{PositionKey: "staff:anime:999", RuleKind: "exactStaff", PositionID: 999},
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("plans = %+v, want %+v", got, want)
	}
	replaced := operationFactsWithPlans(facts, got)
	replaced.Plans[0].PositionKey = "changed"
	if !reflect.DeepEqual(facts.StaffCredits, originalCredits) || !reflect.DeepEqual(facts.Plans, originalPlans) {
		t.Fatal("input facts mutated")
	}
}

func repeatedPositionFacts(credits, positions int) FactSet {
	facts := FactSet{Subjects: []Subject{{SubjectID: 1, SubjectType: "anime"}}, StaffCredits: make([]StaffCredit, credits)}
	for i := range facts.StaffCredits {
		facts.StaffCredits[i] = StaffCredit{SubjectID: 1, PersonID: 10, PositionID: int64(999 + i%positions)}
	}
	return facts
}

func TestFactualOperationPlansDuplicateCreditAllocations(t *testing.T) {
	allocations := func(facts FactSet) float64 {
		return testing.AllocsPerRun(30, func() {
			plans, err := factualOperationPlans(context.Background(), facts, "anime")
			if err != nil || len(plans) != 2 {
				t.Fatalf("plans=%+v, err=%v", plans, err)
			}
		})
	}
	single := allocations(repeatedPositionFacts(1, 1))
	repeated := allocations(repeatedPositionFacts(4096, 1))
	t.Logf("allocs/run: one credit=%.0f, 4096 credits/one position=%.0f", single, repeated)
	// Allow small runtime noise, not per-credit identity formatting.
	if repeated > single+8 {
		t.Fatalf("duplicate-credit allocation growth: %.0f -> %.0f", single, repeated)
	}
}

func BenchmarkFactualOperationPlans(b *testing.B) {
	for _, shape := range []struct{ credits, positions int }{{1, 1}, {4096, 1}, {4096, 64}} {
		b.Run(fmt.Sprintf("credits=%d/positions=%d", shape.credits, shape.positions), func(b *testing.B) {
			facts := repeatedPositionFacts(shape.credits, shape.positions)
			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				plans, err := factualOperationPlans(context.Background(), facts, "anime")
				if err != nil || len(plans) != shape.positions+1 {
					b.Fatalf("plans=%d, err=%v", len(plans), err)
				}
			}
		})
	}
}

package statistics

import (
	"context"
	"reflect"
	"strings"
	"testing"
)

func TestBuildSeriesIndexTransitiveOrderAndCopies(t *testing.T) {
	date := func(value string) *string { return &value }
	index, err := BuildSeriesIndex(
		context.Background(),
		"dv1-"+strings.Repeat("a", 64),
		[]SeriesSubject{
			{SubjectID: 30, SubjectType: "anime"},
			{SubjectID: 10, SubjectType: "anime", AirDate: date("2021-01")},
			{SubjectID: 20, SubjectType: "anime", AirDate: date("2020-01")},
			{SubjectID: 40, SubjectType: "anime"},
		},
		[]Relation{
			{SourceID: 30, SourceType: "anime", TargetID: 20, TargetType: "anime", RelationID: 2},
			{SourceID: 20, SourceType: "anime", TargetID: 10, TargetType: "anime", RelationID: 3},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	component, ok := index.ComponentFor("anime", 30)
	if !ok {
		t.Fatal("component not found")
	}
	if component.SeriesID != 10 || component.RepresentativeID != 20 ||
		!reflect.DeepEqual(component.MemberIDs, []int64{20, 10, 30}) {
		t.Fatalf("component = %+v", component)
	}
	component.MemberIDs[0] = 999
	again, _ := index.ComponentFor("anime", 30)
	if again.MemberIDs[0] != 20 {
		t.Fatalf("caller mutated index: %+v", again)
	}
	if got := index.Components("anime"); len(got) != 2 || got[1].SeriesID != 40 {
		t.Fatalf("components = %+v", got)
	}
}

func TestSeriesRelationBoundary(t *testing.T) {
	for _, relationID := range []int64{2, 3, 4, 5, 6, 9, 10, 11, 12} {
		if !mergeRelation(relationID) {
			t.Fatalf("relation %d should merge", relationID)
		}
	}
	for _, relationID := range []int64{1, 7, 8, 14, 99} {
		if mergeRelation(relationID) {
			t.Fatalf("relation %d must not merge", relationID)
		}
	}
}

func TestBuildSeriesIndexDeterministicUnderShuffling(t *testing.T) {
	subjects := []SeriesSubject{
		{SubjectID: 10, SubjectType: "anime"},
		{SubjectID: 20, SubjectType: "anime"},
		{SubjectID: 30, SubjectType: "anime"},
	}
	relations := []Relation{
		{SourceID: 10, SourceType: "anime", TargetID: 20, TargetType: "anime", RelationID: 2},
		{SourceID: 20, SourceType: "anime", TargetID: 30, TargetType: "anime", RelationID: 3},
	}
	first, err := BuildSeriesIndex(context.Background(), "dv1-"+strings.Repeat("b", 64), subjects, relations)
	if err != nil {
		t.Fatal(err)
	}
	relations[0], relations[1] = relations[1], relations[0]
	second, err := BuildSeriesIndex(context.Background(), "dv1-"+strings.Repeat("b", 64), subjects, relations)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(first.Components("anime"), second.Components("anime")) {
		t.Fatalf("shuffled build differs: %+v vs %+v", first.Components("anime"), second.Components("anime"))
	}
}

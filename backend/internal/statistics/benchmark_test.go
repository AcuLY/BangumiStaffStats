package statistics

import (
	"context"
	"strings"
	"testing"
)

func BenchmarkEvaluateRatings(b *testing.B) {
	score := 8.2
	units := make([]RatingInput, 10_000)
	for index := range units {
		units[index] = RatingInput{UnitID: int64(index + 1), Score: &score}
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := EvaluateRatings(context.Background(), UnitSubject, units, nil); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkBuildSeriesIndex(b *testing.B) {
	subjects := make([]SeriesSubject, 10_000)
	relations := make([]Relation, 0, len(subjects)-1)
	for index := range subjects {
		subjects[index] = SeriesSubject{SubjectID: int64(index + 1), SubjectType: "anime"}
		if index != 0 {
			relations = append(relations, Relation{
				SourceID: int64(index), SourceType: "anime",
				TargetID: int64(index + 1), TargetType: "anime", RelationID: 2,
			})
		}
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := BuildSeriesIndex(context.Background(), "dv1-"+strings.Repeat("3", 64), subjects, relations); err != nil {
			b.Fatal(err)
		}
	}
}

func BenchmarkSortPeople(b *testing.B) {
	entries := make([]PersonSortEntry, 10_000)
	for index := range entries {
		average := int64((index * 37) % 1001)
		entries[index] = PersonSortEntry{
			PersonID: int64(index + 1), Count: index % 100,
			AverageHundredths: &average, ValidRatingCount: index % 50,
		}
	}
	b.ReportAllocs()
	for b.Loop() {
		if _, err := SortPeople(context.Background(), SortPersonAverage, Descending, entries); err != nil {
			b.Fatal(err)
		}
	}
}

package partners

import (
	"context"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestResultKeyContainsCanonicalInputAndExcludesView(t *testing.T) {
	input := Input{Source: SourceInput{
		PersonID:     1,
		PositionKeys: []string{"staff:anime:3", "cast:anime:main"},
	}}
	first, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	same, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("same: %v", err)
	}
	candidate := "staff:anime:2"
	otherInput := input
	otherInput.CandidatePositionKey = &candidate
	other, err := ResultKey("global", testDataVersion, testQueryDigest, otherInput, "")
	if err != nil {
		t.Fatalf("other: %v", err)
	}
	expected := runtimecache.DigestInput([]byte(
		`{"source":{"personId":1,"positionKeys":["staff:anime:3","cast:anime:main"]}}`,
	))
	if first != same || first == other ||
		!strings.Contains(first.String(), expected) ||
		strings.Contains(first.String(), "page") ||
		strings.Contains(first.String(), "search") {
		t.Fatalf("semantic keys first=%s other=%s", first.String(), other.String())
	}
}

func TestStoreDeepClonesCompleteCore(t *testing.T) {
	executor, err := runtimecache.NewExecutor(runtimecache.DefaultExecutorConfig())
	if err != nil {
		t.Fatalf("NewExecutor: %v", err)
	}
	store, err := NewStore(runtimecache.ResultConfig{
		Limits: runtimecache.Limits{
			MaxCost:     64 * 1024,
			MaxItems:    4,
			MaxItemCost: 32 * 1024,
		},
		LoadTimeout: time.Second,
	}, executor)
	if err != nil {
		t.Fatalf("NewStore: %v", err)
	}
	input := Input{Source: SourceInput{
		PersonID:     1,
		PositionKeys: []string{"staff:anime:3"},
	}}
	key, err := ResultKey("global", testDataVersion, testQueryDigest, input, "")
	if err != nil {
		t.Fatalf("ResultKey: %v", err)
	}
	average := int64(800)
	base := partnerViewCore("global")
	base.Partners = []PartnerCore{partnerForView(2, "Partner", 1, &average, &average)}
	var calls atomic.Int64
	build := func(context.Context) (Core, error) {
		calls.Add(1)
		return CloneCore(base), nil
	}
	first, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("first: %v", err)
	}
	first.Source.PositionKeys[0] = "mutated"
	first.Partners[0].Person.Name = "mutated"
	*first.Partners[0].Metrics.Average = 1
	second, err := store.GetOrBuild(context.Background(), key, build)
	if err != nil {
		t.Fatalf("second: %v", err)
	}
	if calls.Load() != 1 ||
		second.Source.PositionKeys[0] != "staff:anime:3" ||
		second.Partners[0].Person.Name != "Partner" ||
		*second.Partners[0].Metrics.Average != 800 {
		t.Fatalf("owned clone = %+v, calls=%d", second, calls.Load())
	}
}

func TestPersonalResultKeyRequiresCollectionDigest(t *testing.T) {
	input := Input{Source: SourceInput{
		PersonID:     1,
		PositionKeys: []string{"staff:anime:3"},
	}}
	if _, err := ResultKey("personal", testDataVersion, testQueryDigest, input, ""); err == nil {
		t.Fatal("personal key accepted empty collection digest")
	}
	if _, err := ResultKey(
		"personal",
		testDataVersion,
		testQueryDigest,
		input,
		"c1:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
	); err != nil {
		t.Fatalf("personal key: %v", err)
	}
}

func TestClonePreferenceOwnsNullableRationals(t *testing.T) {
	mean := statistics.Rational{Numerator: "0", Denominator: "1"}
	value := &Preference{
		Mean:           &mean,
		EvidenceWeight: statistics.Rational{Numerator: "1", Denominator: "6"},
		Score:          &mean,
	}
	copy := clonePreference(value)
	copy.Mean.Numerator = "9"
	if value.Mean.Numerator != "0" {
		t.Fatalf("preference pointer aliased: %+v", value)
	}
}

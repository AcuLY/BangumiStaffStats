package query

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"slices"
	"testing"
)

type queryDomainFixture struct {
	CatalogPlans []SelectionPlan               `json:"catalogPlans"`
	Domains      map[string]queryDomainFactSet `json:"domains"`
	Collections  []CollectionSnapshot          `json:"collections"`
}

type queryDomainFactSet struct {
	Subjects     []Subject     `json:"subjects"`
	StaffCredits []StaffCredit `json:"staffCredits"`
	CastCredits  []CastCredit  `json:"castCredits"`
}

type queryDomainCaseFile struct {
	Cases []queryDomainCase `json:"cases"`
}

type queryDomainCase struct {
	CaseID              string               `json:"caseId"`
	Outcome             string               `json:"outcome"`
	Domain              string               `json:"domain"`
	QuerySource         querySource          `json:"querySource"`
	ParticipantRequests []ParticipantRequest `json:"participantRequests"`
	Expected            json.RawMessage      `json:"expected"`
	FactOrders          []string             `json:"factOrders"`
	RepeatCount         int                  `json:"repeatCount"`
	ExpectedSameAs      struct {
		Path   string `json:"path"`
		CaseID string `json:"caseId"`
	} `json:"expectedSameAs"`
	ExpectedFailure struct {
		Kind           string `json:"kind"`
		Cause          string `json:"cause"`
		PartialResult  bool   `json:"partialResult"`
		WritesObserved int    `json:"writesObserved"`
	} `json:"expectedFailure"`
	SyntheticFacts struct {
		EligibleSubjectIDs boundedRange `json:"eligibleSubjectIds"`
		StaffContribution  struct {
			PositionKey string       `json:"positionKey"`
			PositionID  int64        `json:"positionId"`
			PersonID    int64        `json:"personId"`
			SubjectIDs  boundedRange `json:"subjectIds"`
		} `json:"staffContribution"`
	} `json:"syntheticFacts"`
}

type querySource struct {
	Kind      string          `json:"kind"`
	Path      string          `json:"path"`
	CaseID    string          `json:"caseId"`
	Submitted json.RawMessage `json:"submitted"`
}

type boundedRange struct {
	InclusiveRange []int64 `json:"inclusiveRange"`
	Count          int     `json:"count"`
}

func TestQueryDomainManifestPinsEveryConsumedGolden(t *testing.T) {
	var manifest struct {
		Files []struct {
			Path   string `json:"path"`
			SHA256 string `json:"sha256"`
		} `json:"files"`
		Verifier struct {
			Path   string `json:"path"`
			SHA256 string `json:"sha256"`
		} `json:"verifier"`
		CaseIDs []string `json:"caseIds"`
	}
	decodeTestJSON(
		t,
		readRepositoryFile(t, "contracts/goldens/query-domain/manifest.json"),
		&manifest,
	)
	if len(manifest.Files) != 5 {
		t.Fatalf("query-domain manifest files = %d, want 5", len(manifest.Files))
	}
	observedCaseIDs := make([]string, 0, len(manifest.CaseIDs))
	for _, file := range manifest.Files {
		raw := readRepositoryFile(t, filepath.Join("contracts/goldens/query-domain", file.Path))
		sum := sha256.Sum256(raw)
		if got := fmt.Sprintf("%x", sum); got != file.SHA256 {
			t.Fatalf("%s sha256 = %s, want %s", file.Path, got, file.SHA256)
		}
		if filepath.Ext(file.Path) == ".json" && filepath.Dir(file.Path) == "cases" {
			var cases queryDomainCaseFile
			decodeTestJSON(t, raw, &cases)
			for _, testCase := range cases.Cases {
				observedCaseIDs = append(observedCaseIDs, testCase.CaseID)
			}
		}
	}
	verifier := readRepositoryFile(
		t,
		filepath.Join("contracts/goldens/query-domain", manifest.Verifier.Path),
	)
	verifierSum := sha256.Sum256(verifier)
	if got := fmt.Sprintf("%x", verifierSum); got != manifest.Verifier.SHA256 {
		t.Fatalf("query-domain verifier sha256 = %s, want %s", got, manifest.Verifier.SHA256)
	}
	slices.Sort(observedCaseIDs)
	if !slices.Equal(observedCaseIDs, manifest.CaseIDs) {
		t.Fatalf("query-domain case IDs = %v, want %v", observedCaseIDs, manifest.CaseIDs)
	}
}

func TestQueryDomainSuccessGoldens(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	for _, relative := range []string{"cases/scope-filters.json", "cases/identity-algebra.json"} {
		caseFile := readQueryDomainCaseFile(t, relative)
		for _, testCase := range caseFile.Cases {
			testCase := testCase
			t.Run(testCase.CaseID, func(t *testing.T) {
				normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)
				facts := fixture.factSet(testCase.Domain)
				source := &fixtureCollectionSource{snapshots: fixture.Collections}
				actual, err := Evaluate(
					context.Background(),
					normalized,
					facts,
					source,
					testCase.ParticipantRequests,
				)
				if err != nil {
					t.Fatalf("Evaluate: %v", err)
				}
				assertDomainJSONEqual(t, actual, testCase.Expected)
				if normalized.Effective.Scope == "global" && source.accesses != 0 {
					t.Fatalf("global collection accesses = %d, want 0", source.accesses)
				}
				if normalized.Effective.Scope == "personal" && source.accesses != 1 {
					t.Fatalf("personal collection accesses = %d, want 1", source.accesses)
				}
				if normalized.Effective.Scope == "personal" &&
					actual.EffectiveQuery.Filters != nil &&
					actual.EffectiveQuery.Filters.SubjectDate != nil &&
					actual.EffectiveQuery.Filters.SubjectDate.Min != nil {
					*actual.EffectiveQuery.Filters.SubjectDate.Min = "9999-12"
					repeated, err := Evaluate(
						context.Background(),
						normalized,
						facts,
						&fixtureCollectionSource{snapshots: fixture.Collections},
						testCase.ParticipantRequests,
					)
					if err != nil {
						t.Fatalf("Evaluate after caller mutation: %v", err)
					}
					assertDomainJSONEqual(t, repeated, testCase.Expected)
				}
			})
		}
	}
}

func TestQueryDomainDeterminismReference(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	control := findDomainCase(t, readQueryDomainCaseFile(t, "cases/control.json"), "shuffled-and-repeated-input-is-deterministic")
	referenceFile := readQueryDomainCaseFile(t, control.ExpectedSameAs.Path)
	reference := findDomainCase(t, referenceFile, control.ExpectedSameAs.CaseID)
	normalized := resolveDomainQuery(t, reference.QuerySource, fixture.CatalogPlans)
	base := fixture.factSet(reference.Domain)

	for _, order := range control.FactOrders {
		facts := reorderedFacts(base, order)
		for run := 0; run < control.RepeatCount; run++ {
			actual, err := Evaluate(
				context.Background(),
				normalized,
				facts,
				&fixtureCollectionSource{snapshots: fixture.Collections},
				reference.ParticipantRequests,
			)
			if err != nil {
				t.Fatalf("%s run %d: Evaluate: %v", order, run+1, err)
			}
			assertDomainJSONEqual(t, actual, reference.Expected)

			// Caller mutation cannot affect a later evaluation.
			if len(actual.EligibleSubjectIDs) > 0 {
				actual.EligibleSubjectIDs[0] = -1
			}
			if len(actual.PositionResults) > 1 &&
				len(actual.PositionResults[1].Contributions) > 0 &&
				actual.PositionResults[1].Contributions[0].SortOrder != nil {
				*actual.PositionResults[1].Contributions[0].SortOrder = -1
			}
			if actual.EffectiveQuery.Filters != nil &&
				actual.EffectiveQuery.Filters.SubjectDate != nil &&
				actual.EffectiveQuery.Filters.SubjectDate.Min != nil {
				*actual.EffectiveQuery.Filters.SubjectDate.Min = "9999-12"
			}
		}
	}
}

func TestQueryDomainCancellationReturnsNoPartialResult(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(t, readQueryDomainCaseFile(t, "cases/control.json"), "cancellation-publishes-no-partial-result")
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)

	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	actual, err := Evaluate(
		ctx,
		normalized,
		fixture.factSet(testCase.Domain),
		&fixtureCollectionSource{snapshots: fixture.Collections},
		nil,
	)
	if actual != nil {
		t.Fatalf("canceled evaluation returned partial result: %+v", actual)
	}
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled evaluation error = %v, want context.Canceled", err)
	}
	if testCase.ExpectedFailure.Kind != "context" ||
		testCase.ExpectedFailure.Cause != "canceled" ||
		testCase.ExpectedFailure.PartialResult ||
		testCase.ExpectedFailure.WritesObserved != 0 {
		t.Fatalf("unexpected cancellation golden: %+v", testCase.ExpectedFailure)
	}
}

func TestPersonalCollectionSnapshotCannotCrossUIDBoundary(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(
		t,
		readQueryDomainCaseFile(t, "cases/scope-filters.json"),
		"personal-filter-inclusive-boundaries",
	)
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)
	var bob CollectionSnapshot
	for _, snapshot := range fixture.Collections {
		if snapshot.UID == "Bob" {
			bob = snapshot
		}
	}
	actual, err := Evaluate(
		context.Background(),
		normalized,
		fixture.factSet(testCase.Domain),
		CollectionSourceFunc(func(context.Context, string) (CollectionSnapshot, error) {
			return cloneCollectionSnapshot(bob), nil
		}),
		nil,
	)
	if err == nil || actual != nil {
		t.Fatalf("cross-UID collection result = %+v, err = %v", actual, err)
	}
}

func TestCancellationAfterCollectionAdmissionReturnsNoPartialResult(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(
		t,
		readQueryDomainCaseFile(t, "cases/scope-filters.json"),
		"personal-filter-inclusive-boundaries",
	)
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)
	ctx, cancel := context.WithCancel(context.Background())
	actual, err := Evaluate(
		ctx,
		normalized,
		fixture.factSet(testCase.Domain),
		CollectionSourceFunc(func(context.Context, string) (CollectionSnapshot, error) {
			cancel()
			for _, snapshot := range fixture.Collections {
				if snapshot.UID == normalized.Effective.UID {
					return cloneCollectionSnapshot(snapshot), nil
				}
			}
			return CollectionSnapshot{}, errors.New("snapshot not found")
		}),
		nil,
	)
	if actual != nil || !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled personal result = %+v, err = %v", actual, err)
	}
}

func TestCollectionSourceErrorPrefersExactContextCause(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(
		t,
		readQueryDomainCaseFile(t, "cases/scope-filters.json"),
		"personal-filter-inclusive-boundaries",
	)
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)
	cause := errors.New("test collection source cause")
	ctx, cancel := context.WithCancelCause(context.Background())
	actual, err := Evaluate(
		ctx,
		normalized,
		fixture.factSet(testCase.Domain),
		CollectionSourceFunc(func(context.Context, string) (CollectionSnapshot, error) {
			cancel(cause)
			return CollectionSnapshot{}, context.Canceled
		}),
		nil,
	)
	if actual != nil || !errors.Is(err, cause) {
		t.Fatalf("collection-source cancellation result = %+v, err = %v", actual, err)
	}
}

func TestCancellationDuringSetConstructionReturnsContextCause(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(
		t,
		readQueryDomainCaseFile(t, "cases/identity-algebra.json"),
		"multi-position-person-and-work-union",
	)
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)
	cause := errors.New("test set construction canceled")
	ctx, cancel := context.WithCancelCause(context.Background())
	actual, err := evaluate(
		ctx,
		normalized,
		fixture.factSet(testCase.Domain),
		nil,
		testCase.ParticipantRequests,
		evaluationHooks{
			afterSubjectIndexed: func(indexed int) {
				if indexed == 2 {
					cancel(cause)
				}
			},
		},
	)
	if actual != nil || !errors.Is(err, cause) {
		t.Fatalf("set-construction cancellation result = %+v, err = %v", actual, err)
	}
}

func TestQueryDomainBoundedOracle(t *testing.T) {
	fixture := readQueryDomainFixture(t)
	testCase := findDomainCase(t, readQueryDomainCaseFile(t, "cases/oracle-provenance.json"), "actual-participation-442-not-candidate-449")
	normalized := resolveDomainQuery(t, testCase.QuerySource, fixture.CatalogPlans)

	eligibleIDs := expandBoundedRange(t, testCase.SyntheticFacts.EligibleSubjectIDs)
	participatingIDs := expandBoundedRange(t, testCase.SyntheticFacts.StaffContribution.SubjectIDs)
	facts := FactSet{
		Plans: append([]SelectionPlan(nil), fixture.CatalogPlans...),
	}
	for _, subjectID := range eligibleIDs {
		facts.Subjects = append(facts.Subjects, Subject{
			SubjectID:     subjectID,
			SubjectType:   "anime",
			RatingBuckets: []RatingBucket{},
			Tags:          []SubjectTag{},
		})
	}
	for _, subjectID := range participatingIDs {
		facts.StaffCredits = append(facts.StaffCredits, StaffCredit{
			SubjectID:  subjectID,
			PersonID:   testCase.SyntheticFacts.StaffContribution.PersonID,
			PositionID: testCase.SyntheticFacts.StaffContribution.PositionID,
		})
	}

	actual, err := Evaluate(context.Background(), normalized, facts, nil, nil)
	if err != nil {
		t.Fatalf("Evaluate oracle: %v", err)
	}
	if !slices.Equal(actual.EligibleSubjectIDs, eligibleIDs) {
		t.Fatal("oracle eligible set differs")
	}
	if len(actual.PositionResults) != 1 ||
		!slices.Equal(actual.PositionResults[0].CandidateSubjectIDs, participatingIDs) {
		t.Fatal("oracle candidate subjects differ")
	}
	if len(actual.RankingPeople) != 1 ||
		actual.RankingPeople[0].PersonID != testCase.SyntheticFacts.StaffContribution.PersonID ||
		!slices.Equal(actual.RankingPeople[0].SubjectIDs, participatingIDs) {
		t.Fatal("oracle ranking people differ")
	}
	if !slices.Equal(actual.ParticipatingSubjectIDs, participatingIDs) {
		t.Fatal("oracle participation differs")
	}

	var expected struct {
		QueryDigest      string       `json:"queryDigest"`
		Eligible         boundedRange `json:"eligibleSubjectIds"`
		Candidates       boundedRange `json:"candidateSubjectIds"`
		NonParticipating []int64      `json:"nonParticipatingEligibleSubjectIds"`
	}
	decodeTestJSON(t, testCase.Expected, &expected)
	if actual.QueryDigest != expected.QueryDigest ||
		len(actual.EligibleSubjectIDs) != expected.Eligible.Count ||
		len(actual.PositionResults[0].CandidateSubjectIDs) != expected.Candidates.Count {
		t.Fatalf("oracle counts/digest differ: %+v", actual)
	}
	participatingSet := make(map[int64]struct{}, len(actual.ParticipatingSubjectIDs))
	for _, subjectID := range actual.ParticipatingSubjectIDs {
		participatingSet[subjectID] = struct{}{}
	}
	nonParticipating := make([]int64, 0)
	for _, subjectID := range actual.EligibleSubjectIDs {
		if _, ok := participatingSet[subjectID]; !ok {
			nonParticipating = append(nonParticipating, subjectID)
		}
	}
	if !slices.Equal(nonParticipating, expected.NonParticipating) {
		t.Fatalf("non-participating = %v, want %v", nonParticipating, expected.NonParticipating)
	}
}

type fixtureCollectionSource struct {
	snapshots []CollectionSnapshot
	accesses  int
}

func (s *fixtureCollectionSource) Snapshot(ctx context.Context, uid string) (CollectionSnapshot, error) {
	if err := contextCause(ctx); err != nil {
		return CollectionSnapshot{}, err
	}
	s.accesses++
	for _, snapshot := range s.snapshots {
		if snapshot.UID == uid {
			return cloneCollectionSnapshot(snapshot), nil
		}
	}
	return CollectionSnapshot{}, fmt.Errorf("test collection not found: %s", uid)
}

func cloneCollectionSnapshot(value CollectionSnapshot) CollectionSnapshot {
	result := CollectionSnapshot{UID: value.UID, Entries: make([]CollectionEntry, len(value.Entries))}
	for index, entry := range value.Entries {
		entry.Tags = append([]string(nil), entry.Tags...)
		if entry.PersonalScore != nil {
			score := *entry.PersonalScore
			entry.PersonalScore = &score
		}
		result.Entries[index] = entry
	}
	return result
}

func (f queryDomainFixture) factSet(domain string) FactSet {
	value, ok := f.Domains[domain]
	if !ok {
		panic("unknown fixture domain " + domain)
	}
	return FactSet{
		Subjects:     append([]Subject(nil), value.Subjects...),
		StaffCredits: append([]StaffCredit(nil), value.StaffCredits...),
		CastCredits:  append([]CastCredit(nil), value.CastCredits...),
		Plans:        append([]SelectionPlan(nil), f.CatalogPlans...),
	}
}

func reorderedFacts(value FactSet, order string) FactSet {
	result := FactSet{
		Subjects:     append([]Subject(nil), value.Subjects...),
		StaffCredits: append([]StaffCredit(nil), value.StaffCredits...),
		CastCredits:  append([]CastCredit(nil), value.CastCredits...),
		Plans:        append([]SelectionPlan(nil), value.Plans...),
	}
	switch order {
	case "fixture":
	case "reverse":
		slices.Reverse(result.Subjects)
		slices.Reverse(result.StaffCredits)
		slices.Reverse(result.CastCredits)
	case "rotate-one":
		rotateOne(result.Subjects)
		rotateOne(result.StaffCredits)
		rotateOne(result.CastCredits)
	default:
		panic("unknown fact order " + order)
	}
	return result
}

func rotateOne[T any](values []T) {
	if len(values) > 0 {
		first := values[0]
		copy(values, values[1:])
		values[len(values)-1] = first
	}
}

func resolveDomainQuery(t *testing.T, source querySource, plans []SelectionPlan) NormalizedQuery {
	t.Helper()
	var submitted, catalog json.RawMessage
	switch source.Kind {
	case "inline":
		submitted = source.Submitted
		catalog = catalogJSON(t, plans)
	case "sharedQueryVector":
		var vectors struct {
			Cases []struct {
				ID        string          `json:"id"`
				Submitted json.RawMessage `json:"submitted"`
				Catalog   json.RawMessage `json:"catalog"`
			} `json:"cases"`
		}
		decodeTestJSON(t, readRepositoryFile(t, source.Path), &vectors)
		for _, vector := range vectors.Cases {
			if vector.ID == source.CaseID {
				submitted = vector.Submitted
				catalog = vector.Catalog
				break
			}
		}
	default:
		t.Fatalf("unknown query source kind %q", source.Kind)
	}
	if len(submitted) == 0 || len(catalog) == 0 {
		t.Fatalf("unresolved query source: %+v", source)
	}
	normalized, err := NormalizeJSON(submitted, catalog)
	if err != nil {
		t.Fatalf("NormalizeJSON: %v", err)
	}
	return normalized
}

func catalogJSON(t *testing.T, plans []SelectionPlan) json.RawMessage {
	t.Helper()
	type position struct {
		Key         string `json:"key"`
		SubjectType string `json:"subjectType"`
		Selectable  bool   `json:"selectable"`
	}
	value := struct {
		Positions []position `json:"positions"`
	}{Positions: make([]position, 0, len(plans))}
	for _, plan := range plans {
		value.Positions = append(value.Positions, position{
			Key:         plan.PositionKey,
			SubjectType: "anime",
			Selectable:  true,
		})
	}
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func readQueryDomainFixture(t *testing.T) queryDomainFixture {
	t.Helper()
	var fixture queryDomainFixture
	decodeTestJSON(
		t,
		readRepositoryFile(t, "contracts/goldens/query-domain/fixtures/anime-domain-v1.json"),
		&fixture,
	)
	return fixture
}

func readQueryDomainCaseFile(t *testing.T, relative string) queryDomainCaseFile {
	t.Helper()
	if !filepath.IsAbs(relative) && !filepath.IsLocal(relative) {
		t.Fatalf("unsafe case path %q", relative)
	}
	var value queryDomainCaseFile
	path := relative
	if !filepath.IsAbs(path) && filepath.Dir(path) == "." {
		path = filepath.Join("contracts/goldens/query-domain", path)
	} else if !filepath.IsAbs(path) && !filepath.IsLocal(path) {
		t.Fatalf("unsafe case path %q", relative)
	} else if !filepath.IsAbs(path) && !bytes.HasPrefix([]byte(path), []byte("contracts/")) {
		path = filepath.Join("contracts/goldens/query-domain", path)
	}
	decodeTestJSON(t, readRepositoryFile(t, path), &value)
	return value
}

func findDomainCase(t *testing.T, file queryDomainCaseFile, caseID string) queryDomainCase {
	t.Helper()
	for _, value := range file.Cases {
		if value.CaseID == caseID {
			return value
		}
	}
	t.Fatalf("query-domain case %q not found", caseID)
	return queryDomainCase{}
}

func expandBoundedRange(t *testing.T, value boundedRange) []int64 {
	t.Helper()
	if len(value.InclusiveRange) != 2 ||
		value.InclusiveRange[0] <= 0 ||
		value.InclusiveRange[1] < value.InclusiveRange[0] ||
		value.InclusiveRange[1]-value.InclusiveRange[0] > 1000 {
		t.Fatalf("invalid bounded range: %+v", value)
	}
	result := make([]int64, 0, value.InclusiveRange[1]-value.InclusiveRange[0]+1)
	for current := value.InclusiveRange[0]; current <= value.InclusiveRange[1]; current++ {
		result = append(result, current)
	}
	return result
}

func assertDomainJSONEqual(t *testing.T, actual any, expected json.RawMessage) {
	t.Helper()
	actualData, err := json.Marshal(actual)
	if err != nil {
		t.Fatalf("marshal actual: %v", err)
	}
	var actualValue, expectedValue any
	decodeJSONNumber(t, actualData, &actualValue)
	decodeJSONNumber(t, expected, &expectedValue)
	if !reflect.DeepEqual(actualValue, expectedValue) {
		t.Fatalf("JSON differs\nactual:   %s\nexpected: %s", actualData, expected)
	}
}

func decodeTestJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode JSON: %v", err)
	}
}

func decodeJSONNumber(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode JSON number: %v", err)
	}
}

func readRepositoryFile(t *testing.T, relative string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join(queryRepositoryRoot(t), filepath.FromSlash(relative)))
	if err != nil {
		t.Fatalf("read %s: %v", relative, err)
	}
	return data
}

func queryRepositoryRoot(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve query test path")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
}

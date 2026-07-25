package persondetail

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

func TestServiceConstructorsPreserveIsolationAndSharedRuntimeIdentity(t *testing.T) {
	isolated, err := NewService(nil, nil, DefaultConfig())
	if err != nil {
		t.Fatalf("isolated NewService: %v", err)
	}
	binding, err := ResultBinding()
	if err != nil {
		t.Fatal(err)
	}
	queryRuntime, err := runtimecache.NewQueryRuntime(
		runtimecache.DefaultQueryRuntimeConfig(),
		binding,
	)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := NewServiceWithRuntime(nil, nil, queryRuntime)
	if err != nil {
		t.Fatalf("NewServiceWithRuntime: %v", err)
	}
	sharedAgain, err := NewServiceWithRuntime(nil, nil, queryRuntime)
	if err != nil {
		t.Fatalf("second NewServiceWithRuntime: %v", err)
	}
	if isolated.QueryRuntime() == nil ||
		isolated.QueryRuntime() == queryRuntime ||
		isolated.collection != isolated.QueryRuntime().CollectionCache() {
		t.Fatal("compatibility constructor did not own one isolated runtime")
	}
	if shared.QueryRuntime() != queryRuntime ||
		shared.collection != queryRuntime.CollectionCache() {
		t.Fatal("shared constructor did not retain the supplied runtime")
	}
	if shared.results == nil ||
		sharedAgain.results == nil ||
		sharedAgain.results.values != shared.results.values {
		t.Fatal("shared constructors did not reuse the canonical result store")
	}
}

func TestServiceExecutesArchiveBackedGlobalDetailWithoutCollection(t *testing.T) {
	store := loadPersonDetailArchive(t)
	var collectionCalls atomic.Int64
	service := newPersonDetailService(t, store, CollectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		return runtimecache.CollectionSnapshot{}, nil
	}))
	request := Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(`{"personId":100}`),
		View:  json.RawMessage(`{"page":1,"pageSize":5}`),
	}
	trace := querytiming.New()
	first, err := service.Execute(
		querytiming.WithContext(context.Background(), trace),
		request,
	)
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v", failure)
	}
	assertGlobalServiceTiming(t, trace.Freeze())
	request.View = json.RawMessage(`{"search":"金标","page":2,"pageSize":5}`)
	second, err := service.Execute(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if collectionCalls.Load() != 0 {
		t.Fatalf("global collection calls = %d", collectionCalls.Load())
	}
	if first.Core.Person.ID != 100 ||
		first.Core.Person.Name != "Golden Director" ||
		first.Core.Summary.WorkCount != 1 ||
		first.Core.Metrics.Average == nil ||
		*first.Core.Metrics.Average != 820 ||
		len(first.Works) != 1 ||
		first.Works[0].Subject.Subject.ID != 1 {
		t.Fatalf("global detail = %+v", first)
	}
	if second.Pagination.Total != 1 || len(second.Works) != 0 {
		t.Fatalf("out-of-range detail page = %+v", second)
	}
	stats := service.results.Stats()
	if stats.Items != 1 || stats.Publications != 1 || stats.Hits == 0 {
		t.Fatalf("core cache stats = %+v", stats)
	}
}

func assertGlobalServiceTiming(t *testing.T, snapshot querytiming.Snapshot) {
	t.Helper()
	if snapshot.Scope() != querytiming.ScopeGlobal {
		t.Fatalf("scope = %q", snapshot.Scope())
	}
	for _, phase := range []querytiming.Phase{
		querytiming.PhaseCache,
		querytiming.PhaseSQLite,
		querytiming.PhaseCompute,
		querytiming.PhaseProjection,
	} {
		if _, present := snapshot.Phase(phase); !present {
			t.Fatalf("phase %q absent: %#v", phase, snapshot)
		}
	}
	if _, present := snapshot.Phase(querytiming.PhaseCollection); present {
		t.Fatal("global query recorded a collection phase")
	}
}

func TestServiceBuildsCharactersFromExactCastAuthority(t *testing.T) {
	store := loadPersonDetailArchive(t)
	service := newPersonDetailService(t, store, nil)
	result, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
		Input: json.RawMessage(`{"personId":101}`),
		View:  json.RawMessage(`{"section":"characters","sort":"role"}`),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute cast: %#v", failure)
	}
	if result.Core.Summary.CharacterCount == nil ||
		*result.Core.Summary.CharacterCount != 1 ||
		len(result.Characters) != 1 ||
		result.Characters[0].Character.ID == nil ||
		*result.Characters[0].Character.ID != 200 ||
		result.Characters[0].Appearances[0].Subject.ID != 1 {
		t.Fatalf("cast detail = %+v", result)
	}
}

func TestLoadArchiveEvidenceReadsOnlyRequestedSubjectReferences(t *testing.T) {
	store := loadPersonDetailArchive(t)
	subjectIDs := []int64{1, 1}
	for subjectID := int64(1_000); subjectID <= 1_400; subjectID++ {
		subjectIDs = append(subjectIDs, subjectID)
	}
	evidence, err := LoadArchiveEvidence(
		context.Background(),
		store,
		"anime",
		100,
		subjectIDs,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(evidence.Subjects) != 1 ||
		evidence.Subjects[0].ID != 1 {
		t.Fatalf("bounded subject references = %+v", evidence.Subjects)
	}
	for _, subject := range evidence.Subjects {
		if subject.ID == 2 || subject.ID == 3 || subject.ID == 4 {
			t.Fatalf("unrequested subject entered evidence: %+v", subject)
		}
	}
}

func TestServicePersonalUsesOneAdmittedCollectionAndEmitsCompleteEvidence(t *testing.T) {
	store := loadPersonDetailArchive(t)
	var collectionCalls atomic.Int64
	fetchedAt := time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)
	service := newPersonDetailService(t, store, CollectionProviderFunc(func(
		_ context.Context,
		uid string,
		subjectType string,
		statuses []string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		if uid != "Alice" ||
			subjectType != "anime" ||
			!slices.Equal(statuses, []string{"completed"}) {
			t.Fatalf("collection request = %q %q %v", uid, subjectType, statuses)
		}
		return runtimecache.CollectionSnapshot{Items: []runtimecache.CollectionItem{{
			SubjectID:   1,
			SubjectType: "anime",
			Status:      "completed",
			Rate:        9,
			Tags:        []string{"个人标签"},
			UpdatedAt:   fetchedAt,
		}}}, nil
	}))
	request := Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(`{"personId":100}`),
	}
	first, err := service.Execute(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	request.View = json.RawMessage(`{"sort":"collectionUpdatedAt","pageSize":5}`)
	second, err := service.Execute(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if collectionCalls.Load() != 1 ||
		first.Collection == nil ||
		first.Collection.Stale ||
		first.Core.Metrics.Average == nil ||
		*first.Core.Metrics.Average != 900 ||
		first.Core.Metrics.GlobalAverage == nil ||
		*first.Core.Metrics.GlobalAverage != 820 ||
		first.Core.Preference == nil ||
		first.Core.Preference.ComparableCount != 1 ||
		first.Core.Ratings.Personal == nil ||
		len(first.Core.Tags.Personal) != 1 ||
		first.Core.Tags.Personal[0].Name != "个人标签" ||
		second.Pagination.Total != 1 {
		t.Fatalf(
			"personal detail: calls=%d first=%+v second=%+v",
			collectionCalls.Load(),
			first,
			second,
		)
	}
}

func TestServiceDistinguishesMissingAndIneligiblePersonFromArchive(t *testing.T) {
	store := loadPersonDetailArchive(t)
	service := newPersonDetailService(t, store, nil)
	base := Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
	}
	base.Input = json.RawMessage(`{"personId":999999}`)
	_, err := service.Execute(context.Background(), base)
	assertFailure(t, err, CodeEntityNotFound, "")

	base.Input = json.RawMessage(`{"personId":101}`)
	_, err = service.Execute(context.Background(), base)
	assertFailure(t, err, CodePersonNotInQueryResult, "/input/personId")
}

func TestServiceRejectsClosedInputAndUnavailableCharacterSectionEarly(t *testing.T) {
	store := loadPersonDetailArchive(t)
	service := newPersonDetailService(t, store, nil)
	request := Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(`{"personId":100,"refreshCollection":true}`),
	}
	_, err := service.Execute(context.Background(), request)
	assertFailure(t, err, CodeInvalidRequest, "")

	request.Input = json.RawMessage(`{"personId":100}`)
	request.View = json.RawMessage(`{"section":"characters"}`)
	_, err = service.Execute(context.Background(), request)
	assertFailure(t, err, CodeCapabilityNotAvailable, "/view/section")
	if service.results.Stats().Items != 0 {
		t.Fatal("invalid character view reached expensive core")
	}
}

func newPersonDetailService(
	t *testing.T,
	store *archive.Store,
	collections CollectionProvider,
) *Service {
	t.Helper()
	config := DefaultConfig()
	config.Collection.Now = func() time.Time {
		return time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)
	}
	service, err := NewService(
		func() (*archive.Store, bool) { return store, store != nil },
		collections,
		config,
	)
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func loadPersonDetailArchive(t *testing.T) *archive.Store {
	t.Helper()
	repositoryRoot := filepath.Clean(filepath.Join("..", "..", ".."))
	bundle := filepath.Join(
		repositoryRoot,
		"contracts",
		"goldens",
		"archive",
		"valid",
		"minimal",
	)
	pointerBytes, err := os.ReadFile(filepath.Join(bundle, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(pointerBytes, &pointer); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	versionRoot := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	for source, destination := range map[string]string{
		"archive-manifest.json": "manifest.json",
		"bangumi.sqlite":        "bangumi.sqlite",
	} {
		data, err := os.ReadFile(filepath.Join(bundle, source))
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(versionRoot, destination), data, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	store, err := archive.LoadCandidate(context.Background(), root, pointer.DataVersion)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	return store
}

func TestStrictInputNeverEchoesRawEntityOrUnknownField(t *testing.T) {
	_, err := decodeInput(
		json.RawMessage(`{"personId":123,"secretField":"do-not-echo"}`),
	)
	failure, found := ErrorDetails(err)
	if !found ||
		strings.Contains(failure.Error(), "123") ||
		strings.Contains(failure.Error(), "secretField") {
		t.Fatalf("unsafe input failure = %#v", err)
	}
}

func TestSelectedCastApplicableUsesCatalogKindInsteadOfPositionKeySyntax(t *testing.T) {
	castKinds := map[string]bool{
		"opaque-position":            true,
		"cast:looks-like-a-cast-key": false,
	}
	if !selectedCastApplicable([]string{"opaque-position"}, castKinds) {
		t.Fatal("opaque catalog cast position was not applicable")
	}
	if selectedCastApplicable([]string{"cast:looks-like-a-cast-key"}, castKinds) {
		t.Fatal("position key syntax incorrectly enabled cast detail")
	}
}

func TestDecodersAcceptExactJSONIntegerRepresentations(t *testing.T) {
	for _, raw := range []string{
		`{"personId":1.0}`,
		`{"personId":1e0}`,
		`{"personId":9.007199254740991e15}`,
	} {
		input, err := decodeInput(json.RawMessage(raw))
		if err != nil {
			t.Fatalf("decodeInput(%s): %v", raw, err)
		}
		if input.PersonID < 1 || input.PersonID > maxJSONSafeInteger {
			t.Fatalf("decodeInput(%s) = %+v", raw, input)
		}
	}

	view, err := decodeView(json.RawMessage(`{"page":1.0,"pageSize":2e1}`))
	if err != nil {
		t.Fatal(err)
	}
	if view == nil || view.Page == nil || *view.Page != 1 ||
		view.PageSize == nil || *view.PageSize != 20 {
		t.Fatalf("decoded view = %+v", view)
	}
}

func TestDecodersRejectFractionalUnsafeAndNullValues(t *testing.T) {
	_, err := decodeInput(json.RawMessage(`{"personId":1.5}`))
	assertFailureWithFieldCode(
		t,
		err,
		CodeFieldInvalid,
		"/input/personId",
		"INVALID_TYPE",
	)

	for _, raw := range []string{
		`{"personId":0}`,
		`{"personId":-1}`,
		`{"personId":9007199254740992}`,
		`{"personId":1e100}`,
	} {
		_, err = decodeInput(json.RawMessage(raw))
		assertFailureWithFieldCode(
			t,
			err,
			CodeFieldInvalid,
			"/input/personId",
			"OUT_OF_RANGE",
		)
	}

	_, err = decodeView(json.RawMessage(`null`))
	assertFailureWithFieldCode(
		t,
		err,
		CodeFieldInvalid,
		"/view",
		"INVALID_TYPE",
	)

	_, err = decodeView(json.RawMessage(`{"page":1.5}`))
	assertFailureWithFieldCode(
		t,
		err,
		CodeFieldInvalid,
		"/view/page",
		"OUT_OF_RANGE",
	)

	_, err = decodeView(json.RawMessage(`{"pageSize":2.5}`))
	assertFailureWithFieldCode(
		t,
		err,
		CodeFieldInvalid,
		"/view/pageSize",
		"INVALID_TYPE",
	)

	for _, raw := range []string{`{"search":42}`, `{"search":null}`} {
		_, err = decodeView(json.RawMessage(raw))
		assertFailureWithFieldCode(
			t,
			err,
			CodeFieldInvalid,
			"/view/search",
			"INVALID_TYPE",
		)
	}

	overlongSearch := `{"search":"` + strings.Repeat("界", 257) + `"}`
	view, err := decodeView(json.RawMessage(overlongSearch))
	if err != nil {
		t.Fatal(err)
	}
	_, err = NormalizeView(
		"global",
		statistics.UnitSubject,
		false,
		view,
	)
	assertFailureWithFieldCode(
		t,
		err,
		CodeFieldInvalid,
		"/view/search",
		"OUT_OF_RANGE",
	)
}

func TestDecodersRejectUnknownMembersAsInvalidRequest(t *testing.T) {
	_, err := decodeInput(json.RawMessage(`{"personId":1,"extra":true}`))
	assertFailure(t, err, CodeInvalidRequest, "")

	_, err = decodeView(json.RawMessage(`{"extra":true}`))
	assertFailure(t, err, CodeInvalidRequest, "")
}

func assertFailureWithFieldCode(
	t *testing.T,
	err error,
	code Code,
	path string,
	fieldCode string,
) {
	t.Helper()
	failure, found := ErrorDetails(err)
	if !found ||
		failure.Code() != code ||
		failure.Path() != path ||
		failure.FieldCode() != fieldCode {
		t.Fatalf(
			"failure = %#v, want code=%s path=%s fieldCode=%s",
			err,
			code,
			path,
			fieldCode,
		)
	}
}

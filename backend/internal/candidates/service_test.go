package candidates

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
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

func TestServiceExecutesGlobalArchiveCandidatesWithoutCollection(t *testing.T) {
	store := loadCandidateArchive(t)
	var collectionCalls atomic.Int64
	service := newCandidateService(t, store, CollectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		return runtimecache.CollectionSnapshot{}, nil
	}))

	trace := querytiming.New()
	result, err := service.Execute(querytiming.WithContext(context.Background(), trace), Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(`{"positionKey":"staff:anime:2"}`),
		View:  json.RawMessage(`{"page":1e0,"pageSize":1.0e1}`),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v cause=%v", err, failure.cause)
	}
	assertGlobalServiceTiming(t, trace.Freeze())
	if collectionCalls.Load() != 0 {
		t.Fatalf("global collection calls = %d", collectionCalls.Load())
	}
	data, err := result.MarshalEnvelope("req-candidates-global")
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Data struct {
			Summary struct {
				PositionCounts []PositionCount `json:"positionCounts"`
			} `json:"summary"`
			PositionKey string `json:"positionKey"`
			Items       []struct {
				Rank      int             `json:"rank"`
				Person    PersonReference `json:"person"`
				WorkCount int             `json:"workCount"`
			} `json:"items"`
		} `json:"data"`
		Meta struct {
			DataVersion string     `json:"dataVersion"`
			Pagination  Pagination `json:"pagination"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.PositionKey != "staff:anime:2" ||
		len(envelope.Data.Summary.PositionCounts) != 1 ||
		envelope.Data.Summary.PositionCounts[0].Count != 1 ||
		len(envelope.Data.Items) != 1 ||
		envelope.Data.Items[0].Person.ID != 100 ||
		envelope.Data.Items[0].Rank != 1 ||
		envelope.Data.Items[0].WorkCount != 1 ||
		envelope.Meta.DataVersion != store.Identity().DataVersion ||
		envelope.Meta.Pagination.Page != 1 ||
		envelope.Meta.Pagination.PageSize != 10 {
		t.Fatalf("candidate projection = %s", data)
	}
	if strings.Contains(string(data), `"collection"`) ||
		strings.Contains(string(data), `"selected"`) {
		t.Fatalf("forbidden global fields leaked: %s", data)
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

func TestServicePersonalWithoutCollectionDependencyIsNotReady(t *testing.T) {
	service := newCandidateService(t, loadCandidateArchive(t), nil)
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(`{"positionKey":"staff:anime:2"}`),
	})
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeNotReady ||
		!failure.Retryable() || failure.DataVersion() != "" {
		t.Fatalf("missing collection dependency = %#v", err)
	}
}

func TestServiceCapabilityErrorsAlwaysPointToQueryPosition(t *testing.T) {
	service := newCandidateService(t, loadCandidateArchive(t), nil)
	testCases := []struct {
		name  string
		query string
		input string
		path  string
	}{
		{
			name:  "current position",
			query: `{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`,
			input: `{"positionKey":"cast:anime:main"}`,
			path:  "/query/positionKeys/0",
		},
		{
			name:  "non-current position",
			query: `{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2","cast:anime:main"]}`,
			input: `{"positionKey":"staff:anime:2"}`,
			path:  "/query/positionKeys/1",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := service.Execute(context.Background(), Request{
				Query: json.RawMessage(testCase.query),
				Input: json.RawMessage(testCase.input),
			})
			failure, found := ErrorDetails(err)
			if !found ||
				failure.Code() != CodeCapabilityNotAvailable ||
				failure.Path() != testCase.path ||
				failure.FieldCode() != string(CodeCapabilityNotAvailable) {
				t.Fatalf("capability failure = %#v", err)
			}
		})
	}
}

func TestCandidateViewUsesExactJSONIntegerSemantics(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		raw      string
		wantPage int64
		wantSize int
	}{
		{
			name:     "decimal integer",
			raw:      `{"page":1.0,"pageSize":10.00}`,
			wantPage: 1,
			wantSize: 10,
		},
		{
			name:     "exponent integer",
			raw:      `{"page":5e0,"pageSize":2e1}`,
			wantPage: 5,
			wantSize: 20,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			input, err := parseViewInput(json.RawMessage(testCase.raw))
			if err != nil {
				t.Fatal(err)
			}
			if input.Page == nil || *input.Page != testCase.wantPage ||
				input.PageSize == nil || *input.PageSize != testCase.wantSize {
				t.Fatalf("view = %+v", input)
			}
		})
	}
	for _, testCase := range []struct {
		name string
		raw  string
		path string
	}{
		{
			name: "fraction page",
			raw:  `{"page":1.5}`,
			path: "/view/page",
		},
		{
			name: "overflow page",
			raw:  `{"page":9007199254740992}`,
			path: "/view/page",
		},
		{
			name: "fraction page size",
			raw:  `{"pageSize":1e-1}`,
			path: "/view/pageSize",
		},
		{
			name: "overflow page size",
			raw:  `{"pageSize":1e1000}`,
			path: "/view/pageSize",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := parseViewInput(json.RawMessage(testCase.raw))
			failure, found := ErrorDetails(err)
			if !found ||
				failure.Code() != CodeFieldInvalid ||
				failure.Path() != testCase.path {
				t.Fatalf("numeric failure = %#v", err)
			}
		})
	}
}

func newCandidateService(
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

func loadCandidateArchive(t *testing.T) *archive.Store {
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
		if err := os.WriteFile(
			filepath.Join(versionRoot, destination),
			data,
			0o644,
		); err != nil {
			t.Fatal(err)
		}
	}
	rewriteCandidateFixture(
		t,
		filepath.Join(versionRoot, "bangumi.sqlite"),
		filepath.Join(versionRoot, "manifest.json"),
	)
	store, err := archive.LoadCandidate(
		context.Background(),
		root,
		pointer.DataVersion,
	)
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

func rewriteCandidateFixture(t *testing.T, sqlitePath, manifestPath string) {
	t.Helper()
	database, err := sql.Open("sqlite", sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	result, err := database.Exec(
		`DELETE FROM catalog_capability
		  WHERE position_key = 'cast:anime:main'
		    AND capability = 'candidates'`,
	)
	if err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		_ = database.Close()
		t.Fatal(err)
	}
	if affected != 1 {
		_ = database.Close()
		t.Fatalf("removed candidates capabilities = %d, want 1", affected)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	sqliteBytes, err := os.ReadFile(sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	manifestBytes, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	tableCounts, ok := manifest["tableCounts"].(map[string]any)
	if !ok {
		t.Fatal("manifest tableCounts is missing")
	}
	capabilityCount, ok := tableCounts["catalog_capability"].(float64)
	if !ok || capabilityCount < 1 {
		t.Fatal("manifest catalog_capability count is invalid")
	}
	tableCounts["catalog_capability"] = capabilityCount - 1
	digest := sha256.Sum256(sqliteBytes)
	manifest["sqliteSize"] = len(sqliteBytes)
	manifest["sqliteDigest"] = fmt.Sprintf("sha256:%x", digest)
	updated, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	updated = append(updated, '\n')
	if err := os.WriteFile(manifestPath, updated, 0o644); err != nil {
		t.Fatal(err)
	}
}

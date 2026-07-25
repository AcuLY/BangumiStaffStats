package ranking

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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

func TestServiceExecutesGlobalArchiveQueryWithoutCollection(t *testing.T) {
	store := loadRankingArchive(t)
	var collectionCalls atomic.Int64
	service := newRankingService(t, store, CollectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		return runtimecache.CollectionSnapshot{}, nil
	}))

	result, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v cause=%v", err, failure.cause)
	}
	if collectionCalls.Load() != 0 {
		t.Fatalf("global collection calls = %d, want 0", collectionCalls.Load())
	}
	data, err := result.MarshalEnvelope("req-global")
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Data struct {
			Summary Summary      `json:"summary"`
			Items   []GlobalItem `json:"items"`
		} `json:"data"`
		Meta struct {
			DataVersion string `json:"dataVersion"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.Summary.PersonCount != 1 ||
		envelope.Data.Summary.WorkCount != 1 ||
		len(envelope.Data.Items) != 1 {
		t.Fatalf("unexpected global projection: %s", data)
	}
	row := envelope.Data.Items[0]
	if row.Person.ID != 100 || row.Person.Name != "Golden Director" ||
		row.WorkCount != 1 || row.Average == nil || *row.Average != 820 ||
		row.Overall == nil || *row.Overall != 553 {
		t.Fatalf("global row did not use statistics authority: %+v", row)
	}
	if strings.Contains(string(data), `"preference"`) ||
		strings.Contains(string(data), `"collection"`) {
		t.Fatalf("global-only fields leaked: %s", data)
	}
	if envelope.Meta.DataVersion != store.Identity().DataVersion {
		t.Fatalf("dataVersion = %q, want %q", envelope.Meta.DataVersion, store.Identity().DataVersion)
	}
}

func TestServicePersonalUsesAdmittedSnapshotAndCachesCoreAcrossViews(t *testing.T) {
	store := loadRankingArchive(t)
	var collectionCalls atomic.Int64
	fetchedAt := time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)
	service := newRankingService(t, store, CollectionProviderFunc(func(
		_ context.Context,
		uid string,
		subjectType string,
		statuses []string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		if uid != "Alice" || subjectType != "anime" ||
			len(statuses) != 1 || statuses[0] != "completed" {
			t.Fatalf("unexpected collection request: %q %q %v", uid, subjectType, statuses)
		}
		return runtimecache.CollectionSnapshot{Items: []runtimecache.CollectionItem{{
			SubjectID:   1,
			SubjectType: "anime",
			Status:      "completed",
			Rate:        9,
			Tags:        []string{},
			UpdatedAt:   fetchedAt,
		}}}, nil
	}))
	request := Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		View: json.RawMessage(`{"page":1,"pageSize":5}`),
	}
	first, err := service.Execute(context.Background(), request)
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("first Execute: %#v cause=%v", err, failure.cause)
	}
	request.View = json.RawMessage(`{"search":"golden","page":2,"pageSize":5}`)
	second, err := service.Execute(context.Background(), request)
	if err != nil {
		t.Fatal(err)
	}
	if collectionCalls.Load() != 1 {
		t.Fatalf("collection fetches = %d, want one admitted cached snapshot", collectionCalls.Load())
	}
	firstBytes, err := first.MarshalEnvelope("req-personal")
	if err != nil {
		t.Fatal(err)
	}
	secondBytes, err := second.MarshalEnvelope("req-personal-2")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(firstBytes), `"average":900`) ||
		!strings.Contains(string(firstBytes), `"overall":567`) ||
		!strings.Contains(string(firstBytes), `"collection"`) {
		t.Fatalf("personal projection did not use admitted rating: %s", firstBytes)
	}
	if !strings.Contains(string(secondBytes), `"items":[]`) ||
		!strings.Contains(string(secondBytes), `"total":1`) {
		t.Fatalf("out-of-range searched page is not a legal empty result: %s", secondBytes)
	}
}

func TestServiceRejectsSelectablePositionWithoutRankingsCapability(t *testing.T) {
	store := loadRankingArchive(t)
	service := newRankingService(t, store, nil)
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
	})
	failure, found := ErrorDetails(err)
	if !found ||
		failure.Code() != CodeCapabilityNotAvailable ||
		failure.Path() != "/query/positionKeys/0" ||
		failure.FieldCode() != string(CodeCapabilityNotAvailable) {
		t.Fatalf("capability error = %#v", err)
	}
}

func TestNormalizeViewAcceptsSchemaIntegerLexicalVariants(t *testing.T) {
	for _, testCase := range []struct {
		name     string
		raw      string
		wantPage int64
		wantSize int
	}{
		{
			name:     "decimal integers",
			raw:      `{"page":1.0,"pageSize":10.00}`,
			wantPage: 1,
			wantSize: 10,
		},
		{
			name:     "exponent integers",
			raw:      `{"page":5e0,"pageSize":2e1}`,
			wantPage: 5,
			wantSize: 20,
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			view, err := normalizeView(json.RawMessage(testCase.raw), "global")
			if err != nil {
				t.Fatal(err)
			}
			if view.Page != testCase.wantPage || view.PageSize != testCase.wantSize {
				t.Fatalf("view = %+v, want page=%d pageSize=%d", view, testCase.wantPage, testCase.wantSize)
			}
		})
	}
}

func TestProjectAssignsCompleteRanksBeforeSearchAndDoesNotMutateCore(t *testing.T) {
	average := int64(800)
	value := core{
		DataVersion: "dv1-" + strings.Repeat("a", 64),
		Scope:       "global",
		Summary:     Summary{PersonCount: 3, WorkUnit: "subject", WorkCount: 3},
		Rows: []rowCore{
			{
				Person:         PersonReference{ID: 3, Name: "Third"},
				WorkCount:      1,
				RatedUnitCount: 1,
				Average:        &average,
				Overall:        &average,
				SearchName:     "third",
			},
			{
				Person:         PersonReference{ID: 1, Name: "First"},
				WorkCount:      3,
				RatedUnitCount: 1,
				Average:        &average,
				Overall:        &average,
				SearchName:     "first",
			},
			{
				Person:         PersonReference{ID: 2, Name: "Second"},
				WorkCount:      2,
				RatedUnitCount: 1,
				Average:        &average,
				Overall:        &average,
				SearchName:     "second",
			},
		},
	}
	before := cloneCore(value)
	result, err := project(context.Background(), value, View{
		Search:   "second",
		Sort:     "count",
		Order:    "desc",
		Page:     1,
		PageSize: 10,
	}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.globalItems) != 1 || result.globalItems[0].Rank != 2 ||
		result.pagination.Total != 1 {
		t.Fatalf("rank-before-search result = %+v", result)
	}
	after, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	want, err := json.Marshal(before)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != string(want) {
		t.Fatal("view projection mutated immutable core")
	}
}

func newRankingService(
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

func loadRankingArchive(t *testing.T) *archive.Store {
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
	rewriteRankingFixture(
		t,
		filepath.Join(versionRoot, "bangumi.sqlite"),
		filepath.Join(versionRoot, "manifest.json"),
	)
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

func rewriteRankingFixture(t *testing.T, sqlitePath, manifestPath string) {
	t.Helper()
	database, err := sql.Open("sqlite", sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`UPDATE catalog_selection_rule
SET rule_key = 'rule:' || position_key,
    rule_value = replace(rule_value, 'positionId=', '')
WHERE rule_kind = 'exactStaff'`,
		`UPDATE catalog_selection_rule
SET rule_key = 'exclusive:cast:' || (
      SELECT subject_type
      FROM catalog_position
      WHERE catalog_position.position_key = catalog_selection_rule.position_key
    ),
    rule_value = replace(rule_value, 'roleType=', '')
WHERE rule_kind = 'exactCast'`,
	} {
		if _, err := database.Exec(statement); err != nil {
			_ = database.Close()
			t.Fatal(err)
		}
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

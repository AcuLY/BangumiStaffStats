package partners

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

func TestServiceExecutesGlobalPartnersWithoutCollection(t *testing.T) {
	store := loadPartnerArchive(t)
	var collectionCalls atomic.Int64
	service := newPartnerService(t, store, CollectionProviderFunc(func(
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
		Input: json.RawMessage(
			`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`,
		),
		View: json.RawMessage(`{"page":1e0,"pageSize":1.0e1}`),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v cause=%v", err, failure.cause)
	}
	if collectionCalls.Load() != 0 {
		t.Fatalf("global collection calls = %d", collectionCalls.Load())
	}
	data, err := result.MarshalEnvelope("req-partners-global")
	if err != nil {
		t.Fatalf("MarshalEnvelope: %v", err)
	}
	var envelope struct {
		Data struct {
			Source struct {
				Person  PersonReference `json:"person"`
				Metrics SourceMetrics   `json:"metrics"`
			} `json:"source"`
			Summary Summary `json:"summary"`
		} `json:"data"`
		Meta struct {
			DataVersion string     `json:"dataVersion"`
			Pagination  Pagination `json:"pagination"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.Source.Person.ID != 100 ||
		envelope.Data.Source.Metrics.WorkCount != 1 ||
		envelope.Data.Summary.PartnerCount != 0 ||
		len(envelope.Data.Summary.Leaders) != 3 ||
		envelope.Meta.DataVersion != store.Identity().DataVersion ||
		envelope.Meta.Pagination.Page != 1 ||
		envelope.Meta.Pagination.PageSize != 10 {
		t.Fatalf("projection = %s", data)
	}
	if strings.Contains(string(data), `"preference"`) ||
		strings.Contains(string(data), `"collection"`) {
		t.Fatalf("global leaked personal state: %s", data)
	}
}

func TestRequiredPersonReferenceIDsSelectsOnlyRawPartners(t *testing.T) {
	request := partnerBuildRequest(t, "global")
	ids := requiredPersonReferenceIDs(request.Query, request.Input)
	if !slices.Equal(ids, []int64{1, 2}) {
		t.Fatalf("required people = %v, want source and raw partner", ids)
	}
	castPosition := "cast:anime:main"
	request.Input.CandidatePositionKey = &castPosition
	ids = requiredPersonReferenceIDs(request.Query, request.Input)
	if !slices.Equal(ids, []int64{1, 2}) {
		t.Fatalf("filtered required people = %v", ids)
	}
}

func TestLoadPeopleReadsOnlyRequiredIDsAndChunks(t *testing.T) {
	const extraPeople = 1_205
	const firstExtraID int64 = 1_000_000
	store := loadPartnerArchiveWithExtraPeople(t, extraPeople)

	selected, err := loadPeople(
		context.Background(),
		store,
		[]int64{101, 100, 101},
	)
	if err != nil {
		t.Fatalf("load selected people: %v", err)
	}
	if len(selected) != 2 ||
		selected[0].ID != 100 ||
		selected[1].ID != 101 {
		t.Fatalf("unrelated people leaked: %+v", selected)
	}

	required := make([]int64, 0, extraPeople+4)
	for index := extraPeople - 1; index >= 0; index-- {
		required = append(required, firstExtraID+int64(index))
	}
	required = append(required, 101, 100, firstExtraID, 100)
	loaded, err := loadPeople(context.Background(), store, required)
	if err != nil {
		t.Fatalf("load chunked people: %v", err)
	}
	if len(loaded) != extraPeople+2 {
		t.Fatalf("chunked people count = %d, want %d", len(loaded), extraPeople+2)
	}
	for index, person := range loaded {
		switch index {
		case 0:
			if person.ID != 100 {
				t.Fatalf("first person = %+v", person)
			}
		case 1:
			if person.ID != 101 {
				t.Fatalf("second person = %+v", person)
			}
		default:
			wantID := firstExtraID + int64(index-2)
			if person.ID != wantID {
				t.Fatalf("person %d = %d, want %d", index, person.ID, wantID)
			}
		}
	}
}

func TestServiceMapsSourceIdentityAndEntityFailures(t *testing.T) {
	service := newPartnerService(t, loadPartnerArchive(t), nil)
	for _, testCase := range []struct {
		name     string
		personID int64
		code     Code
		path     string
	}{
		{
			name:     "existing person does not match identity",
			personID: 101,
			code:     CodeFieldInvalid,
			path:     "/input/source/positionKeys/0",
		},
		{
			name:     "source person does not exist",
			personID: 999999,
			code:     CodeEntityNotFound,
			path:     "/input/source/personId",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := service.Execute(context.Background(), Request{
				Query: json.RawMessage(
					`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2"]}`,
				),
				Input: json.RawMessage(fmt.Sprintf(
					`{"source":{"personId":%d,"positionKeys":["staff:anime:2"]}}`,
					testCase.personID,
				)),
			})
			failure, found := ErrorDetails(err)
			if !found || failure.Code() != testCase.code ||
				failure.Path() != testCase.path {
				t.Fatalf("failure = %#v", err)
			}
		})
	}
}

func TestServiceValidatesPartnersCapabilityForEveryQueryPosition(t *testing.T) {
	service := newPartnerService(t, loadPartnerArchive(t), nil)
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2","cast:anime:main"]}`,
		),
		Input: json.RawMessage(
			`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`,
		),
	})
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeCapabilityNotAvailable ||
		failure.Path() != "/query/positionKeys/1" {
		t.Fatalf("capability failure = %#v", err)
	}
}

func TestServicePersonalWithoutCollectionDependencyIsNotReady(t *testing.T) {
	service := newPartnerService(t, loadPartnerArchive(t), nil)
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["staff:anime:2"]}`,
		),
		Input: json.RawMessage(
			`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`,
		),
	})
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeNotReady || !failure.Retryable() {
		t.Fatalf("missing collection dependency = %#v", err)
	}
}

func TestServicePersonalCachesCollectionAndCoreAcrossViews(t *testing.T) {
	store := loadPartnerArchive(t)
	var collectionCalls atomic.Int64
	fetchedAt := time.Date(2026, 7, 25, 8, 0, 0, 0, time.UTC)
	service := newPartnerService(t, store, CollectionProviderFunc(func(
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
		Input: json.RawMessage(
			`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`,
		),
		View: json.RawMessage(`{"page":1,"pageSize":5}`),
	}
	first, err := service.Execute(context.Background(), request)
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("first Execute: %#v cause=%v", err, failure.cause)
	}
	request.View = json.RawMessage(`{"search":"nobody","page":2,"pageSize":5}`)
	second, err := service.Execute(context.Background(), request)
	if err != nil {
		t.Fatalf("second Execute: %v", err)
	}
	if collectionCalls.Load() != 1 || service.results.Stats().Hits < 1 {
		t.Fatalf(
			"cache behavior collection=%d result=%+v",
			collectionCalls.Load(),
			service.results.Stats(),
		)
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
		!strings.Contains(string(firstBytes), `"collection"`) ||
		!strings.Contains(string(secondBytes), `"items":[]`) {
		t.Fatalf("personal projections first=%s second=%s", firstBytes, secondBytes)
	}
}

func newPartnerService(
	t *testing.T,
	store *archive.Store,
	collections CollectionProvider,
) *Service {
	t.Helper()
	service, err := NewService(
		func() (*archive.Store, bool) { return store, store != nil },
		collections,
		DefaultConfig(),
	)
	if err != nil {
		t.Fatal(err)
	}
	return service
}

func loadPartnerArchive(t *testing.T) *archive.Store {
	t.Helper()
	return loadPartnerArchiveWithExtraPeople(t, 0)
}

func loadPartnerArchiveWithExtraPeople(
	t *testing.T,
	extraPeople int,
) *archive.Store {
	t.Helper()
	repositoryRoot := filepath.Clean(filepath.Join("..", "..", ".."))
	bundle := filepath.Join(repositoryRoot, "contracts", "goldens", "archive", "valid", "minimal")
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
		data, readErr := os.ReadFile(filepath.Join(bundle, source))
		if readErr != nil {
			t.Fatal(readErr)
		}
		if writeErr := os.WriteFile(filepath.Join(versionRoot, destination), data, 0o644); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	rewritePartnerFixture(
		t,
		filepath.Join(versionRoot, "bangumi.sqlite"),
		filepath.Join(versionRoot, "manifest.json"),
		extraPeople,
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

func rewritePartnerFixture(
	t *testing.T,
	sqlitePath string,
	manifestPath string,
	extraPeople int,
) {
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
		`INSERT INTO catalog_capability(position_key, capability, supported)
VALUES ('staff:anime:2', 'partners', 1)`,
	} {
		if _, err := database.Exec(statement); err != nil {
			_ = database.Close()
			t.Fatal(err)
		}
	}
	if extraPeople < 0 {
		_ = database.Close()
		t.Fatal("negative extra person count")
	}
	if extraPeople > 0 {
		transaction, err := database.Begin()
		if err != nil {
			_ = database.Close()
			t.Fatal(err)
		}
		statement, err := transaction.Prepare(
			`INSERT INTO person(person_id, name) VALUES (?, ?)`,
		)
		if err != nil {
			_ = transaction.Rollback()
			_ = database.Close()
			t.Fatal(err)
		}
		for index := 0; index < extraPeople; index++ {
			personID := int64(1_000_000 + index)
			if _, err := statement.Exec(
				personID,
				fmt.Sprintf("Extra Person %d", personID),
			); err != nil {
				_ = statement.Close()
				_ = transaction.Rollback()
				_ = database.Close()
				t.Fatal(err)
			}
		}
		if err := statement.Close(); err != nil {
			_ = transaction.Rollback()
			_ = database.Close()
			t.Fatal(err)
		}
		if err := transaction.Commit(); err != nil {
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
	tableCounts, ok := manifest["tableCounts"].(map[string]any)
	if !ok {
		t.Fatal("manifest tableCounts missing")
	}
	capabilityCount, ok := tableCounts["catalog_capability"].(float64)
	if !ok {
		t.Fatal("manifest catalog_capability count missing")
	}
	tableCounts["catalog_capability"] = capabilityCount + 1
	if extraPeople > 0 {
		personCount, ok := tableCounts["person"].(float64)
		if !ok {
			t.Fatal("manifest person count missing")
		}
		tableCounts["person"] = personCount + float64(extraPeople)
	}
	digest := sha256.Sum256(sqliteBytes)
	manifest["sqliteSize"] = len(sqliteBytes)
	manifest["sqliteDigest"] = fmt.Sprintf("sha256:%x", digest)
	updated, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, append(updated, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

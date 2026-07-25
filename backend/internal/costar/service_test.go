package costar

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

func TestServiceExecutesGlobalCoStarFromPublishedArchive(t *testing.T) {
	store := loadCoStarArchive(t)
	var collectionCalls atomic.Int64
	service := newCoStarService(t, store, CollectionProviderFunc(func(
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
			`{"scope":"global","subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
		Input: json.RawMessage(
			`{"participants":[{"personId":101,"positionKeys":["cast:anime:main"]},{"personId":102,"positionKeys":["cast:anime:main"]}]}`,
		),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v cause=%v", err, failureCause(failure))
	}
	if collectionCalls.Load() != 0 {
		t.Fatalf("global collection calls = %d", collectionCalls.Load())
	}
	data, err := result.MarshalEnvelope("req-co-star-global")
	if err != nil {
		t.Fatalf("MarshalEnvelope: %v", err)
	}
	var envelope struct {
		Data struct {
			Kind         string            `json:"kind"`
			Participants []ParticipantCore `json:"participants"`
			Summary      Summary           `json:"summary"`
			Items        []json.RawMessage `json:"items"`
		} `json:"data"`
		Meta struct {
			DataVersion string     `json:"dataVersion"`
			Pagination  Pagination `json:"pagination"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Data.Kind != "pair" ||
		len(envelope.Data.Participants) != 2 ||
		envelope.Data.Participants[0].Person.ID != 101 ||
		envelope.Data.Participants[1].Person.ID != 102 ||
		envelope.Data.Summary.CommonWorkCount != 1 ||
		len(envelope.Data.Items) != 1 ||
		envelope.Meta.DataVersion != store.Identity().DataVersion ||
		envelope.Meta.Pagination.Total != 1 {
		t.Fatalf("projection = %s", data)
	}
	if strings.Contains(string(data), `"preference"`) ||
		strings.Contains(string(data), `"collection"`) ||
		strings.Contains(string(data), `"matrix"`) {
		t.Fatalf("global pair leaked scope/topology state: %s", data)
	}
}

func TestServicePersonalWithoutCollectionDependencyIsNotReady(t *testing.T) {
	service := newCoStarService(t, loadCoStarArchive(t), nil)
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
		Input: json.RawMessage(
			`{"participants":[{"personId":101,"positionKeys":["cast:anime:main"]},{"personId":102,"positionKeys":["cast:anime:main"]}]}`,
		),
	})
	failure, found := ErrorDetails(err)
	if !found || failure.Code() != CodeNotReady || !failure.Retryable() {
		t.Fatalf("missing collection dependency = %#v", err)
	}
}

func TestServiceRejectsUnknownParticipantBeforeCollectionAcquisition(t *testing.T) {
	store := loadCoStarArchive(t)
	var collectionCalls atomic.Int64
	service := newCoStarService(t, store, CollectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		collectionCalls.Add(1)
		return runtimecache.CollectionSnapshot{}, nil
	}))
	_, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
		Input: json.RawMessage(
			`{"participants":[{"personId":999999,"positionKeys":["cast:anime:main"]},{"personId":101,"positionKeys":["cast:anime:main"]}]}`,
		),
	})
	failure, found := ErrorDetails(err)
	if !found ||
		failure.Code() != CodeEntityNotFound ||
		failure.Message() != "Participant person was not found." ||
		failure.Path() != "/input/participants/0/personId" ||
		failure.FieldCode() != "" ||
		failure.Retryable() ||
		failure.DataVersion() != store.Identity().DataVersion {
		t.Fatalf("unknown participant = %#v", err)
	}
	if collectionCalls.Load() != 0 {
		t.Fatalf("unknown participant collection calls = %d", collectionCalls.Load())
	}
}

func TestServicePersonalFreshCollectionMarshalsEmptyWarningArray(t *testing.T) {
	store := loadCoStarArchive(t)
	service := newCoStarService(t, store, CollectionProviderFunc(func(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error) {
		return runtimecache.CollectionSnapshot{
			Items: []runtimecache.CollectionItem{{
				SubjectID:   1,
				SubjectType: "anime",
				Status:      "completed",
				Rate:        9,
				UpdatedAt: time.Date(
					2025,
					time.January,
					2,
					3,
					4,
					5,
					0,
					time.UTC,
				),
			}},
		}, nil
	}))
	result, err := service.Execute(context.Background(), Request{
		Query: json.RawMessage(
			`{"scope":"personal","uid":"Alice","collectionStatuses":["completed"],"subjectType":"anime","positionKeys":["cast:anime:main"]}`,
		),
		Input: json.RawMessage(
			`{"participants":[{"personId":101,"positionKeys":["cast:anime:main"]},{"personId":102,"positionKeys":["cast:anime:main"]}]}`,
		),
	})
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("Execute: %#v cause=%v", err, failureCause(failure))
	}
	if result.Collection == nil ||
		result.Collection.Stale ||
		result.Collection.WarningCodes == nil ||
		len(result.Collection.WarningCodes) != 0 {
		t.Fatalf("fresh collection = %#v", result.Collection)
	}
	data, err := result.MarshalEnvelope("req-co-star-personal-fresh")
	if err != nil {
		t.Fatalf("MarshalEnvelope: %v", err)
	}
	var envelope struct {
		Meta struct {
			Collection struct {
				Stale        bool            `json:"stale"`
				WarningCodes json.RawMessage `json:"warningCodes"`
			} `json:"collection"`
		} `json:"meta"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.Collection.Stale ||
		string(envelope.Meta.Collection.WarningCodes) != "[]" {
		t.Fatalf("fresh collection envelope = %s", data)
	}
}

func TestProjectCollectionFreshnessCanonicalizesStaleWarning(t *testing.T) {
	fresh := projectCollectionFreshness(runtimecache.CollectionAccess{
		WarningCodes: []string{runtimecache.CollectionStaleWarning},
	})
	if fresh.Stale ||
		fresh.WarningCodes == nil ||
		len(fresh.WarningCodes) != 0 {
		t.Fatalf("fresh = %#v", fresh)
	}
	stale := projectCollectionFreshness(runtimecache.CollectionAccess{
		Stale:        true,
		WarningCodes: []string{"unexpected", "duplicates"},
	})
	if !stale.Stale ||
		len(stale.WarningCodes) != 1 ||
		stale.WarningCodes[0] != runtimecache.CollectionStaleWarning {
		t.Fatalf("stale = %#v", stale)
	}
}

func newCoStarService(
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

func loadCoStarArchive(t *testing.T) *archive.Store {
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
		data, readErr := os.ReadFile(filepath.Join(bundle, source))
		if readErr != nil {
			t.Fatal(readErr)
		}
		if writeErr := os.WriteFile(
			filepath.Join(versionRoot, destination),
			data,
			0o644,
		); writeErr != nil {
			t.Fatal(writeErr)
		}
	}
	normalizeCoStarFixture(
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

func normalizeCoStarFixture(
	t *testing.T,
	sqlitePath string,
	manifestPath string,
) {
	t.Helper()
	database, err := sql.Open("sqlite", sqlitePath)
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range []string{
		`UPDATE cast_credit
SET role_type = 1
WHERE subject_type = 'anime' AND person_id = 102`,
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
	if err := os.WriteFile(manifestPath, append(updated, '\n'), 0o644); err != nil {
		t.Fatal(err)
	}
}

func failureCause(failure *Error) error {
	if failure == nil {
		return nil
	}
	return failure.cause
}

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
	trace := querytiming.New()
	result, err := service.Execute(querytiming.WithContext(context.Background(), trace), Request{
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
	assertGlobalServiceTiming(t, trace.Freeze())
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

func TestLoadArchiveEvidenceContributesCompleteSQLiteOutcome(t *testing.T) {
	store := loadCoStarArchive(t)
	trace := querytiming.New()
	if err := trace.ObserveSQLite(
		querytiming.DependencySuccess,
		13*time.Millisecond,
	); err != nil {
		t.Fatal(err)
	}
	before, present := trace.CurrentPhase(querytiming.PhaseSQLite)
	if !present {
		t.Fatal("baseline SQLite phase is absent")
	}
	evidence, err := loadArchiveEvidence(
		querytiming.WithContext(context.Background(), trace),
		store,
		"anime",
		[]PersonReference{{ID: 101, Name: "Person 101"}},
		[]int64{1},
		[]int64{200},
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(evidence.People) != 1 ||
		len(evidence.Subjects) != 1 ||
		evidence.Subjects[0].ID != 1 ||
		len(evidence.Characters) != 1 ||
		evidence.Characters[0].ID == nil ||
		*evidence.Characters[0].ID != 200 {
		t.Fatalf("evidence = %#v", evidence)
	}
	success := trace.Freeze()
	after, present := success.Phase(querytiming.PhaseSQLite)
	if !present ||
		after <= before ||
		success.SQLiteOutcome() != querytiming.DependencySuccess {
		t.Fatalf(
			"success SQLite = before %f, after %f, present %t, outcome %q",
			before,
			after,
			present,
			success.SQLiteOutcome(),
		)
	}

	closedStore := loadCoStarArchive(t)
	if err := closedStore.Close(); err != nil {
		t.Fatal(err)
	}
	errorTrace := querytiming.New()
	_, err = loadArchiveEvidence(
		querytiming.WithContext(context.Background(), errorTrace),
		closedStore,
		"anime",
		nil,
		[]int64{1},
		nil,
	)
	if err == nil {
		t.Fatal("closed Archive evidence load succeeded")
	}
	failed := errorTrace.Freeze()
	if duration, present := failed.Phase(querytiming.PhaseSQLite); !present ||
		duration <= 0 ||
		failed.SQLiteOutcome() != querytiming.DependencyError {
		t.Fatalf(
			"error SQLite = %f, %t, %q",
			duration,
			present,
			failed.SQLiteOutcome(),
		)
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
	result, err := database.Exec(
		`UPDATE cast_credit
SET role_type = 1
WHERE subject_type = 'anime' AND person_id = 102`,
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
		t.Fatalf("updated co-star credits = %d, want 1", affected)
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

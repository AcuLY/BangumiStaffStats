package app

import (
	"context"
	"database/sql"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestMaintenanceGateWaitsForCompleteHandlerAndIdleExecutor(t *testing.T) {
	gate := new(maintenanceGate)
	handlerStarted := make(chan struct{})
	releaseHandler := make(chan struct{})
	handler := gate.Wrap(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		close(handlerStarted)
		<-releaseHandler
	}))
	handlerDone := make(chan struct{})
	go func() {
		defer close(handlerDone)
		handler.ServeHTTP(
			httptest.NewRecorder(),
			httptest.NewRequest(http.MethodGet, "/readyz", nil),
		)
	}()
	<-handlerStarted

	var idle atomic.Bool
	maintenanceDone := make(chan error, 1)
	go func() {
		maintenanceDone <- gate.exclusive(
			context.Background(),
			idle.Load,
			func() error { return nil },
		)
	}()
	select {
	case err := <-maintenanceDone:
		t.Fatalf("maintenance passed active handler: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	close(releaseHandler)
	<-handlerDone
	select {
	case err := <-maintenanceDone:
		t.Fatalf("maintenance ignored busy executor: %v", err)
	case <-time.After(25 * time.Millisecond):
	}
	idle.Store(true)
	select {
	case err := <-maintenanceDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(time.Second):
		t.Fatal("maintenance did not finish after handler/executor drained")
	}
}

func TestActivateCandidateSwapsWithoutListenerRestartAndCleansOld(t *testing.T) {
	root := arrangeArchive(t)
	var current struct {
		DataVersion string `json:"dataVersion"`
	}
	pointerPath := filepath.Join(root, "current.json")
	oldPointer, err := os.ReadFile(pointerPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(oldPointer, &current); err != nil {
		t.Fatal(err)
	}
	newVersion := "dv1-" + strings.Repeat("b", 64)
	oldVersionRoot := filepath.Join(root, "versions", current.DataVersion)
	newVersionRoot := filepath.Join(root, "versions", newVersion)
	if err := os.MkdirAll(newVersionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	newSQLite := filepath.Join(newVersionRoot, "bangumi.sqlite")
	copyArchiveTestFile(t, filepath.Join(oldVersionRoot, "bangumi.sqlite"), newSQLite)
	dsn := (&url.URL{Scheme: "file", Path: "/" + filepath.ToSlash(newSQLite)}).String()
	database, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := database.Exec(
		"UPDATE archive_meta SET data_version = ? WHERE singleton = 1",
		newVersion,
	); err != nil {
		database.Close()
		t.Fatal(err)
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}

	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	oldStore, ready := state.Current()
	if !ready {
		t.Fatal("old Store not ready")
	}
	candidate, err := archive.OpenVersion(context.Background(), root, newVersion)
	if err != nil {
		t.Fatal(err)
	}
	runtime := testRuntimeObservability(t, io.Discard)
	if err := runtime.SetReadiness(true, current.DataVersion); err != nil {
		t.Fatal(err)
	}
	newPointer := []byte(`{"pointerSchemaVersion":1,"dataVersion":"` +
		newVersion + `","manifestDigest":"sha256:` + strings.Repeat("0", 64) + `"}`)
	err = activateCandidate(
		context.Background(),
		new(maintenanceGate),
		state,
		func() bool { return true },
		runtime,
		ArchiveActivation{
			Candidate: candidate,
			CommitPointer: func(context.Context) error {
				return os.WriteFile(pointerPath, newPointer, 0o644)
			},
			RollbackPointer: func(context.Context) error {
				return os.WriteFile(pointerPath, oldPointer, 0o644)
			},
			Cleanup: func(context.Context) error {
				return os.RemoveAll(oldVersionRoot)
			},
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if version, err := readinessProbe(state)(context.Background()); err != nil ||
		version != newVersion {
		t.Fatalf("ready version = %q, err = %v", version, err)
	}
	if _, err := oldStore.QueryContext(context.Background(), readinessQuery); err == nil {
		t.Fatal("old Store remained queryable")
	}
	if _, err := os.Stat(oldVersionRoot); !os.IsNotExist(err) {
		t.Fatalf("old version still exists: %v", err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestActivateCandidatePointerFailureRestoresOldStore(t *testing.T) {
	root := arrangeArchive(t)
	state := new(archive.State)
	if err := state.OpenCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	oldStore, ready := state.Current()
	if !ready {
		t.Fatal("old Store not ready")
	}
	candidate, err := archive.OpenVersion(
		context.Background(),
		root,
		oldStore.Identity().DataVersion,
	)
	if err != nil {
		t.Fatal(err)
	}
	runtime := testRuntimeObservability(t, io.Discard)
	if err := runtime.SetReadiness(true, oldStore.Identity().DataVersion); err != nil {
		t.Fatal(err)
	}
	pointerFailure := context.DeadlineExceeded
	err = activateCandidate(
		context.Background(),
		new(maintenanceGate),
		state,
		func() bool { return true },
		runtime,
		ArchiveActivation{
			Candidate: candidate,
			CommitPointer: func(context.Context) error {
				return pointerFailure
			},
		},
	)
	if err == nil || !strings.Contains(err.Error(), pointerFailure.Error()) {
		t.Fatalf("activation error = %v", err)
	}
	if current, currentReady := state.Current(); !currentReady || current != oldStore {
		t.Fatalf("current = %p, ready = %v", current, currentReady)
	}
	if _, err := candidate.QueryContext(context.Background(), readinessQuery); err == nil {
		t.Fatal("failed candidate remained open")
	}
	if version, err := readinessProbe(state)(context.Background()); err != nil ||
		version != oldStore.Identity().DataVersion {
		t.Fatalf("restored version = %q, err = %v", version, err)
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
}

package archive

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCurrentPointerIsReadExactlyOnce(t *testing.T) {
	root, _ := arrangeValidCandidate(t, true)
	store, err := loadCurrentCandidate(
		context.Background(),
		root,
		loadHooks{
			afterPointerRead: func() {
				if err := os.WriteFile(
					filepath.Join(root, currentPointerFilename),
					[]byte(`{"pointerSchemaVersion":1}`),
					0o644,
				); err != nil {
					t.Fatalf("replace pointer: %v", err)
				}
			},
		},
	)
	if err != nil {
		t.Fatalf("current selector re-read pointer: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestCancellationBeforeAndDuringLoad(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, true)
	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := LoadCandidate(canceled, root, dataVersion)
	requireCode(t, err, CodeArchiveContextCanceled)

	ctx, cancelDuring := context.WithCancel(context.Background())
	store, err := loadCurrentCandidate(
		ctx,
		root,
		loadHooks{afterPointerRead: cancelDuring},
	)
	if store != nil {
		store.Close()
		t.Fatal("canceled load returned store")
	}
	requireCode(t, err, CodeArchiveContextCanceled)

	finalContext, cancelFinal := context.WithCancel(context.Background())
	store, err = loadCandidate(
		finalContext,
		root,
		dataVersion,
		loadHooks{beforeFinalFileCheck: cancelFinal},
	)
	if store != nil {
		store.Close()
		t.Fatal("final-hook cancellation returned a store")
	}
	requireCode(t, err, CodeArchiveContextCanceled)
}

func TestFinalContextGateClosesCandidateBeforePublication(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	candidate, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	canceled, cancel := context.WithCancel(context.Background())
	cancel()

	state := new(State)
	requireCode(t, state.publishCurrent(canceled, candidate), CodeArchiveContextCanceled)
	if state.Ready() {
		t.Fatal("canceled candidate published readiness")
	}
	if err := candidate.db.Ping(); err == nil {
		t.Fatal("canceled candidate remained open")
	}
}

func TestCancellationWhileWaitingForPublicationLockClosesCandidate(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	candidate, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	state := new(State)
	state.mu.Lock()
	started := make(chan struct{})
	published := make(chan error, 1)
	go func() {
		close(started)
		published <- state.publishCurrent(ctx, candidate)
	}()
	<-started
	cancel()
	state.mu.Unlock()

	requireCode(t, <-published, CodeArchiveContextCanceled)
	if state.Ready() {
		t.Fatal("candidate canceled while waiting for publication lock became ready")
	}
	if err := candidate.db.Ping(); err == nil {
		t.Fatal("candidate canceled while waiting for publication lock remained open")
	}
}

func TestPublicationRejectsNilCandidate(t *testing.T) {
	state := new(State)
	requireCode(t, state.publish(nil), CodeArchiveFileInvalid)

	canceled, cancel := context.WithCancel(context.Background())
	cancel()
	requireCode(t, state.publishCurrent(canceled, nil), CodeArchiveFileInvalid)
}

func TestSingleAssignmentPublicationRaceClosesLosers(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	const candidatesCount = 8
	candidates := make([]*Store, 0, candidatesCount)
	for range candidatesCount {
		store, err := LoadCandidate(context.Background(), root, dataVersion)
		if err != nil {
			t.Fatal(err)
		}
		candidates = append(candidates, store)
	}

	state := new(State)
	var successes atomic.Int64
	var failures atomic.Int64
	var wait sync.WaitGroup
	for _, candidate := range candidates {
		wait.Add(1)
		go func(candidate *Store) {
			defer wait.Done()
			err := state.publish(candidate)
			if err == nil {
				successes.Add(1)
				return
			}
			code, ok := ErrorCode(err)
			if !ok || code != CodeArchiveAlreadyPublished {
				t.Errorf("publish error = %v, code = %q", err, code)
			}
			failures.Add(1)
		}(candidate)
	}
	wait.Wait()
	if successes.Load() != 1 || failures.Load() != candidatesCount-1 {
		t.Fatalf("publication results = %d success, %d failures", successes.Load(), failures.Load())
	}

	winner, ready := state.Current()
	if !ready {
		t.Fatal("winner did not publish")
	}
	for _, candidate := range candidates {
		if candidate == winner {
			continue
		}
		if err := candidate.db.Ping(); err == nil {
			t.Fatal("losing candidate remained open")
		}
	}
	if err := state.Close(); err != nil {
		t.Fatal(err)
	}
	if state.Ready() {
		t.Fatal("close did not clear readiness")
	}
	if err := winner.db.Ping(); err == nil {
		t.Fatal("winner remained open after shutdown")
	}
}

func TestPublicationAndShutdownRaceLeavesNothingReady(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	for range 20 {
		candidate, err := LoadCandidate(context.Background(), root, dataVersion)
		if err != nil {
			t.Fatal(err)
		}
		state := new(State)
		var wait sync.WaitGroup
		wait.Add(2)
		go func() {
			defer wait.Done()
			err := state.publish(candidate)
			if err != nil {
				code, ok := ErrorCode(err)
				if !ok || code != CodeArchiveAlreadyPublished {
					t.Errorf("publish error = %v, code = %q", err, code)
				}
			}
		}()
		go func() {
			defer wait.Done()
			if err := state.Close(); err != nil {
				t.Errorf("close state: %v", err)
			}
		}()
		wait.Wait()
		if state.Ready() {
			t.Fatal("state ready after shutdown race")
		}
		if err := candidate.db.Ping(); err == nil {
			t.Fatal("candidate remained open after shutdown race")
		}
	}
}

func TestConcurrentReadsAndRepeatedClose(t *testing.T) {
	root, _ := arrangeValidCandidate(t, true)
	state := new(State)
	if err := state.LoadCurrent(context.Background(), root); err != nil {
		t.Fatal(err)
	}
	store, ready := state.Current()
	if !ready {
		t.Fatal("state not ready")
	}

	var wait sync.WaitGroup
	for range 100 {
		wait.Add(1)
		go func() {
			defer wait.Done()
			var count int64
			if err := scanOne(store, "SELECT COUNT(*) FROM subject", &count); err != nil {
				t.Errorf("concurrent read: %v", err)
			}
			if count != 8 {
				t.Errorf("subject count = %d", count)
			}
		}()
	}
	wait.Wait()
	if stats := store.db.Stats(); stats.OpenConnections > 4 {
		t.Fatalf("pool opened %d connections", stats.OpenConnections)
	}

	for range 10 {
		if err := state.Close(); err != nil {
			t.Fatal(err)
		}
	}
	if state.Ready() {
		t.Fatal("repeated close left state ready")
	}
}

func TestStoreCloseWaitsForActiveRowsBeforeReleasingVFS(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	rows, err := store.QueryContext(
		context.Background(),
		"SELECT subject_id FROM subject ORDER BY subject_id",
	)
	if err != nil {
		store.Close()
		t.Fatal(err)
	}
	defer func() {
		_ = rows.Close()
		_ = store.Close()
	}()
	if !rows.Next() {
		t.Fatalf("query returned no first row: %v", rows.Err())
	}
	var firstID int64
	if err := rows.Scan(&firstID); err != nil {
		t.Fatal(err)
	}

	closeStarted := make(chan struct{})
	closeDone := make(chan error, 1)
	go func() {
		close(closeStarted)
		closeDone <- store.Close()
	}()
	<-closeStarted
	deadline := time.Now().Add(2 * time.Second)
	for {
		store.queryMu.Lock()
		closing := store.closing
		store.queryMu.Unlock()
		if closing {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("Store.Close did not enter the closing state")
		}
		runtime.Gosched()
	}
	select {
	case err := <-closeDone:
		t.Fatalf("Store.Close returned while rows were active: %v", err)
	default:
	}
	rejectedRows, queryErr := store.QueryContext(context.Background(), "SELECT 1")
	if rejectedRows != nil {
		rejectedRows.Close()
		t.Fatal("Store accepted a new query while closing")
	}
	if !errors.Is(queryErr, sql.ErrConnDone) {
		t.Fatalf("query during close error = %v, want sql.ErrConnDone", queryErr)
	}

	rowCount := 1
	for rows.Next() {
		var subjectID int64
		if err := rows.Scan(&subjectID); err != nil {
			t.Fatal(err)
		}
		rowCount++
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	if rowCount != 8 {
		t.Fatalf("rows read during close = %d, want 8", rowCount)
	}
	if err := rows.Close(); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-closeDone:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Store.Close did not finish after rows closed")
	}
}

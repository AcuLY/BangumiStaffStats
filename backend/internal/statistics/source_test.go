package statistics

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestLoadSeriesIndexRejectsNilAndCancellation(t *testing.T) {
	if _, err := LoadSeriesIndex(context.Background(), nil); errorCodeOrEmpty(err) != CodeInputInvalid {
		t.Fatalf("nil Store error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := LoadSeriesIndex(ctx, nil); errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("canceled load error = %v", err)
	}
}

func TestSeriesSourceQueriesRemainFixedReads(t *testing.T) {
	for _, query := range []string{selectSeriesSubjects, selectSeriesRelations} {
		normalized := strings.ToUpper(strings.TrimSpace(query))
		if !strings.HasPrefix(normalized, "SELECT ") ||
			strings.Contains(query, ";") ||
			strings.Contains(normalized, " INSERT ") ||
			strings.Contains(normalized, " UPDATE ") ||
			strings.Contains(normalized, " DELETE ") {
			t.Fatalf("source query is not a fixed read: %q", query)
		}
	}
}

func TestLoadSeriesIndexCachesOneImmutableResultPerStore(t *testing.T) {
	store := openSeriesCacheTestStore(t)
	seriesIndexes.Delete(store)

	const callers = 8
	start := make(chan struct{})
	results := make(chan *SeriesIndex, callers)
	errors := make(chan error, callers)
	var wait sync.WaitGroup
	for range callers {
		wait.Add(1)
		go func() {
			defer wait.Done()
			<-start
			index, err := LoadSeriesIndex(context.Background(), store)
			results <- index
			errors <- err
		}()
	}
	close(start)
	wait.Wait()
	close(results)
	close(errors)

	for err := range errors {
		if err != nil {
			t.Fatal(err)
		}
	}
	var first *SeriesIndex
	for index := range results {
		if first == nil {
			first = index
		}
		if index == nil || index != first {
			t.Fatalf("cached index identity = %p, want %p", index, first)
		}
	}
	again, err := LoadSeriesIndex(context.Background(), store)
	if err != nil || again != first {
		t.Fatalf("sequential cache result = %p, %v; want %p", again, err, first)
	}
}

func TestCanceledSeriesIndexLoadDoesNotPoisonCache(t *testing.T) {
	store := openSeriesCacheTestStore(t)
	seriesIndexes.Delete(store)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := LoadSeriesIndex(ctx, store); errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("canceled load error = %v", err)
	}
	if _, found := seriesIndexes.Load(store); found {
		t.Fatal("canceled load populated cache")
	}
	if _, err := LoadSeriesIndex(context.Background(), store); err != nil {
		t.Fatalf("retry after cancellation: %v", err)
	}
}

func openSeriesCacheTestStore(t *testing.T) *archive.Store {
	t.Helper()
	bundle := filepath.Join(
		statisticsGoldenRoot(t),
		"..",
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
	sqliteBytes, err := os.ReadFile(filepath.Join(bundle, "bangumi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(versionRoot, "bangumi.sqlite"), sqliteBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := archive.OpenVersion(context.Background(), root, pointer.DataVersion)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		seriesIndexes.Delete(store)
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	return store
}

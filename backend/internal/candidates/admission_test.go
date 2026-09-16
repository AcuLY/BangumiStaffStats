package candidates

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestUnrestrictedFactsRequireResultAdmission(t *testing.T) {
	store := poisonedOperationArchive(t)
	cb, _ := ResultBinding()
	pb, _ := partners.ResultBinding()
	sb, _ := costar.ResultBinding()
	db, _ := persondetail.ResultBinding()
	config := runtimecache.DefaultQueryRuntimeConfig()
	qr, err := runtimecache.NewQueryRuntime(config, cb, pb, sb, db)
	if err != nil {
		t.Fatal(err)
	}
	provider := func() (*archive.Store, bool) { return store, true }
	c, _ := NewServiceWithRuntime(provider, nil, qr)
	p, _ := partners.NewServiceWithRuntime(provider, nil, qr)
	s, _ := costar.NewServiceWithRuntime(provider, nil, qr)
	d, _ := persondetail.NewServiceWithRuntime(provider, nil, qr)
	release := make(chan struct{})
	var wg sync.WaitGroup
	defer func() { close(release); wg.Wait() }()
	for i := 0; i < 10; i++ {
		key, err := runtimecache.NewGlobalResultKey(runtimecache.OperationCandidatesV1, store.Identity().DataVersion, fmt.Sprintf("q1:%064x", i), runtimecache.DigestInput([]byte("block")))
		if err != nil {
			t.Fatal(err)
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = c.results.GetOrBuild(context.Background(), key, func(context.Context) (Core, error) { <-release; return Core{}, nil })
		}()
		deadline := time.Now().Add(5 * time.Second)
		for {
			stats := qr.Stats().Executor
			if stats.Running+stats.Queued == int64(i+1) {
				break
			}
			if time.Now().After(deadline) {
				t.Fatal(stats)
			}
			runtime.Gosched()
		}
	}
	q := json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`)
	cases := []struct {
		name string
		run  func() error
	}{
		{"candidates", func() error {
			_, e := c.Execute(context.Background(), Request{Query: q, Input: json.RawMessage(`{"positionKey":null}`)})
			return e
		}},
		{"partners", func() error {
			_, e := p.Execute(context.Background(), partners.Request{Query: q, Input: json.RawMessage(`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`)})
			return e
		}},
		{"costar", func() error {
			_, e := s.Execute(context.Background(), costar.Request{Query: q, Input: json.RawMessage(`{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:all"]}]}`)})
			return e
		}},
		{"detail", func() error {
			_, e := d.Execute(context.Background(), persondetail.Request{Query: q, Input: json.RawMessage(`{"personId":100,"positionKeys":["staff:anime:2"]}`)})
			return e
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := tc.run()
			if err == nil || !strings.Contains(err.Error(), "SERVER_BUSY") {
				t.Fatalf("factual read escaped full 2-running/8-queued executor: %v", err)
			}
		})
	}
	stats := qr.Stats().Executor
	if stats.Running != 2 || stats.Queued != 8 || stats.Started != 2 || stats.Rejected != 4 {
		t.Fatalf("admission stats: %+v", stats)
	}
}

func poisonedOperationArchive(t *testing.T) *archive.Store {
	t.Helper()
	bundle := filepath.Join("..", "..", "..", "contracts", "goldens", "archive", "valid", "minimal")
	data, err := os.ReadFile(filepath.Join(bundle, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(data, &pointer); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	dir := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(filepath.Join(bundle, "bangumi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "bangumi.sqlite")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`DROP TABLE staff_credit`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := archive.OpenVersion(context.Background(), root, pointer.DataVersion)
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

func TestUnrestrictedResultHitsDoNotReadFacts(t *testing.T) {
	healthy := loadCandidateArchive(t)
	poisoned := poisonedOperationArchive(t)
	store := healthy
	cb, _ := ResultBinding()
	pb, _ := partners.ResultBinding()
	sb, _ := costar.ResultBinding()
	db, _ := persondetail.ResultBinding()
	qr, err := runtimecache.NewQueryRuntime(runtimecache.DefaultQueryRuntimeConfig(), cb, pb, sb, db)
	if err != nil {
		t.Fatal(err)
	}
	provider := func() (*archive.Store, bool) { return store, true }
	c, _ := NewServiceWithRuntime(provider, nil, qr)
	p, _ := partners.NewServiceWithRuntime(provider, nil, qr)
	s, _ := costar.NewServiceWithRuntime(provider, nil, qr)
	d, _ := persondetail.NewServiceWithRuntime(provider, nil, qr)
	q := json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`)
	cases := []struct {
		name string
		run  func() error
	}{
		{"candidates", func() error {
			_, e := c.Execute(context.Background(), Request{Query: q, Input: json.RawMessage(`{"positionKey":null}`)})
			return e
		}},
		{"partners", func() error {
			_, e := p.Execute(context.Background(), partners.Request{Query: q, Input: json.RawMessage(`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`)})
			return e
		}},
		{"costar", func() error {
			_, e := s.Execute(context.Background(), costar.Request{Query: q, Input: json.RawMessage(`{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:all"]}]}`)})
			return e
		}},
		{"detail", func() error {
			_, e := d.Execute(context.Background(), persondetail.Request{Query: q, Input: json.RawMessage(`{"personId":100,"positionKeys":["staff:anime:2"]}`)})
			return e
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			store = healthy
			if err := tc.run(); err != nil {
				t.Fatalf("warm result: %v", err)
			}
			before := qr.Stats()
			store = poisoned
			if err := tc.run(); err != nil {
				t.Fatalf("result hit read poisoned facts: %v", err)
			}
			after := qr.Stats()
			if after.Executor.Started != before.Executor.Started || after.Result.Hits <= before.Result.Hits {
				t.Fatalf("not a result-only hit: before=%+v after=%+v", before, after)
			}
		})
	}
}

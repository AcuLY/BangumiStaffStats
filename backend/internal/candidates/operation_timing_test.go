package candidates

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

var operationTimingQueries = []struct{ name, raw string }{
	{"ordinary", `{"scope":"global","subjectType":"anime","positionKeys":["staff:anime:2","cast:anime:all"]}`},
	{"unrestricted", `{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`},
}

func TestLoadOperationAuthorityObservesFactLoad(t *testing.T) {
	for _, q := range operationTimingQueries {
		for _, poisoned := range []bool{false, true} {
			name := q.name + "/success"
			if poisoned {
				name = q.name + "/error"
			}
			t.Run(name, func(t *testing.T) {
				var store *archive.Store
				if poisoned {
					store = poisonedOperationArchive(t)
				} else {
					store = loadCandidateArchive(t)
				}
				// No trace during catalog preparation: only the helper can observe SQLite.
				catalog, err := loadCatalogAuthority(context.Background(), store)
				if err != nil {
					t.Fatal(err)
				}
				normalized, err := query.NormalizeOperation([]byte(q.raw), catalog.Context, "query")
				if err != nil {
					t.Fatal(err)
				}
				trace := querytiming.New()
				ctx := querytiming.WithContext(context.Background(), trace)
				calls := 0
				var observedError error
				got, err := query.LoadOperationAuthority(ctx, store, normalized, catalog.Context, catalog.CandidatesByPosition, "query", func(duration time.Duration, err error) {
					calls++
					observedError = err
					querytiming.ObserveSQLiteFromContext(ctx, duration, err)
				})
				if calls != 1 || observedError != err {
					t.Fatalf("observations = %d, error = %v, want exactly one with %v", calls, observedError, err)
				}
				want := querytiming.DependencySuccess
				if poisoned {
					want = querytiming.DependencyError
					if err == nil || !strings.Contains(err.Error(), "staff_credit") {
						t.Fatalf("expected poisoned fact read, got %v", err)
					}
					if len(got.Facts.Subjects) != 0 {
						t.Fatal("failed load published partial facts")
					}
				} else if err != nil || len(got.Facts.Subjects) == 0 {
					t.Fatalf("healthy facts: %+v, %v", got, err)
				}
				seconds, present := trace.CurrentPhase(querytiming.PhaseSQLite)
				if !present || seconds <= 0 {
					t.Errorf("fact-load SQLite timing = %g, present=%v", seconds, present)
				}
				if got := trace.Freeze().SQLiteOutcome(); got != want {
					t.Errorf("SQLite outcome = %s, want %s", got, want)
				}
				unobserved, unobservedError := query.LoadOperationAuthority(context.Background(), store, normalized, catalog.Context, catalog.CandidatesByPosition, "query", nil)
				if (unobservedError != nil) != poisoned || len(unobserved.Facts.Subjects) != len(got.Facts.Subjects) {
					t.Fatalf("nil observer changed fact loading: %+v, %v", unobserved, unobservedError)
				}
			})
		}
	}
}

func TestOperationFactFailureOverridesCatalogSQLiteSuccess(t *testing.T) {
	store := poisonedOperationArchive(t)
	cb, err := ResultBinding()
	if err != nil {
		t.Fatal(err)
	}
	pb, err := partners.ResultBinding()
	if err != nil {
		t.Fatal(err)
	}
	sb, err := costar.ResultBinding()
	if err != nil {
		t.Fatal(err)
	}
	db, err := persondetail.ResultBinding()
	if err != nil {
		t.Fatal(err)
	}
	qr, err := runtimecache.NewQueryRuntime(runtimecache.DefaultQueryRuntimeConfig(), cb, pb, sb, db)
	if err != nil {
		t.Fatal(err)
	}
	provider := func() (*archive.Store, bool) { return store, true }
	c, err := NewServiceWithRuntime(provider, nil, qr)
	if err != nil {
		t.Fatal(err)
	}
	p, err := partners.NewServiceWithRuntime(provider, nil, qr)
	if err != nil {
		t.Fatal(err)
	}
	s, err := costar.NewServiceWithRuntime(provider, nil, qr)
	if err != nil {
		t.Fatal(err)
	}
	d, err := persondetail.NewServiceWithRuntime(provider, nil, qr)
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range operationTimingQueries {
		cases := []struct {
			name string
			run  func(context.Context) error
		}{
			{"candidates", func(ctx context.Context) error {
				_, err := c.Execute(ctx, Request{Query: json.RawMessage(q.raw), Input: json.RawMessage(`{"positionKey":null}`)})
				return err
			}},
			{"partners", func(ctx context.Context) error {
				_, err := p.Execute(ctx, partners.Request{Query: json.RawMessage(q.raw), Input: json.RawMessage(`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`)})
				return err
			}},
			{"costar", func(ctx context.Context) error {
				_, err := s.Execute(ctx, costar.Request{Query: json.RawMessage(q.raw), Input: json.RawMessage(`{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:all"]}]}`)})
				return err
			}},
			{"detail", func(ctx context.Context) error {
				_, err := d.Execute(ctx, persondetail.Request{Query: json.RawMessage(q.raw), Input: json.RawMessage(`{"personId":100,"positionKeys":["staff:anime:2"]}`)})
				return err
			}},
		}
		for _, tc := range cases {
			t.Run(q.name+"/"+tc.name, func(t *testing.T) {
				trace := querytiming.New()
				ctx := querytiming.WithContext(context.Background(), trace)
				before := qr.Stats().Executor.Started
				if err := tc.run(ctx); err == nil {
					t.Fatal("poisoned facts accepted")
				}
				if qr.Stats().Executor.Started != before+1 {
					t.Fatal("request failed before admitted fact load")
				}
				snapshot := trace.Freeze()
				if got := snapshot.SQLiteOutcome(); got != querytiming.DependencyError {
					t.Fatalf("fact failure left catalog SQLite outcome = %s, want error", got)
				}
			})
		}
	}
}

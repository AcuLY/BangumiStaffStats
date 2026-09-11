package candidates

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// BenchmarkGlobalAllPositions measures uncached candidate computation against
// an explicitly supplied local Archive, without changing the runtime budget.
func BenchmarkGlobalAllPositions(b *testing.B) {
	root := os.Getenv("BGMSS_BENCHMARK_ARCHIVE_ROOT")
	if root == "" {
		b.Skip("set BGMSS_BENCHMARK_ARCHIVE_ROOT to a local Archive")
	}
	data, err := os.ReadFile(filepath.Join(root, "current.json"))
	if err != nil {
		b.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(data, &pointer); err != nil {
		b.Fatal(err)
	}
	ctx := context.Background()
	store, err := archive.OpenVersion(ctx, root, pointer.DataVersion)
	if err != nil {
		b.Fatal(err)
	}
	defer store.Close()
	authority, err := loadCatalogAuthority(ctx, store)
	if err != nil {
		b.Fatal(err)
	}
	normalized, err := query.NormalizeOperation(json.RawMessage(`{"scope":"global","subjectType":"anime","positionKeys":[]}`), authority.Context, "all")
	if err != nil {
		b.Fatal(err)
	}
	keys := query.OperationPositions(normalized.Effective, authority.Context, authority.CandidatesByPosition, "all", true)
	normalized = query.OperationEvaluation(normalized, keys)
	if _, err := query.LoadFactSet(ctx, store, "anime"); err != nil {
		b.Fatal(err)
	}
	b.ResetTimer()
	for b.Loop() {
		core, err := computeCore(ctx, store, pointer.DataVersion, normalized, nil, "")
		if err != nil {
			b.Fatal(err)
		}
		if len(core.Rows) == 0 {
			b.Fatal("expected global candidates")
		}
	}
}

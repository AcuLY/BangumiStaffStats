package statistics

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestLoadSeriesIndexFromDirectArchive(t *testing.T) {
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
	sqliteData, err := os.ReadFile(filepath.Join(bundle, "bangumi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(versionRoot, "bangumi.sqlite"), sqliteData, 0o644); err != nil {
		t.Fatal(err)
	}
	store, err := archive.OpenVersion(context.Background(), root, pointer.DataVersion)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	index, err := LoadSeriesIndex(context.Background(), store)
	if err != nil {
		t.Fatal(err)
	}
	if index.DataVersion() != pointer.DataVersion {
		t.Fatalf("dataVersion = %q, want %q", index.DataVersion(), pointer.DataVersion)
	}
	got := index.Components("anime")
	if len(got) != 3 ||
		got[0].SeriesID != 1 || len(got[0].MemberIDs) != 2 ||
		got[1].SeriesID != 3 || got[2].SeriesID != 4 {
		t.Fatalf("minimal Archive components = %+v", got)
	}
}

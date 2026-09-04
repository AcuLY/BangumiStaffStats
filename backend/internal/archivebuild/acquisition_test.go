package archivebuild

import (
	"archive/zip"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestParseLatestAndExactZIPInventory(t *testing.T) {
	latest := map[string]any{
		"browser_download_url": "https://github.com/bangumi/Archive/releases/download/archive/dump-2026-07-21.210441Z.zip",
		"content_type":         "application/zip", "created_at": "2026-07-21T21:04:41Z",
		"digest": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		"id":     123, "label": "", "name": "dump-2026-07-21.210441Z.zip", "node_id": "node",
		"size": 42, "updated_at": "2026-07-21T21:04:42Z",
		"url": "https://api.github.com/repos/bangumi/Archive/releases/assets/123",
	}
	data, err := json.Marshal(latest)
	if err != nil {
		t.Fatal(err)
	}
	asset, err := ParseLatest(data)
	if err != nil {
		t.Fatalf("ParseLatest: %s", ErrorCode(err))
	}
	if asset.Release != "dump-2026-07-21.210441Z" || asset.Size != 42 {
		t.Fatalf("asset = %+v", asset)
	}

	archivePath := filepath.Join(t.TempDir(), "archive.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, name := range ArchiveMemberNames {
		member, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := member.Write([]byte("{}\n")); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	sources, err := VerifyAndExtract(context.Background(), archivePath, filepath.Join(t.TempDir(), "sources"))
	if err != nil {
		t.Fatalf("VerifyAndExtract: %s", ErrorCode(err))
	}
	if len(sources) != len(SourceNames) {
		t.Fatalf("sources = %d", len(sources))
	}
	for index, source := range sources {
		if source.Name != SourceNames[index] || source.Size != 3 || source.Digest != digestBytes([]byte("{}\n")) {
			t.Fatalf("source[%d] = %+v", index, source)
		}
	}
}

func TestExactZIPInventoryRejectsExtraMember(t *testing.T) {
	archivePath := filepath.Join(t.TempDir(), "archive.zip")
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	writer := zip.NewWriter(file)
	for _, name := range append(ArchiveMemberNames[:], "extra.jsonlines") {
		member, _ := writer.Create(name)
		_, _ = member.Write([]byte("{}\n"))
	}
	_ = writer.Close()
	_ = file.Close()
	_, err = VerifyAndExtract(context.Background(), archivePath, filepath.Join(t.TempDir(), "sources"))
	if ErrorCode(err) != "ARCHIVE_ZIP_INVALID" {
		t.Fatalf("error = %v", err)
	}
}

package app

import (
	"context"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

func TestRunListenerStartsAndStops(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	archiveRoot := arrangeArchive(t)
	result := make(chan error, 1)
	go func() {
		result <- RunListener(ctx, listener, archiveRoot)
	}()

	client := &http.Client{Timeout: 10 * time.Second}
	response, err := client.Get("http://" + listener.Addr().String() + "/not-a-route")
	if err != nil {
		cancel()
		t.Fatalf("request empty mux: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		cancel()
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNotFound)
	}

	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("RunListener returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("RunListener did not stop after cancellation")
	}
}

func TestRunListenerPropagatesServeFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}

	err = RunListener(context.Background(), listener, arrangeArchive(t))
	if err == nil {
		t.Fatal("RunListener returned nil for a closed listener")
	}
	if !errors.Is(err, net.ErrClosed) {
		t.Fatalf("RunListener error = %v, want net.ErrClosed", err)
	}
}

func TestRunRejectsInvalidAddress(t *testing.T) {
	err := Run(context.Background(), "127.0.0.1:not-a-port", t.TempDir())
	if err == nil {
		t.Fatal("Run returned nil for an invalid address")
	}
}

func TestRunListenerRequiresValidArchive(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer listener.Close()

	err = RunListener(context.Background(), listener, filepath.Join(t.TempDir(), "missing"))
	if err == nil {
		t.Fatal("RunListener accepted a missing Archive root")
	}
	code, ok := archive.ErrorCode(err)
	if !ok || code != archive.CodeArchiveRootInvalid {
		t.Fatalf("error = %v, code = %q", err, code)
	}
}

func arrangeArchive(t *testing.T) string {
	t.Helper()
	_, filename, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve test source")
	}
	repositoryRoot := filepath.Clean(filepath.Join(filepath.Dir(filename), "..", "..", ".."))
	bundleRoot := filepath.Join(repositoryRoot, "contracts", "goldens", "archive", "valid", "minimal")
	pointerData, err := os.ReadFile(filepath.Join(bundleRoot, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(pointerData, &pointer); err != nil {
		t.Fatal(err)
	}

	root := t.TempDir()
	versionRoot := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(versionRoot, 0o755); err != nil {
		t.Fatal(err)
	}
	copyArchiveTestFile(t, filepath.Join(bundleRoot, "archive-manifest.json"), filepath.Join(versionRoot, "manifest.json"))
	copyArchiveTestFile(t, filepath.Join(bundleRoot, "bangumi.sqlite"), filepath.Join(versionRoot, "bangumi.sqlite"))
	if err := os.WriteFile(filepath.Join(root, "current.json"), pointerData, 0o644); err != nil {
		t.Fatal(err)
	}
	return root
}

func copyArchiveTestFile(t *testing.T, source, destination string) {
	t.Helper()
	data, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(destination, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

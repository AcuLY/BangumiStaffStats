//go:build artifacts

package main

import (
	"archive/tar"
	"bytes"
	"debug/buildinfo"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"testing"
	"time"
)

func TestCanonicalJSONMatchesContractsEncoding(t *testing.T) {
	t.Parallel()

	value := map[string]any{
		"z": []any{float64(2), "text"},
		"a": map[string]any{"beta": true, "alpha": nil},
	}
	actual, err := canonicalJSONBytes(value)
	if err != nil {
		t.Fatal(err)
	}
	const expected = "{\"a\":{\"alpha\":null,\"beta\":true},\"z\":[2,\"text\"]}\n"
	if string(actual) != expected {
		t.Fatalf("canonical JSON = %q, want %q", actual, expected)
	}
}

func TestSafeRelativePath(t *testing.T) {
	t.Parallel()

	for _, path := range []string{"artifact.tar.gz", "artifacts/backend-api.oci.tar", "a_b/c-d"} {
		if !safeRelativePath(path) {
			t.Errorf("safeRelativePath(%q) = false", path)
		}
	}
	for _, path := range []string{"", "/absolute", "../escape", "a/../b", "a//b", "a\\b", "a b"} {
		if safeRelativePath(path) {
			t.Errorf("safeRelativePath(%q) = true", path)
		}
	}
}

func TestNormalizedDirectoryTarIsStable(t *testing.T) {
	t.Parallel()

	source := t.TempDir()
	if err := os.Mkdir(filepath.Join(source, "blobs"), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "index.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(source, "blobs", "value"), []byte("blob"), 0o600); err != nil {
		t.Fatal(err)
	}
	first := filepath.Join(t.TempDir(), "first.tar")
	second := filepath.Join(t.TempDir(), "second.tar")
	if err := writeNormalizedDirectoryTar(source, first); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(filepath.Join(source, "index.json"), time.Now(), time.Now()); err != nil {
		t.Fatal(err)
	}
	if err := writeNormalizedDirectoryTar(source, second); err != nil {
		t.Fatal(err)
	}
	equal, err := equalFiles(first, second)
	if err != nil {
		t.Fatal(err)
	}
	if !equal {
		t.Fatal("normalized OCI tars differ after source mtime change")
	}

	file, err := os.Open(first)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	reader := tar.NewReader(file)
	var names []string
	for {
		header, err := reader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			t.Fatal(err)
		}
		names = append(names, header.Name)
		if !header.ModTime.Equal(time.Unix(0, 0)) || header.Uid != 0 || header.Gid != 0 {
			t.Fatalf("non-normalized tar header: %#v", header)
		}
		if strings.HasSuffix(header.Name, "/") && header.Typeflag != tar.TypeDir {
			t.Fatalf("directory %q has type %d", header.Name, header.Typeflag)
		}
	}
	if !slices.Equal(names, []string{"blobs/", "blobs/value", "index.json"}) {
		t.Fatalf("tar entries = %v", names)
	}
}

func TestInspectOCIValidatesDescriptorsAndRuntimePolicy(t *testing.T) {
	t.Parallel()

	options := fixtureOptions(t)
	layout := t.TempDir()
	config := map[string]any{
		"architecture": options.TargetArchitecture,
		"os":           options.TargetOS,
		"config": map[string]any{
			"User":       "65532:65532",
			"Entrypoint": []string{"/usr/local/bin/bgmss-api"},
			"Labels": map[string]string{
				"org.opencontainers.image.revision":       options.SourceRevision,
				"io.bgmss.source-tree":                    options.SourceTree,
				"io.bgmss.openapi.sha256":                 options.OpenAPIDigest,
				"io.bgmss.archive-manifest-schema.sha256": options.ArchiveManifestSchemaDigest,
				"io.bgmss.archive-schema-sql.sha256":      options.ArchiveSchemaSQLDigest,
			},
		},
		"rootfs": map[string]any{"type": "layers", "diff_ids": []string{}},
	}
	configDescriptor := writeOCIBlob(t, layout, config)
	layerDescriptor := writeOCIRawBlob(t, layout, []byte("layer"))
	manifest := map[string]any{
		"schemaVersion": 2,
		"mediaType":     "application/vnd.oci.image.manifest.v1+json",
		"config":        configDescriptor,
		"layers":        []ociDescriptor{layerDescriptor},
		"annotations":   map[string]string{"org.example.test": "ignored-standard-extension"},
	}
	manifestDescriptor := writeOCIBlob(t, layout, manifest)
	manifestDescriptor.Platform = &targetPlatform{
		OS:           options.TargetOS,
		Architecture: options.TargetArchitecture,
	}
	index := map[string]any{
		"schemaVersion": 2,
		"mediaType":     "application/vnd.oci.image.index.v1+json",
		"manifests":     []ociDescriptor{manifestDescriptor},
	}
	writeJSONFile(t, filepath.Join(layout, "index.json"), index)

	image, err := inspectOCI(layout, options)
	if err != nil {
		t.Fatal(err)
	}
	if image.User != "65532:65532" ||
		!slices.Equal(image.Entrypoint, []string{"/usr/local/bin/bgmss-api"}) ||
		image.ManifestDigest != manifestDescriptor.Digest {
		t.Fatalf("unexpected image metadata: %#v", image)
	}
}

func TestEvidenceRoundTripAndTamperRejection(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	for name, content := range map[string]string{
		"backend-api-linux-arm64.oci.tar": "oci",
		"backend-api-linux-arm64.tar.gz":  "bundle",
	} {
		if err := os.WriteFile(filepath.Join(root, name), []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	names := []string{
		"backend-api-linux-arm64.oci.tar",
		"backend-api-linux-arm64.tar.gz",
	}
	records, err := inventoryFiles(root, names)
	if err != nil {
		t.Fatal(err)
	}
	if err := writeChecksumInventory(filepath.Join(root, checksumFileName), records); err != nil {
		t.Fatal(err)
	}
	inventory, err := evidenceForFile(root, checksumFileName)
	if err != nil {
		t.Fatal(err)
	}
	build := &buildinfo.BuildInfo{
		GoVersion: requiredGoVersion,
		Deps: []*debug.Module{{
			Path:    "example.invalid/runtime",
			Version: "v1.2.3",
			Sum:     "h1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
		}},
	}
	sbom, err := writeSPDX(
		filepath.Join(root, sbomFileName),
		inventory.SHA256,
		records,
		build,
	)
	if err != nil {
		t.Fatal(err)
	}
	sbomFile, err := evidenceForFile(root, sbomFileName)
	if err != nil {
		t.Fatal(err)
	}
	artifactSetDigest, err := canonicalValueDigest(records)
	if err != nil {
		t.Fatal(err)
	}
	options := fixtureOptions(t)
	statement := componentStatement{
		SchemaVersion: 1,
		Component:     componentID,
		Source: sourceIdentity{
			Revision: options.SourceRevision,
			Tree:     options.SourceTree,
		},
		Target: targetPlatform{
			OS:           options.TargetOS,
			Architecture: options.TargetArchitecture,
		},
		Toolchain: requiredToolchain(),
		BaseImages: []baseImageFact{
			{Reference: options.GoImageReference},
			{Reference: options.RuntimeImageReference},
		},
		Inputs:            options.Inputs,
		Compatibility:     fixtureCompatibility(options),
		Artifacts:         records,
		ArtifactSetDigest: artifactSetDigest,
		ChecksumInventory: inventory,
		SBOM: sbomEvidence{
			Path:              sbomFile.Path,
			Size:              sbomFile.Size,
			SHA256:            sbomFile.SHA256,
			DocumentNamespace: sbom.DocumentNamespace,
			PackageCount:      len(sbom.Packages),
		},
	}
	if err := writeCanonicalJSONFile(filepath.Join(root, statementFileName), statement); err != nil {
		t.Fatal(err)
	}
	if err := verifyCommand([]string{"--artifact-root", root}); err != nil {
		t.Fatal(err)
	}

	if err := os.Chmod(filepath.Join(root, names[0]), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, names[0]), []byte("tampered"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := verifyCommand([]string{"--artifact-root", root}); err == nil {
		t.Fatal("verify accepted a tampered distributed artifact")
	}
}

func TestProbeEndpoints(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/livez", "/readyz":
			writer.Header().Set("Content-Type", "application/json")
			io.WriteString(writer, `{"data":{"ok":true}}`)
		case "/metrics":
			io.WriteString(writer, "bgmss_current_snapshot_info 1\n")
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()
	if err := probeEndpoints(t.Context(), server.Client(), server.URL); err != nil {
		t.Fatal(err)
	}
}

func fixtureOptions(t *testing.T) packageOptions {
	t.Helper()
	const (
		revision = "0123456789abcdef0123456789abcdef01234567"
		tree     = "89abcdef0123456789abcdef0123456789abcdef"
	)
	return packageOptions{
		SourceRevision:              revision,
		SourceTree:                  tree,
		TargetOS:                    "linux",
		TargetArchitecture:          "arm64",
		OpenAPIDigest:               "sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11",
		ArchiveManifestSchemaDigest: "sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73",
		ArchiveSchemaSQLDigest:      "sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0",
		GoImageReference:            "docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651",
		RuntimeImageReference:       "gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6",
		Inputs: inputFlags{
			{Path: "backend/go.mod", SHA256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
			{Path: requiredBuildkitImageInputPath, SHA256: requiredBuildkitImageDigest},
		},
	}
}

func fixtureCompatibility(options packageOptions) compatibilityFacts {
	return compatibilityFacts{
		Archive: archiveCompatibility{
			ManifestSchemaVersion: versionRange{Minimum: 1, Maximum: 1},
			SQLiteSchemaVersion:   versionRange{Minimum: 1, Maximum: 1},
			ManifestSchemaDigest:  options.ArchiveManifestSchemaDigest,
			SchemaSQLDigest:       options.ArchiveSchemaSQLDigest,
		},
		OpenAPIDigest: options.OpenAPIDigest,
	}
}

func writeOCIBlob(t *testing.T, root string, value any) ociDescriptor {
	t.Helper()
	data, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return writeOCIRawBlob(t, root, data)
}

func writeOCIRawBlob(t *testing.T, root string, data []byte) ociDescriptor {
	t.Helper()
	digest := "sha256:" + hashBytes(data)
	path := filepath.Join(root, "blobs", "sha256", strings.TrimPrefix(digest, "sha256:"))
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	return ociDescriptor{
		MediaType: "application/octet-stream",
		Digest:    digest,
		Size:      int64(len(data)),
	}
}

func writeJSONFile(t *testing.T, path string, value any) {
	t.Helper()
	var buffer bytes.Buffer
	if err := json.NewEncoder(&buffer).Encode(value); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, buffer.Bytes(), 0o600); err != nil {
		t.Fatal(err)
	}
}

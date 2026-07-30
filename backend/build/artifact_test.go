//go:build artifacts

package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"debug/buildinfo"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"slices"
	"sort"
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

func TestIsRootUserRejectsEveryNumericUIDZeroEncoding(t *testing.T) {
	t.Parallel()

	for _, user := range []string{
		"",
		" ",
		"root",
		"ROOT:65532",
		"0",
		"0:0",
		"00",
		"000:123",
		"+0",
		"+000:123",
		"-0",
		"-000:123",
		"0000000000000000000000000000000000000000:65532",
	} {
		user := user
		t.Run(user, func(t *testing.T) {
			t.Parallel()

			if !isRootUser(user) {
				t.Fatalf("isRootUser(%q) = false, want true", user)
			}
		})
	}
}

func TestIsRootUserAcceptsNonzeroOrNamedUsers(t *testing.T) {
	t.Parallel()

	for _, user := range []string{
		"1",
		"01:0",
		"+001:0",
		"-1:0",
		"65532",
		"65532:65532",
		"nonroot",
		"nonroot:0",
		"1000:0",
	} {
		user := user
		t.Run(user, func(t *testing.T) {
			t.Parallel()

			if isRootUser(user) {
				t.Fatalf("isRootUser(%q) = true, want false", user)
			}
		})
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
	layout, manifestDescriptor := writeFixtureOCILayout(t, options)

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

func TestImageArchiveAdmissionAcceptsClosedExporterShape(t *testing.T) {
	t.Parallel()

	options := fixtureOptions(t)
	archive, manifestDescriptor := writeFixtureImageArchive(t, options)
	destination := filepath.Join(t.TempDir(), "admitted")
	t.Cleanup(func() {
		if err := makeDirectoryTreeWritable(destination); err != nil &&
			!os.IsNotExist(err) {
			t.Errorf("restore admitted layout permissions: %v", err)
		}
	})
	if err := admitImageArchive(archive, destination); err != nil {
		t.Fatal(err)
	}
	image, err := inspectOCI(destination, options)
	if err != nil {
		t.Fatal(err)
	}
	if image.ManifestDigest != manifestDescriptor.Digest {
		t.Fatalf(
			"manifest digest = %q, want %q",
			image.ManifestDigest,
			manifestDescriptor.Digest,
		)
	}
	repacked := filepath.Join(t.TempDir(), "repacked.tar")
	if err := writeNormalizedDirectoryTar(destination, repacked); err != nil {
		t.Fatal(err)
	}
	equal, err := equalFiles(archive, repacked)
	if err != nil {
		t.Fatal(err)
	}
	if !equal {
		t.Fatal("accepted fixture did not round-trip to normalized bytes")
	}
}

func TestExternalPinnedDockerExporterArchive(t *testing.T) {
	archive := os.Getenv("BGMSS_TEST_DOCKER_EXPORT_ARCHIVE")
	if archive == "" {
		t.Skip("BGMSS_TEST_DOCKER_EXPORT_ARCHIVE is not set")
	}
	options := fixtureOptions(t)
	destination := filepath.Join(t.TempDir(), "admitted")
	t.Cleanup(func() {
		if err := makeDirectoryTreeWritable(destination); err != nil &&
			!os.IsNotExist(err) {
			t.Errorf("restore admitted layout permissions: %v", err)
		}
	})
	if err := admitImageArchive(archive, destination); err != nil {
		t.Fatal(err)
	}
	if _, err := inspectOCI(destination, options); err != nil {
		t.Fatal(err)
	}
}

func TestImageArchiveAdmissionRejectsUnsafeDuplicateExtraAndUnsupportedMembers(
	t *testing.T,
) {
	t.Parallel()

	options := fixtureOptions(t)
	layout, _ := writeFixtureOCILayout(t, options)
	baseEntries := fixtureImageArchiveEntries(t, layout)
	tests := []struct {
		name   string
		mutate func([]imageArchiveFixtureEntry) []imageArchiveFixtureEntry
	}{
		{
			name: "absolute",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				entries[imageArchiveEntryIndex(t, entries, "index.json")].Header.Name =
					"/index.json"
				return entries
			},
		},
		{
			name: "dot dot",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				entries[imageArchiveEntryIndex(t, entries, "index.json")].Header.Name =
					"../index.json"
				return entries
			},
		},
		{
			name: "non normalized",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				entries[imageArchiveEntryIndex(t, entries, "index.json")].Header.Name =
					"./index.json"
				return entries
			},
		},
		{
			name: "duplicate",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "manifest.json")
				return append(entries, cloneImageArchiveEntry(entries[index]))
			},
		},
		{
			name: "extra",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				header := normalizedTarHeader("unexpected", 0o444, 5)
				return append(entries, imageArchiveFixtureEntry{
					Header: *header,
					Data:   []byte("extra"),
				})
			},
		},
		{
			name: "symlink",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "index.json")
				entries[index].Header.Typeflag = tar.TypeSymlink
				entries[index].Header.Linkname = "manifest.json"
				entries[index].Header.Size = 0
				entries[index].Data = nil
				return entries
			},
		},
		{
			name: "hard link",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "index.json")
				entries[index].Header.Typeflag = tar.TypeLink
				entries[index].Header.Linkname = "manifest.json"
				entries[index].Header.Size = 0
				entries[index].Data = nil
				return entries
			},
		},
		{
			name: "fifo",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "index.json")
				entries[index].Header.Typeflag = tar.TypeFifo
				entries[index].Header.Size = 0
				entries[index].Data = nil
				return entries
			},
		},
		{
			name: "device",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "index.json")
				entries[index].Header.Typeflag = tar.TypeChar
				entries[index].Header.Size = 0
				entries[index].Data = nil
				return entries
			},
		},
		{
			name: "pax",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "manifest.json")
				entries[index].Header.Format = tar.FormatPAX
				entries[index].Header.PAXRecords = map[string]string{
					"comment": "forbidden",
				}
				return entries
			},
		},
		{
			name: "xattr",
			mutate: func(entries []imageArchiveFixtureEntry) []imageArchiveFixtureEntry {
				index := imageArchiveEntryIndex(t, entries, "manifest.json")
				entries[index].Header.Format = tar.FormatPAX
				entries[index].Header.Xattrs = map[string]string{
					"user.forbidden": "value",
				}
				return entries
			},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			entries := cloneImageArchiveEntries(baseEntries)
			entries = test.mutate(entries)
			archive := filepath.Join(t.TempDir(), "invalid.tar")
			writeImageArchiveFixture(t, archive, entries)
			destination := filepath.Join(t.TempDir(), "admitted")
			if err := admitImageArchive(archive, destination); err == nil {
				t.Fatal("admitImageArchive accepted an unsafe or unsupported member")
			}
		})
	}

	t.Run("GNU sparse", func(t *testing.T) {
		header := normalizedTarHeader("index.json", 0o444, 0)
		header.Typeflag = tar.TypeGNUSparse
		if _, _, err := validateImageArchiveHeader(header); err == nil {
			t.Fatal("validateImageArchiveHeader accepted a GNU sparse member")
		}
	})

	t.Run("oversized archive", func(t *testing.T) {
		archive := filepath.Join(t.TempDir(), "oversized.tar")
		file, err := os.Create(archive)
		if err != nil {
			t.Fatal(err)
		}
		if err := file.Truncate(maxImageArchiveSize + 1); err != nil {
			file.Close()
			t.Fatal(err)
		}
		if err := file.Close(); err != nil {
			t.Fatal(err)
		}
		if err := admitImageArchive(
			archive,
			filepath.Join(t.TempDir(), "admitted"),
		); err == nil {
			t.Fatal("admitImageArchive accepted an oversized archive")
		}
	})

	t.Run("trailing bytes", func(t *testing.T) {
		archive, _ := writeFixtureImageArchive(t, options)
		if err := os.Chmod(archive, 0o600); err != nil {
			t.Fatal(err)
		}
		file, err := os.OpenFile(archive, os.O_APPEND|os.O_WRONLY, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte("trailing")); err != nil {
			file.Close()
			t.Fatal(err)
		}
		if err := file.Close(); err != nil {
			t.Fatal(err)
		}
		if err := admitImageArchive(
			archive,
			filepath.Join(t.TempDir(), "admitted"),
		); err == nil {
			t.Fatal("admitImageArchive accepted trailing bytes")
		}
	})
}

func TestInspectOCIRejectsOrphansAndCompatibilityMismatch(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name   string
		mutate func(*testing.T, string, packageOptions)
	}{
		{
			name: "orphan blob",
			mutate: func(t *testing.T, layout string, _ packageOptions) {
				blobDirectory := filepath.Join(layout, "blobs", "sha256")
				if err := os.Chmod(filepath.Join(layout, "blobs"), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(blobDirectory, 0o755); err != nil {
					t.Fatal(err)
				}
				orphan := filepath.Join(blobDirectory, strings.Repeat("f", 64))
				if err := os.WriteFile(orphan, []byte("orphan"), 0o444); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(blobDirectory, 0o555); err != nil {
					t.Fatal(err)
				}
				if err := os.Chmod(filepath.Join(layout, "blobs"), 0o555); err != nil {
					t.Fatal(err)
				}
			},
		},
		{
			name: "manifest tag mismatch",
			mutate: func(t *testing.T, layout string, _ packageOptions) {
				rewriteCompatibilityFixture(t, layout, func(
					record *dockerCompatibilityRecord,
				) {
					record.RepoTags = []string{"localhost/bgmss-backend-api:wrong"}
				})
			},
		},
		{
			name: "manifest config mismatch",
			mutate: func(t *testing.T, layout string, _ packageOptions) {
				rewriteCompatibilityFixture(t, layout, func(
					record *dockerCompatibilityRecord,
				) {
					record.Config = "blobs/sha256/" + strings.Repeat("f", 64)
				})
			},
		},
		{
			name: "manifest layers mismatch",
			mutate: func(t *testing.T, layout string, _ packageOptions) {
				rewriteCompatibilityFixture(t, layout, func(
					record *dockerCompatibilityRecord,
				) {
					record.Layers = []string{
						"blobs/sha256/" + strings.Repeat("f", 64),
					}
				})
			},
		},
	}
	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			options := fixtureOptions(t)
			layout, _ := writeFixtureOCILayout(t, options)
			test.mutate(t, layout, options)
			if _, err := inspectOCI(layout, options); err == nil {
				t.Fatal("inspectOCI accepted orphan or compatibility drift")
			}
		})
	}
}

func TestEvidenceRoundTripAndTamperRejection(t *testing.T) {
	options := fixtureOptions(t)
	options.APIBinaryPath, options.ArchiveSmokeBinaryPath = buildFixtureBinaries(t, options)
	options.ImageArchivePath, _ = writeFixtureImageArchive(t, options)
	options.OutputPath = filepath.Join(t.TempDir(), "component")

	if err := packageCommand(packageArguments(options)); err != nil {
		t.Fatal(err)
	}
	if err := verifyCommand([]string{"--artifact-root", options.OutputPath}); err != nil {
		t.Fatal(err)
	}

	bundleName := "backend-api-linux-arm64.tar.gz"
	bundlePath := filepath.Join(options.OutputPath, bundleName)
	contents, err := readVerifiedBundle(bundlePath)
	if err != nil {
		t.Fatal(err)
	}
	if contents.Metadata.SchemaVersion != 2 ||
		!slices.Equal(contents.Metadata.Executables, []executableFact{
			{
				Role:   archiveSmokeExecutableRole,
				Path:   archiveSmokeBundlePath,
				Size:   int64(len(contents.ArchiveSmoke)),
				SHA256: "sha256:" + hashBytes(contents.ArchiveSmoke),
			},
			{
				Role:   apiExecutableRole,
				Path:   apiBundlePath,
				Size:   int64(len(contents.API)),
				SHA256: "sha256:" + hashBytes(contents.API),
			},
		}) {
		t.Fatalf("unexpected executable evidence: %#v", contents.Metadata.Executables)
	}

	t.Run("outer tamper", func(t *testing.T) {
		ociPath := filepath.Join(options.OutputPath, "backend-api-linux-arm64.oci.tar")
		if err := os.Chmod(ociPath, 0o600); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(ociPath, []byte("tampered"), 0o600); err != nil {
			t.Fatal(err)
		}
		if err := verifyCommand([]string{"--artifact-root", options.OutputPath}); err == nil {
			t.Fatal("verify accepted a tampered distributed artifact")
		}
	})
}

func TestBundleVerifierRejectsInnerDrift(t *testing.T) {
	options := fixtureOptions(t)
	options.APIBinaryPath, options.ArchiveSmokeBinaryPath = buildFixtureBinaries(t, options)
	image := fixtureImageMetadata()
	metadata := fixtureBundleMetadata(t, options, image)
	statement := fixtureStatement(options, image)
	records := []fileRecord{
		{
			Path:   "backend-api-linux-arm64.oci.tar",
			Size:   3,
			SHA256: image.OCITarSHA256,
		},
		{
			Path:   "backend-api-linux-arm64.tar.gz",
			Size:   1,
			SHA256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		},
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].Path < records[right].Path
	})
	api, err := os.ReadFile(options.APIBinaryPath)
	if err != nil {
		t.Fatal(err)
	}
	archiveSmoke, err := os.ReadFile(options.ArchiveSmokeBinaryPath)
	if err != nil {
		t.Fatal(err)
	}

	type mutation func(*bundleMetadata, *[]bundleFixtureEntry)
	tests := []struct {
		name   string
		mutate mutation
	}{
		{
			name: "extra member",
			mutate: func(_ *bundleMetadata, entries *[]bundleFixtureEntry) {
				*entries = append(*entries, bundleFixtureEntry{
					Name: "unexpected",
					Type: tar.TypeReg,
					Mode: 0o444,
					Data: []byte("extra"),
				})
			},
		},
		{
			name: "duplicate member",
			mutate: func(_ *bundleMetadata, entries *[]bundleFixtureEntry) {
				duplicate := (*entries)[1]
				*entries = append(
					(*entries)[:2],
					append([]bundleFixtureEntry{duplicate}, (*entries)[2:]...)...,
				)
			},
		},
		{
			name: "unsafe member",
			mutate: func(_ *bundleMetadata, entries *[]bundleFixtureEntry) {
				(*entries)[1].Name = "../archive-smoke"
			},
		},
		{
			name: "non executable member",
			mutate: func(_ *bundleMetadata, entries *[]bundleFixtureEntry) {
				(*entries)[1].Mode = 0o444
			},
		},
		{
			name: "symlink member",
			mutate: func(_ *bundleMetadata, entries *[]bundleFixtureEntry) {
				(*entries)[1].Type = tar.TypeSymlink
				(*entries)[1].Linkname = apiBundlePath
				(*entries)[1].Data = nil
			},
		},
		{
			name: "historical schema",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.SchemaVersion = 1
			},
		},
		{
			name: "role drift",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.Executables[0].Role = "other"
			},
		},
		{
			name: "path drift",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.Executables[0].Path = "bin/other"
			},
		},
		{
			name: "size drift",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.Executables[0].Size++
			},
		},
		{
			name: "digest drift",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.Executables[0].SHA256 =
					"sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
			},
		},
		{
			name: "extra executable evidence",
			mutate: func(metadata *bundleMetadata, _ *[]bundleFixtureEntry) {
				metadata.Executables = append(metadata.Executables, executableFact{
					Role:   "other",
					Path:   "bin/other",
					Size:   1,
					SHA256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
				})
			},
		},
		{
			name: "wrong module",
			mutate: func(metadata *bundleMetadata, entries *[]bundleFixtureEntry) {
				(*entries)[1].Data = api
				metadata.Executables[0].Size = int64(len(api))
				metadata.Executables[0].SHA256 = "sha256:" + hashBytes(api)
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			mutatedMetadata := metadata
			mutatedMetadata.Executables = slices.Clone(metadata.Executables)
			entries := fixtureBundleEntries(mutatedMetadata, api, archiveSmoke)
			test.mutate(&mutatedMetadata, &entries)
			refreshFixtureMetadata(t, &entries, mutatedMetadata)

			root := t.TempDir()
			writeBundleFixture(t, filepath.Join(root, "backend-api-linux-arm64.tar.gz"), entries)
			if err := verifyBundle(root, statement, records); err == nil {
				t.Fatal("verifyBundle accepted inner drift")
			}
		})
	}

	t.Run("trailing compressed data", func(t *testing.T) {
		root := t.TempDir()
		path := filepath.Join(root, "backend-api-linux-arm64.tar.gz")
		writeBundleFixture(t, path, fixtureBundleEntries(metadata, api, archiveSmoke))
		if err := os.Chmod(path, 0o644); err != nil {
			t.Fatal(err)
		}
		file, err := os.OpenFile(path, os.O_APPEND|os.O_WRONLY, 0)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := file.Write([]byte("trailing")); err != nil {
			file.Close()
			t.Fatal(err)
		}
		if err := file.Close(); err != nil {
			t.Fatal(err)
		}
		if err := verifyBundle(root, statement, records); err == nil {
			t.Fatal("verifyBundle accepted trailing compressed data")
		}
	})
}

func TestValidateBuildInfoRejectsWrongTarget(t *testing.T) {
	options := fixtureOptions(t)
	apiPath := buildFixtureBinary(
		t,
		"./cmd/api",
		"wrong-target-api",
		"linux",
		"amd64",
		options.ApplicationVersion,
		options.SourceRevision,
	)
	build, err := buildinfo.ReadFile(apiPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateBuildInfo(
		build,
		"API",
		apiModulePath,
		options.TargetOS,
		options.TargetArchitecture,
	); err == nil {
		t.Fatal("validateBuildInfo accepted the wrong target architecture")
	}
}

func TestWriteSPDXMergesBothBinaryClosures(t *testing.T) {
	t.Parallel()

	first := &buildinfo.BuildInfo{
		GoVersion: requiredGoVersion,
		Deps: []*debug.Module{{
			Path:    "example.invalid/api",
			Version: "v1.0.0",
		}},
	}
	second := &buildinfo.BuildInfo{
		GoVersion: requiredGoVersion,
		Deps: []*debug.Module{
			{
				Path:    "example.invalid/api",
				Version: "v1.0.0",
			},
			{
				Path:    "example.invalid/archive",
				Version: "v2.0.0",
			},
		},
	}
	dependencies := runtimeDependencies([]*buildinfo.BuildInfo{first, second})
	var names []string
	for _, dependency := range dependencies {
		names = append(names, dependency.Name)
	}
	if !slices.Equal(
		names,
		[]string{"example.invalid/api", "example.invalid/archive", "go-runtime"},
	) {
		t.Fatalf("merged dependency names = %v", names)
	}
	for _, dependency := range dependencies {
		if dependency.Name == "go-runtime" && dependency.VersionInfo != requiredGoVersion {
			t.Fatalf(
				"runtime version = %q, want %q",
				dependency.VersionInfo,
				requiredGoVersion,
			)
		}
	}
}

func TestVerifyRejectsTamperedOuterArtifact(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	if err := os.WriteFile(
		filepath.Join(root, "checksums.sha256"),
		[]byte(strings.Repeat("0", 64)+"  artifact\n"),
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "artifact"), []byte("tampered"), 0o600); err != nil {
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
		ApplicationVersion:          applicationVersion,
		TargetOS:                    "linux",
		TargetArchitecture:          "arm64",
		OpenAPIDigest:               "sha256:e7aba7c34b0d6f74e533e8e9fd31c8f0aa40ed15c440669ec87a7204c963cf11",
		ArchiveManifestSchemaDigest: "sha256:5a2b0cd7294312e9dcbdd413a1b01c4218652c4c39fd7472b74e40622e7a3e73",
		ArchiveSchemaSQLDigest:      "sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0",
		ArchiveDomainRulesVersion:   domainRulesVersion,
		ArchiveCastRulesVersion:     castRulesVersion,
		CompatibilityMatrixDigest:   compatibilityMatrixDigest,
		GoImageReference:            "docker.io/library/golang:1.26.5-bookworm@sha256:1ecb7edf62a0408027bd5729dfd6b1b8766e578e8df93995b225dfd0944eb651",
		RuntimeImageReference:       "gcr.io/distroless/static-debian13:nonroot@sha256:f7f8f729987ad0fdf6b05eeeae94b26e6a0f613bdf46feea7fc40f7bd72953e6",
		Inputs: inputFlags{
			{Path: applicationVersionInputPath, SHA256: applicationVersionInputDigest},
			{Path: "backend/go.mod", SHA256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"},
			{Path: compatibilityMatrixInputPath, SHA256: compatibilityMatrixDigest},
			{Path: requiredBuildkitImageInputPath, SHA256: requiredBuildkitImageDigest},
		},
	}
}

func fixtureCompatibility(options packageOptions) compatibilityFacts {
	return compatibilityFacts{
		Archive: archiveCompatibility{
			ManifestSchemaVersion:     versionRange{Minimum: 1, Maximum: 1},
			SQLiteSchemaVersion:       versionRange{Minimum: 1, Maximum: 1},
			ManifestSchemaDigest:      options.ArchiveManifestSchemaDigest,
			SchemaSQLDigest:           options.ArchiveSchemaSQLDigest,
			DomainRulesVersion:        options.ArchiveDomainRulesVersion,
			CastRulesVersion:          options.ArchiveCastRulesVersion,
			CompatibilityMatrixDigest: options.CompatibilityMatrixDigest,
		},
		OpenAPIDigest: options.OpenAPIDigest,
	}
}

func packageArguments(options packageOptions) []string {
	arguments := []string{
		"--api-binary", options.APIBinaryPath,
		"--archive-smoke-binary", options.ArchiveSmokeBinaryPath,
		"--image-archive", options.ImageArchivePath,
		"--output", options.OutputPath,
		"--source-revision", options.SourceRevision,
		"--source-tree", options.SourceTree,
		"--application-version", options.ApplicationVersion,
		"--target-os", options.TargetOS,
		"--target-arch", options.TargetArchitecture,
		"--openapi-sha256", options.OpenAPIDigest,
		"--archive-manifest-schema-sha256", options.ArchiveManifestSchemaDigest,
		"--archive-schema-sql-sha256", options.ArchiveSchemaSQLDigest,
		"--archive-domain-rules-version", options.ArchiveDomainRulesVersion,
		"--archive-cast-rules-version", options.ArchiveCastRulesVersion,
		"--archive-compatibility-matrix-sha256", options.CompatibilityMatrixDigest,
		"--go-image", options.GoImageReference,
		"--runtime-image", options.RuntimeImageReference,
	}
	for _, input := range options.Inputs {
		arguments = append(arguments, "--input", input.Path+"="+input.SHA256)
	}
	return arguments
}

func buildFixtureBinaries(t *testing.T, options packageOptions) (string, string) {
	t.Helper()
	api := buildFixtureBinary(
		t,
		"./cmd/api",
		"bgmss-api",
		options.TargetOS,
		options.TargetArchitecture,
		options.ApplicationVersion,
		options.SourceRevision,
	)
	archiveSmoke := buildFixtureBinary(
		t,
		"./cmd/archive-smoke",
		"archive-smoke",
		options.TargetOS,
		options.TargetArchitecture,
		options.ApplicationVersion,
		options.SourceRevision,
	)
	return api, archiveSmoke
}

func buildFixtureBinary(
	t *testing.T,
	modulePath string,
	name string,
	targetOS string,
	targetArchitecture string,
	releaseVersion string,
	revision string,
) string {
	t.Helper()
	output := filepath.Join(t.TempDir(), name)
	command := exec.Command(
		"go",
		"build",
		"-buildvcs=false",
		"-trimpath",
		"-ldflags="+releaseLinkerFlags(releaseVersion, revision),
		"-o",
		output,
		modulePath,
	)
	command.Dir = filepath.Clean("..")
	command.Env = commandEnvironment(map[string]string{
		"CGO_ENABLED": "0",
		"GOENV":       "off",
		"GOFLAGS":     "-mod=readonly",
		"GOOS":        targetOS,
		"GOARCH":      targetArchitecture,
		"GOTOOLCHAIN": "go1.26.5+auto",
		"GOWORK":      "off",
	})
	if combined, err := command.CombinedOutput(); err != nil {
		t.Fatalf("build %s: %v\n%s", modulePath, err, combined)
	}
	info, err := os.Lstat(output)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Mode().IsRegular() {
		t.Fatalf("fixture binary is not regular: %s", output)
	}
	return output
}

func commandEnvironment(overrides map[string]string) []string {
	environment := make([]string, 0, len(os.Environ())+len(overrides))
	for _, entry := range os.Environ() {
		key, _, found := strings.Cut(entry, "=")
		if !found {
			continue
		}
		if _, replaced := overrides[key]; replaced {
			continue
		}
		environment = append(environment, entry)
	}
	keys := make([]string, 0, len(overrides))
	for key := range overrides {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		environment = append(environment, key+"="+overrides[key])
	}
	return environment
}

func writeFixtureOCILayout(
	t *testing.T,
	options packageOptions,
) (string, ociDescriptor) {
	t.Helper()
	layout := filepath.Join(t.TempDir(), "layout")
	if err := os.Mkdir(layout, 0o755); err != nil {
		t.Fatal(err)
	}
	config := map[string]any{
		"architecture": options.TargetArchitecture,
		"os":           options.TargetOS,
		"config": map[string]any{
			"User":       "65532:65532",
			"Entrypoint": []string{"/usr/local/bin/bgmss-api"},
			"Labels": map[string]string{
				"org.opencontainers.image.version":        options.ApplicationVersion,
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
	configDescriptor.MediaType = ociConfigMediaType
	layerDescriptor := writeOCIRawBlob(t, layout, []byte("layer"))
	layerDescriptor.MediaType = ociLayerMediaType
	manifest := map[string]any{
		"schemaVersion": 2,
		"mediaType":     ociManifestMediaType,
		"config":        configDescriptor,
		"layers":        []ociDescriptor{layerDescriptor},
		"annotations":   map[string]string{"org.example.test": "ignored-standard-extension"},
	}
	manifestDescriptor := writeOCIBlob(t, layout, manifest)
	manifestDescriptor.MediaType = ociManifestMediaType
	manifestDescriptor.Platform = &targetPlatform{
		OS:           options.TargetOS,
		Architecture: options.TargetArchitecture,
	}
	manifestDescriptor.Annotations = map[string]string{
		"io.containerd.image.name":          declaredImageName(options),
		"org.opencontainers.image.ref.name": options.SourceRevision + "-" + options.TargetArchitecture,
	}
	index := map[string]any{
		"schemaVersion": 2,
		"mediaType":     ociIndexMediaType,
		"manifests":     []ociDescriptor{manifestDescriptor},
	}
	writeJSONFile(t, filepath.Join(layout, "index.json"), index)
	writeJSONFile(
		t,
		filepath.Join(layout, "oci-layout"),
		ociImageLayout{ImageLayoutVersion: ociImageLayoutVersion},
	)
	configPath, err := descriptorBlobPath(configDescriptor)
	if err != nil {
		t.Fatal(err)
	}
	layerPath, err := descriptorBlobPath(layerDescriptor)
	if err != nil {
		t.Fatal(err)
	}
	compatibility, err := json.Marshal([]dockerCompatibilityRecord{{
		Config:   configPath,
		RepoTags: []string{declaredImageName(options)},
		Layers:   []string{layerPath},
	}})
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(
		filepath.Join(layout, "manifest.json"),
		compatibility,
		0o600,
	); err != nil {
		t.Fatal(err)
	}
	if err := filepath.WalkDir(layout, func(
		currentPath string,
		entry os.DirEntry,
		walkErr error,
	) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == layout {
			return nil
		}
		if entry.IsDir() {
			return os.Chmod(currentPath, 0o555)
		}
		return os.Chmod(currentPath, 0o444)
	}); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := makeDirectoryTreeWritable(layout); err != nil {
			t.Errorf("restore fixture layout permissions: %v", err)
		}
	})
	return layout, manifestDescriptor
}

func writeFixtureImageArchive(
	t *testing.T,
	options packageOptions,
) (string, ociDescriptor) {
	t.Helper()
	layout, manifestDescriptor := writeFixtureOCILayout(t, options)
	archive := filepath.Join(t.TempDir(), "docker-export.tar")
	if err := writeNormalizedDirectoryTar(layout, archive); err != nil {
		t.Fatal(err)
	}
	return archive, manifestDescriptor
}

type imageArchiveFixtureEntry struct {
	Header tar.Header
	Data   []byte
}

func fixtureImageArchiveEntries(
	t *testing.T,
	layout string,
) []imageArchiveFixtureEntry {
	t.Helper()
	var relativePaths []string
	if err := filepath.WalkDir(layout, func(
		currentPath string,
		entry os.DirEntry,
		walkErr error,
	) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == layout {
			return nil
		}
		relative, err := filepath.Rel(layout, currentPath)
		if err != nil {
			return err
		}
		relativePaths = append(relativePaths, filepath.ToSlash(relative))
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	sort.Strings(relativePaths)
	entries := make([]imageArchiveFixtureEntry, 0, len(relativePaths))
	for _, relative := range relativePaths {
		currentPath := filepath.Join(layout, filepath.FromSlash(relative))
		info, err := os.Lstat(currentPath)
		if err != nil {
			t.Fatal(err)
		}
		name := relative
		mode := int64(0o444)
		size := info.Size()
		var data []byte
		if info.IsDir() {
			name += "/"
			mode = 0o555
			size = 0
		} else {
			data, err = os.ReadFile(currentPath)
			if err != nil {
				t.Fatal(err)
			}
		}
		header := normalizedTarHeader(name, mode, size)
		if info.IsDir() {
			header.Typeflag = tar.TypeDir
		}
		entries = append(entries, imageArchiveFixtureEntry{
			Header: *header,
			Data:   data,
		})
	}
	return entries
}

func imageArchiveEntryIndex(
	t *testing.T,
	entries []imageArchiveFixtureEntry,
	name string,
) int {
	t.Helper()
	for index := range entries {
		if entries[index].Header.Name == name {
			return index
		}
	}
	t.Fatalf("image archive fixture omits %q", name)
	return -1
}

func cloneImageArchiveEntries(
	entries []imageArchiveFixtureEntry,
) []imageArchiveFixtureEntry {
	result := make([]imageArchiveFixtureEntry, len(entries))
	for index := range entries {
		result[index] = cloneImageArchiveEntry(entries[index])
	}
	return result
}

func cloneImageArchiveEntry(entry imageArchiveFixtureEntry) imageArchiveFixtureEntry {
	entry.Data = slices.Clone(entry.Data)
	entry.Header.PAXRecords = cloneStringMap(entry.Header.PAXRecords)
	entry.Header.Xattrs = cloneStringMap(entry.Header.Xattrs)
	return entry
}

func cloneStringMap(source map[string]string) map[string]string {
	if source == nil {
		return nil
	}
	result := make(map[string]string, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func writeImageArchiveFixture(
	t *testing.T,
	archivePath string,
	entries []imageArchiveFixtureEntry,
) {
	t.Helper()
	file, err := os.Create(archivePath)
	if err != nil {
		t.Fatal(err)
	}
	tarWriter := tar.NewWriter(file)
	for _, entry := range entries {
		header := entry.Header
		if err := tarWriter.WriteHeader(&header); err != nil {
			tarWriter.Close()
			file.Close()
			t.Fatal(err)
		}
		if (header.Typeflag == tar.TypeReg || header.Typeflag == tar.TypeRegA) &&
			len(entry.Data) != 0 {
			if _, err := tarWriter.Write(entry.Data); err != nil {
				tarWriter.Close()
				file.Close()
				t.Fatal(err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(archivePath, 0o444); err != nil {
		t.Fatal(err)
	}
}

func rewriteCompatibilityFixture(
	t *testing.T,
	layout string,
	mutate func(*dockerCompatibilityRecord),
) {
	t.Helper()
	manifestPath := filepath.Join(layout, "manifest.json")
	data, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatal(err)
	}
	var records []dockerCompatibilityRecord
	if err := json.Unmarshal(data, &records); err != nil {
		t.Fatal(err)
	}
	if len(records) != 1 {
		t.Fatalf("fixture compatibility records = %d, want 1", len(records))
	}
	mutate(&records[0])
	data, err = json.Marshal(records)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(manifestPath, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(manifestPath, data, 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(manifestPath, 0o444); err != nil {
		t.Fatal(err)
	}
}

func fixtureImageMetadata() imageMetadata {
	return imageMetadata{
		IndexSHA256:    "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		ManifestDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
		ConfigDigest:   "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
		LayerDigests: []string{
			"sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
		},
		User:         "65532:65532",
		Entrypoint:   []string{"/usr/local/bin/bgmss-api"},
		OCITarSHA256: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
	}
}

func fixtureBundleMetadata(
	t *testing.T,
	options packageOptions,
	image imageMetadata,
) bundleMetadata {
	t.Helper()
	executables, err := executableFacts(
		options.APIBinaryPath,
		options.ArchiveSmokeBinaryPath,
	)
	if err != nil {
		t.Fatal(err)
	}
	return bundleMetadata{
		SchemaVersion:      2,
		ApplicationVersion: options.ApplicationVersion,
		Component:          componentID,
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
		Inputs:        options.Inputs,
		Compatibility: fixtureCompatibility(options),
		Image:         image,
		Executables:   executables,
	}
}

func fixtureStatement(
	options packageOptions,
	image imageMetadata,
) componentStatement {
	return componentStatement{
		SchemaVersion:      1,
		ApplicationVersion: options.ApplicationVersion,
		Component:          componentID,
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
		Inputs:        options.Inputs,
		Compatibility: fixtureCompatibility(options),
		Artifacts: []fileRecord{{
			Path:   "backend-api-linux-arm64.oci.tar",
			Size:   3,
			SHA256: image.OCITarSHA256,
		}},
	}
}

type bundleFixtureEntry struct {
	Name     string
	Type     byte
	Mode     int64
	Linkname string
	Data     []byte
}

func fixtureBundleEntries(
	metadata bundleMetadata,
	api []byte,
	archiveSmoke []byte,
) []bundleFixtureEntry {
	metadataBytes, err := canonicalJSONBytes(metadata)
	if err != nil {
		panic(err)
	}
	return []bundleFixtureEntry{
		{Name: "bin/", Type: tar.TypeDir, Mode: 0o555},
		{
			Name: archiveSmokeBundlePath,
			Type: tar.TypeReg,
			Mode: 0o555,
			Data: archiveSmoke,
		},
		{Name: apiBundlePath, Type: tar.TypeReg, Mode: 0o555, Data: api},
		{Name: "metadata/", Type: tar.TypeDir, Mode: 0o555},
		{
			Name: "metadata/build.json",
			Type: tar.TypeReg,
			Mode: 0o444,
			Data: metadataBytes,
		},
	}
}

func refreshFixtureMetadata(
	t *testing.T,
	entries *[]bundleFixtureEntry,
	metadata bundleMetadata,
) {
	t.Helper()
	metadataBytes, err := canonicalJSONBytes(metadata)
	if err != nil {
		t.Fatal(err)
	}
	for index := range *entries {
		if (*entries)[index].Name == "metadata/build.json" {
			(*entries)[index].Data = metadataBytes
			return
		}
	}
	t.Fatal("fixture entries omit metadata/build.json")
}

func writeBundleFixture(t *testing.T, path string, entries []bundleFixtureEntry) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	gzipWriter, err := gzip.NewWriterLevel(file, gzip.BestCompression)
	if err != nil {
		file.Close()
		t.Fatal(err)
	}
	gzipWriter.Header.ModTime = time.Unix(0, 0).UTC()
	gzipWriter.Header.OS = 255
	tarWriter := tar.NewWriter(gzipWriter)
	for _, entry := range entries {
		size := int64(len(entry.Data))
		if entry.Type != tar.TypeReg {
			size = 0
		}
		header := normalizedTarHeader(entry.Name, entry.Mode, size)
		header.Typeflag = entry.Type
		header.Linkname = entry.Linkname
		if err := tarWriter.WriteHeader(header); err != nil {
			tarWriter.Close()
			gzipWriter.Close()
			file.Close()
			t.Fatal(err)
		}
		if entry.Type == tar.TypeReg && len(entry.Data) != 0 {
			if _, err := tarWriter.Write(entry.Data); err != nil {
				tarWriter.Close()
				gzipWriter.Close()
				file.Close()
				t.Fatal(err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		gzipWriter.Close()
		file.Close()
		t.Fatal(err)
	}
	if err := gzipWriter.Close(); err != nil {
		file.Close()
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o444); err != nil {
		t.Fatal(err)
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

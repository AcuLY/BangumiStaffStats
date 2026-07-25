//go:build artifacts

package main

import (
	"archive/tar"
	"bufio"
	"bytes"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"debug/buildinfo"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strings"
	"time"
)

const (
	componentID                    = "backend"
	requiredBuildkitVersion        = "0.27.1"
	requiredBuildxVersion          = "0.34.1"
	requiredBuildkitImageDigest    = "sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368"
	requiredBuildkitImageInputPath = "toolchain/buildkit-image"
	requiredGoVersion              = "go1.26.5"
	apiModulePath                  = "github.com/AcuLY/BangumiStaffStats/backend/cmd/api"
	checksumFileName               = "checksums.sha256"
	sbomFileName                   = "backend.spdx.json"
	statementFileName              = "component-statement.json"
)

var (
	gitIDPattern       = regexp.MustCompile(`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`)
	digestPattern      = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	pathPattern        = regexp.MustCompile(`^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$`)
	imageReferenceExpr = regexp.MustCompile(`^[A-Za-z0-9._/:+-]+@sha256:[0-9a-f]{64}$`)
)

type sourceIdentity struct {
	Revision string `json:"revision"`
	Tree     string `json:"tree"`
}

type targetPlatform struct {
	OS           string `json:"os"`
	Architecture string `json:"architecture"`
}

type toolFact struct {
	Name    string `json:"name"`
	Version string `json:"version"`
}

func requiredToolchain() []toolFact {
	return []toolFact{
		{Name: "buildkit", Version: requiredBuildkitVersion},
		{Name: "docker-buildx", Version: requiredBuildxVersion},
		{Name: "go", Version: strings.TrimPrefix(requiredGoVersion, "go")},
	}
}

type baseImageFact struct {
	Reference string `json:"reference"`
}

type inputFact struct {
	Path   string `json:"path"`
	SHA256 string `json:"sha256"`
}

type versionRange struct {
	Minimum int `json:"minimum"`
	Maximum int `json:"maximum"`
}

type archiveCompatibility struct {
	ManifestSchemaVersion versionRange `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion   versionRange `json:"sqliteSchemaVersion"`
	ManifestSchemaDigest  string       `json:"manifestSchemaDigest"`
	SchemaSQLDigest       string       `json:"schemaSqlDigest"`
}

type compatibilityFacts struct {
	Archive       archiveCompatibility `json:"archive"`
	OpenAPIDigest string               `json:"openapiDigest"`
}

type imageMetadata struct {
	IndexSHA256    string   `json:"indexSha256"`
	ManifestDigest string   `json:"manifestDigest"`
	ConfigDigest   string   `json:"configDigest"`
	LayerDigests   []string `json:"layerDigests"`
	User           string   `json:"user"`
	Entrypoint     []string `json:"entrypoint"`
	OCITarSHA256   string   `json:"ociTarSha256"`
}

type bundleMetadata struct {
	SchemaVersion int                `json:"schemaVersion"`
	Component     string             `json:"component"`
	Source        sourceIdentity     `json:"source"`
	Target        targetPlatform     `json:"target"`
	Toolchain     []toolFact         `json:"toolchain"`
	BaseImages    []baseImageFact    `json:"baseImages"`
	Inputs        []inputFact        `json:"inputs"`
	Compatibility compatibilityFacts `json:"compatibility"`
	Image         imageMetadata      `json:"image"`
}

type fileRecord struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type ociDescriptor struct {
	MediaType string          `json:"mediaType"`
	Digest    string          `json:"digest"`
	Size      int64           `json:"size"`
	Platform  *targetPlatform `json:"platform,omitempty"`
}

type ociIndex struct {
	SchemaVersion int             `json:"schemaVersion"`
	MediaType     string          `json:"mediaType"`
	Manifests     []ociDescriptor `json:"manifests"`
}

type ociManifest struct {
	SchemaVersion int             `json:"schemaVersion"`
	MediaType     string          `json:"mediaType"`
	Config        ociDescriptor   `json:"config"`
	Layers        []ociDescriptor `json:"layers"`
}

type ociConfig struct {
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
	Config       struct {
		User       string            `json:"User"`
		Entrypoint []string          `json:"Entrypoint"`
		Labels     map[string]string `json:"Labels"`
	} `json:"config"`
}

type spdxChecksum struct {
	Algorithm     string `json:"algorithm"`
	ChecksumValue string `json:"checksumValue"`
}

type spdxPackage struct {
	Name               string         `json:"name"`
	SPDXID             string         `json:"SPDXID"`
	VersionInfo        string         `json:"versionInfo,omitempty"`
	Supplier           string         `json:"supplier"`
	DownloadLocation   string         `json:"downloadLocation"`
	FilesAnalyzed      bool           `json:"filesAnalyzed"`
	Checksums          []spdxChecksum `json:"checksums,omitempty"`
	LicenseConcluded   string         `json:"licenseConcluded"`
	LicenseDeclared    string         `json:"licenseDeclared"`
	CopyrightText      string         `json:"copyrightText"`
	PrimaryPackageType string         `json:"primaryPackagePurpose,omitempty"`
	Comment            string         `json:"comment,omitempty"`
}

type spdxRelationship struct {
	SPDXElementID      string `json:"spdxElementId"`
	RelationshipType   string `json:"relationshipType"`
	RelatedSPDXElement string `json:"relatedSpdxElement"`
}

type spdxDocument struct {
	SPDXVersion       string `json:"spdxVersion"`
	DataLicense       string `json:"dataLicense"`
	SPDXID            string `json:"SPDXID"`
	Name              string `json:"name"`
	DocumentNamespace string `json:"documentNamespace"`
	CreationInfo      struct {
		Created  string   `json:"created"`
		Creators []string `json:"creators"`
	} `json:"creationInfo"`
	Packages      []spdxPackage      `json:"packages"`
	Relationships []spdxRelationship `json:"relationships"`
}

type evidenceRecord struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type sbomEvidence struct {
	Path              string `json:"path"`
	Size              int64  `json:"size"`
	SHA256            string `json:"sha256"`
	DocumentNamespace string `json:"documentNamespace"`
	PackageCount      int    `json:"packageCount"`
}

type componentStatement struct {
	SchemaVersion     int                `json:"schemaVersion"`
	Component         string             `json:"component"`
	Source            sourceIdentity     `json:"source"`
	Target            targetPlatform     `json:"target"`
	Toolchain         []toolFact         `json:"toolchain"`
	BaseImages        []baseImageFact    `json:"baseImages"`
	Inputs            []inputFact        `json:"inputs"`
	Compatibility     compatibilityFacts `json:"compatibility"`
	Artifacts         []fileRecord       `json:"artifacts"`
	ArtifactSetDigest string             `json:"artifactSetDigest"`
	ChecksumInventory evidenceRecord     `json:"checksumInventory"`
	SBOM              sbomEvidence       `json:"sbom"`
}

func main() {
	if len(os.Args) < 2 {
		exitError(errors.New("usage: go run ./build <package|verify|publish|probe> [flags]"))
	}

	var err error
	switch os.Args[1] {
	case "package":
		err = packageCommand(os.Args[2:])
	case "verify":
		err = verifyCommand(os.Args[2:])
	case "publish":
		err = publishCommand(os.Args[2:])
	case "probe":
		err = probeCommand(os.Args[2:])
	default:
		err = fmt.Errorf("unknown command %q", os.Args[1])
	}
	if err != nil {
		exitError(err)
	}
}

func exitError(err error) {
	fmt.Fprintf(os.Stderr, "backend artifact: %v\n", err)
	os.Exit(1)
}

type packageOptions struct {
	BinaryPath                  string
	OCILayoutPath               string
	OutputPath                  string
	SourceRevision              string
	SourceTree                  string
	TargetOS                    string
	TargetArchitecture          string
	OpenAPIDigest               string
	ArchiveManifestSchemaDigest string
	ArchiveSchemaSQLDigest      string
	GoImageReference            string
	RuntimeImageReference       string
	Inputs                      inputFlags
}

type inputFlags []inputFact

func (values *inputFlags) String() string {
	parts := make([]string, 0, len(*values))
	for _, value := range *values {
		parts = append(parts, value.Path+"="+value.SHA256)
	}
	return strings.Join(parts, ",")
}

func (values *inputFlags) Set(raw string) error {
	path, digest, found := strings.Cut(raw, "=")
	if !found || !safeRelativePath(path) || !digestPattern.MatchString(digest) {
		return fmt.Errorf("input must be safe/path=sha256:<64 lowercase hex>, got %q", raw)
	}
	*values = append(*values, inputFact{Path: path, SHA256: digest})
	return nil
}

func packageCommand(arguments []string) error {
	options, err := parsePackageOptions(arguments)
	if err != nil {
		return err
	}
	if err := validatePackageOptions(options); err != nil {
		return err
	}
	if err := ensureNewDirectory(options.OutputPath); err != nil {
		return err
	}

	build, err := buildinfo.ReadFile(options.BinaryPath)
	if err != nil {
		return fmt.Errorf("read API build info: %w", err)
	}
	if err := validateBuildInfo(build, options.TargetOS, options.TargetArchitecture); err != nil {
		return err
	}

	image, err := inspectOCI(options.OCILayoutPath, options)
	if err != nil {
		return err
	}
	ociName := fmt.Sprintf(
		"backend-api-%s-%s.oci.tar",
		options.TargetOS,
		options.TargetArchitecture,
	)
	ociPath := filepath.Join(options.OutputPath, ociName)
	if err := writeNormalizedDirectoryTar(options.OCILayoutPath, ociPath); err != nil {
		return fmt.Errorf("normalize OCI archive: %w", err)
	}
	ociDigest, _, err := digestFile(ociPath)
	if err != nil {
		return err
	}
	image.OCITarSHA256 = ociDigest

	metadata := bundleMetadata{
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
		Inputs: options.Inputs,
		Compatibility: compatibilityFacts{
			Archive: archiveCompatibility{
				ManifestSchemaVersion: versionRange{Minimum: 1, Maximum: 1},
				SQLiteSchemaVersion:   versionRange{Minimum: 1, Maximum: 1},
				ManifestSchemaDigest:  options.ArchiveManifestSchemaDigest,
				SchemaSQLDigest:       options.ArchiveSchemaSQLDigest,
			},
			OpenAPIDigest: options.OpenAPIDigest,
		},
		Image: image,
	}
	bundleName := fmt.Sprintf(
		"backend-api-%s-%s.tar.gz",
		options.TargetOS,
		options.TargetArchitecture,
	)
	bundlePath := filepath.Join(options.OutputPath, bundleName)
	if err := writeBundle(options.BinaryPath, bundlePath, metadata); err != nil {
		return fmt.Errorf("write API bundle: %w", err)
	}

	records, err := inventoryFiles(options.OutputPath, []string{bundleName, ociName})
	if err != nil {
		return err
	}
	checksumPath := filepath.Join(options.OutputPath, checksumFileName)
	if err := writeChecksumInventory(checksumPath, records); err != nil {
		return err
	}
	inventoryDigest, _, err := digestFile(checksumPath)
	if err != nil {
		return err
	}
	sbomPath := filepath.Join(options.OutputPath, sbomFileName)
	sbom, err := writeSPDX(sbomPath, inventoryDigest, records, build)
	if err != nil {
		return err
	}
	inventoryEvidence, err := evidenceForFile(options.OutputPath, checksumFileName)
	if err != nil {
		return err
	}
	sbomFileEvidence, err := evidenceForFile(options.OutputPath, sbomFileName)
	if err != nil {
		return err
	}
	setDigest, err := canonicalValueDigest(records)
	if err != nil {
		return err
	}
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
		Toolchain:  requiredToolchain(),
		BaseImages: metadata.BaseImages,
		Inputs:     options.Inputs,
		Compatibility: compatibilityFacts{
			Archive: archiveCompatibility{
				ManifestSchemaVersion: versionRange{Minimum: 1, Maximum: 1},
				SQLiteSchemaVersion:   versionRange{Minimum: 1, Maximum: 1},
				ManifestSchemaDigest:  options.ArchiveManifestSchemaDigest,
				SchemaSQLDigest:       options.ArchiveSchemaSQLDigest,
			},
			OpenAPIDigest: options.OpenAPIDigest,
		},
		Artifacts:         records,
		ArtifactSetDigest: setDigest,
		ChecksumInventory: inventoryEvidence,
		SBOM: sbomEvidence{
			Path:              sbomFileEvidence.Path,
			Size:              sbomFileEvidence.Size,
			SHA256:            sbomFileEvidence.SHA256,
			DocumentNamespace: sbom.DocumentNamespace,
			PackageCount:      len(sbom.Packages),
		},
	}
	statementPath := filepath.Join(options.OutputPath, statementFileName)
	if err := writeCanonicalJSONFile(statementPath, statement); err != nil {
		return err
	}

	result := struct {
		Artifacts []fileRecord  `json:"artifacts"`
		Checksums string        `json:"checksums"`
		SBOM      string        `json:"sbom"`
		Statement string        `json:"statement"`
		Image     imageMetadata `json:"image"`
	}{
		Artifacts: records,
		Checksums: checksumPath,
		SBOM:      sbomPath,
		Statement: statementPath,
		Image:     image,
	}
	return writeCanonicalJSON(os.Stdout, result)
}

func parsePackageOptions(arguments []string) (packageOptions, error) {
	var options packageOptions
	flags := flag.NewFlagSet("package", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.StringVar(&options.BinaryPath, "binary", "", "built API executable")
	flags.StringVar(&options.OCILayoutPath, "oci-layout", "", "OCI layout directory")
	flags.StringVar(&options.OutputPath, "output", "", "new output directory")
	flags.StringVar(&options.SourceRevision, "source-revision", "", "40-hex source revision")
	flags.StringVar(&options.SourceTree, "source-tree", "", "40-hex source tree")
	flags.StringVar(&options.TargetOS, "target-os", "linux", "target operating system")
	flags.StringVar(&options.TargetArchitecture, "target-arch", "", "target architecture")
	flags.StringVar(&options.OpenAPIDigest, "openapi-sha256", "", "OpenAPI SHA-256")
	flags.StringVar(
		&options.ArchiveManifestSchemaDigest,
		"archive-manifest-schema-sha256",
		"",
		"Archive manifest schema SHA-256",
	)
	flags.StringVar(
		&options.ArchiveSchemaSQLDigest,
		"archive-schema-sql-sha256",
		"",
		"Archive schema SQL SHA-256",
	)
	flags.StringVar(
		&options.GoImageReference,
		"go-image",
		"",
		"pinned Go image reference including digest",
	)
	flags.StringVar(
		&options.RuntimeImageReference,
		"runtime-image",
		"",
		"pinned runtime image reference including digest",
	)
	flags.Var(&options.Inputs, "input", "declared repository-relative path=sha256:<hex>")
	if err := flags.Parse(arguments); err != nil {
		return packageOptions{}, err
	}
	if flags.NArg() != 0 {
		return packageOptions{}, fmt.Errorf("unexpected package arguments: %v", flags.Args())
	}
	return options, nil
}

func validatePackageOptions(options packageOptions) error {
	for name, value := range map[string]string{
		"binary":          options.BinaryPath,
		"oci-layout":      options.OCILayoutPath,
		"output":          options.OutputPath,
		"go-image":        options.GoImageReference,
		"runtime-image":   options.RuntimeImageReference,
		"target-arch":     options.TargetArchitecture,
		"source-revision": options.SourceRevision,
		"source-tree":     options.SourceTree,
	} {
		if value == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	if !gitIDPattern.MatchString(options.SourceRevision) {
		return errors.New("source revision must be 40 or 64 lowercase hex characters")
	}
	if !gitIDPattern.MatchString(options.SourceTree) {
		return errors.New("source tree must be 40 or 64 lowercase hex characters")
	}
	if options.TargetOS != "linux" {
		return fmt.Errorf("unsupported target OS %q", options.TargetOS)
	}
	if options.TargetArchitecture != "amd64" && options.TargetArchitecture != "arm64" {
		return fmt.Errorf("unsupported target architecture %q", options.TargetArchitecture)
	}
	for name, value := range map[string]string{
		"openapi":                 options.OpenAPIDigest,
		"archive manifest schema": options.ArchiveManifestSchemaDigest,
		"archive schema SQL":      options.ArchiveSchemaSQLDigest,
	} {
		if !digestPattern.MatchString(value) {
			return fmt.Errorf("%s digest must be canonical sha256:<hex>", name)
		}
	}
	if !imageReferenceExpr.MatchString(options.GoImageReference) ||
		!imageReferenceExpr.MatchString(options.RuntimeImageReference) {
		return errors.New("base image references must include canonical sha256 digests")
	}
	if !strings.Contains(options.GoImageReference, requiredGoVersion[2:]) {
		return fmt.Errorf("Go image does not identify %s", requiredGoVersion)
	}
	if len(options.Inputs) == 0 {
		return errors.New("at least one declared input is required")
	}
	sort.Slice(options.Inputs, func(left, right int) bool {
		return options.Inputs[left].Path < options.Inputs[right].Path
	})
	foundBuildkitImage := false
	for index, input := range options.Inputs {
		if index > 0 && options.Inputs[index-1].Path == input.Path {
			return fmt.Errorf("duplicate declared input %q", input.Path)
		}
		if input.Path == requiredBuildkitImageInputPath {
			foundBuildkitImage = true
			if input.SHA256 != requiredBuildkitImageDigest {
				return fmt.Errorf(
					"BuildKit image digest = %q, want %q",
					input.SHA256,
					requiredBuildkitImageDigest,
				)
			}
		}
	}
	if !foundBuildkitImage {
		return fmt.Errorf("declared inputs omit %q", requiredBuildkitImageInputPath)
	}
	return nil
}

func validateBuildInfo(
	build *buildinfo.BuildInfo,
	targetOS string,
	targetArchitecture string,
) error {
	if build == nil {
		return errors.New("API binary has no Go build information")
	}
	if build.GoVersion != requiredGoVersion {
		return fmt.Errorf("API Go version = %q, want %q", build.GoVersion, requiredGoVersion)
	}
	if build.Path != apiModulePath {
		return fmt.Errorf("API module path = %q, want %q", build.Path, apiModulePath)
	}
	settings := make(map[string]string, len(build.Settings))
	for _, setting := range build.Settings {
		settings[setting.Key] = setting.Value
	}
	if settings["GOOS"] != targetOS || settings["GOARCH"] != targetArchitecture {
		return fmt.Errorf(
			"API target = %s/%s, want %s/%s",
			settings["GOOS"],
			settings["GOARCH"],
			targetOS,
			targetArchitecture,
		)
	}
	if settings["CGO_ENABLED"] != "0" {
		return fmt.Errorf("API CGO_ENABLED = %q, want 0", settings["CGO_ENABLED"])
	}
	for key := range settings {
		if strings.HasPrefix(key, "vcs.") {
			return fmt.Errorf("API contains nondeterministic VCS build setting %q", key)
		}
	}
	return nil
}

func ensureNewDirectory(path string) error {
	info, err := os.Lstat(path)
	if err == nil {
		if !info.IsDir() {
			return fmt.Errorf("output exists and is not a directory: %s", path)
		}
		entries, readErr := os.ReadDir(path)
		if readErr != nil {
			return readErr
		}
		if len(entries) != 0 {
			return fmt.Errorf("output directory is not empty: %s", path)
		}
		return nil
	}
	if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	return os.MkdirAll(path, 0o755)
}

func inspectOCI(layoutPath string, options packageOptions) (imageMetadata, error) {
	indexPath := filepath.Join(layoutPath, "index.json")
	var index ociIndex
	if err := decodeJSONFile(indexPath, &index); err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI index: %w", err)
	}
	if index.SchemaVersion != 2 || len(index.Manifests) != 1 {
		return imageMetadata{}, fmt.Errorf(
			"OCI index must contain exactly one schema-v2 manifest, got schema=%d manifests=%d",
			index.SchemaVersion,
			len(index.Manifests),
		)
	}
	manifestDescriptor := index.Manifests[0]
	if manifestDescriptor.Platform == nil ||
		manifestDescriptor.Platform.OS != options.TargetOS ||
		manifestDescriptor.Platform.Architecture != options.TargetArchitecture {
		return imageMetadata{}, fmt.Errorf("OCI manifest platform does not match target")
	}
	manifestBytes, err := readDescriptor(layoutPath, manifestDescriptor)
	if err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI manifest: %w", err)
	}
	var manifest ociManifest
	if err := decodeJSON(manifestBytes, &manifest); err != nil {
		return imageMetadata{}, fmt.Errorf("decode OCI manifest: %w", err)
	}
	if manifest.SchemaVersion != 2 || len(manifest.Layers) == 0 {
		return imageMetadata{}, errors.New("OCI manifest is missing its runtime layers")
	}
	configBytes, err := readDescriptor(layoutPath, manifest.Config)
	if err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI config: %w", err)
	}
	var config ociConfig
	if err := decodeJSON(configBytes, &config); err != nil {
		return imageMetadata{}, fmt.Errorf("decode OCI config: %w", err)
	}
	if config.OS != options.TargetOS || config.Architecture != options.TargetArchitecture {
		return imageMetadata{}, fmt.Errorf("OCI config platform does not match target")
	}
	if isRootUser(config.Config.User) {
		return imageMetadata{}, fmt.Errorf("OCI runtime user is not non-root: %q", config.Config.User)
	}
	if !slices.Equal(config.Config.Entrypoint, []string{"/usr/local/bin/bgmss-api"}) {
		return imageMetadata{}, fmt.Errorf("unexpected OCI entrypoint: %v", config.Config.Entrypoint)
	}
	requiredLabels := map[string]string{
		"org.opencontainers.image.revision":       options.SourceRevision,
		"io.bgmss.source-tree":                    options.SourceTree,
		"io.bgmss.openapi.sha256":                 options.OpenAPIDigest,
		"io.bgmss.archive-manifest-schema.sha256": options.ArchiveManifestSchemaDigest,
		"io.bgmss.archive-schema-sql.sha256":      options.ArchiveSchemaSQLDigest,
	}
	for key, expected := range requiredLabels {
		if config.Config.Labels[key] != expected {
			return imageMetadata{}, fmt.Errorf("OCI label %q does not match declared input", key)
		}
	}
	layers := make([]string, 0, len(manifest.Layers))
	for _, descriptor := range manifest.Layers {
		if _, err := readDescriptor(layoutPath, descriptor); err != nil {
			return imageMetadata{}, fmt.Errorf("read OCI layer %q: %w", descriptor.Digest, err)
		}
		layers = append(layers, descriptor.Digest)
	}
	indexDigest, _, err := digestFile(indexPath)
	if err != nil {
		return imageMetadata{}, err
	}
	return imageMetadata{
		IndexSHA256:    indexDigest,
		ManifestDigest: manifestDescriptor.Digest,
		ConfigDigest:   manifest.Config.Digest,
		LayerDigests:   layers,
		User:           config.Config.User,
		Entrypoint:     config.Config.Entrypoint,
	}, nil
}

func isRootUser(user string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(user))
	if trimmed == "" || trimmed == "root" || trimmed == "0" || trimmed == "0:0" {
		return true
	}
	uid := strings.SplitN(trimmed, ":", 2)[0]
	return uid == "root" || uid == "0"
}

func readDescriptor(layoutPath string, descriptor ociDescriptor) ([]byte, error) {
	if !digestPattern.MatchString(descriptor.Digest) || descriptor.Size < 0 {
		return nil, errors.New("invalid OCI descriptor")
	}
	parts := strings.SplitN(descriptor.Digest, ":", 2)
	path := filepath.Join(layoutPath, "blobs", parts[0], parts[1])
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	actual := "sha256:" + hashBytes(data)
	if actual != descriptor.Digest || int64(len(data)) != descriptor.Size {
		return nil, fmt.Errorf(
			"descriptor mismatch: digest=%s/%s size=%d/%d",
			actual,
			descriptor.Digest,
			len(data),
			descriptor.Size,
		)
	}
	return data, nil
}

func decodeJSONFile(path string, destination any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return decodeJSON(data, destination)
}

func decodeJSON(data []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("JSON contains trailing value")
		}
		return fmt.Errorf("JSON contains trailing content: %w", err)
	}
	return nil
}

func decodeStrictJSONFile(path string, destination any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return decodeStrictJSON(data, destination)
}

func decodeStrictJSON(data []byte, destination any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		if err == nil {
			return errors.New("JSON contains trailing value")
		}
		return fmt.Errorf("JSON contains trailing content: %w", err)
	}
	return nil
}

func writeNormalizedDirectoryTar(sourcePath string, outputPath string) error {
	var paths []string
	err := filepath.WalkDir(sourcePath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if path == sourcePath {
			return nil
		}
		relative, err := filepath.Rel(sourcePath, path)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		if !safeRelativePath(relative) {
			return fmt.Errorf("unsafe OCI path %q", relative)
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		if !info.IsDir() && !info.Mode().IsRegular() {
			return fmt.Errorf("unsupported OCI entry %q", relative)
		}
		paths = append(paths, relative)
		return nil
	})
	if err != nil {
		return err
	}
	sort.Strings(paths)

	return atomicWrite(outputPath, 0o444, func(writer io.Writer) error {
		tarWriter := tar.NewWriter(writer)
		for _, relative := range paths {
			source := filepath.Join(sourcePath, filepath.FromSlash(relative))
			info, err := os.Lstat(source)
			if err != nil {
				return err
			}
			name := relative
			mode := int64(0o444)
			size := info.Size()
			if info.IsDir() {
				name += "/"
				mode = 0o555
				size = 0
			}
			header := normalizedTarHeader(name, mode, size)
			if info.IsDir() {
				header.Typeflag = tar.TypeDir
			}
			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}
			if info.Mode().IsRegular() {
				file, err := os.Open(source)
				if err != nil {
					return err
				}
				_, copyErr := io.Copy(tarWriter, file)
				closeErr := file.Close()
				if copyErr != nil {
					return copyErr
				}
				if closeErr != nil {
					return closeErr
				}
			}
		}
		return tarWriter.Close()
	})
}

func normalizedTarHeader(name string, mode int64, size int64) *tar.Header {
	epoch := time.Unix(0, 0).UTC()
	return &tar.Header{
		Typeflag: tar.TypeReg,
		Name:     name,
		Mode:     mode,
		Size:     size,
		Uid:      0,
		Gid:      0,
		ModTime:  epoch,
		Format:   tar.FormatUSTAR,
	}
}

func writeBundle(binaryPath string, outputPath string, metadata bundleMetadata) error {
	metadataBytes, err := canonicalJSONBytes(metadata)
	if err != nil {
		return err
	}
	binaryInfo, err := os.Lstat(binaryPath)
	if err != nil {
		return err
	}
	if !binaryInfo.Mode().IsRegular() {
		return errors.New("API binary is not a regular file")
	}

	return atomicWrite(outputPath, 0o444, func(writer io.Writer) error {
		gzipWriter, err := gzip.NewWriterLevel(writer, gzip.BestCompression)
		if err != nil {
			return err
		}
		gzipWriter.Header.ModTime = time.Unix(0, 0).UTC()
		gzipWriter.Header.OS = 255
		tarWriter := tar.NewWriter(gzipWriter)
		entries := []struct {
			Name string
			Mode int64
			Data []byte
			Path string
		}{
			{Name: "bin/", Mode: 0o555},
			{Name: "bin/bgmss-api", Mode: 0o555, Path: binaryPath},
			{Name: "metadata/", Mode: 0o555},
			{Name: "metadata/build.json", Mode: 0o444, Data: metadataBytes},
		}
		for _, entry := range entries {
			size := int64(len(entry.Data))
			if entry.Path != "" {
				size = binaryInfo.Size()
			}
			header := normalizedTarHeader(entry.Name, entry.Mode, size)
			if strings.HasSuffix(entry.Name, "/") {
				header.Typeflag = tar.TypeDir
				header.Size = 0
			}
			if err := tarWriter.WriteHeader(header); err != nil {
				return err
			}
			if entry.Path != "" {
				file, err := os.Open(entry.Path)
				if err != nil {
					return err
				}
				_, copyErr := io.Copy(tarWriter, file)
				closeErr := file.Close()
				if copyErr != nil {
					return copyErr
				}
				if closeErr != nil {
					return closeErr
				}
			} else if len(entry.Data) != 0 {
				if _, err := tarWriter.Write(entry.Data); err != nil {
					return err
				}
			}
		}
		if err := tarWriter.Close(); err != nil {
			return err
		}
		return gzipWriter.Close()
	})
}

func atomicWrite(path string, mode fs.FileMode, write func(io.Writer) error) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err := write(temporary); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Sync(); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Chmod(mode); err != nil {
		temporary.Close()
		return err
	}
	if err := temporary.Close(); err != nil {
		return err
	}
	if _, err := os.Lstat(path); !errors.Is(err, fs.ErrNotExist) {
		if err == nil {
			return fmt.Errorf("refusing to overwrite %s", path)
		}
		return err
	}
	return os.Rename(temporaryPath, path)
}

func inventoryFiles(root string, names []string) ([]fileRecord, error) {
	unique := make(map[string]struct{}, len(names))
	records := make([]fileRecord, 0, len(names))
	for _, name := range names {
		if !safeRelativePath(name) || strings.Contains(name, "/") {
			return nil, fmt.Errorf("artifact name must be a safe top-level path: %q", name)
		}
		if _, exists := unique[name]; exists {
			return nil, fmt.Errorf("duplicate artifact name %q", name)
		}
		unique[name] = struct{}{}
		digest, size, err := digestFile(filepath.Join(root, name))
		if err != nil {
			return nil, err
		}
		records = append(records, fileRecord{Path: name, Size: size, SHA256: digest})
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].Path < records[right].Path
	})
	return records, nil
}

func writeChecksumInventory(path string, records []fileRecord) error {
	var buffer bytes.Buffer
	previous := ""
	for _, record := range records {
		if !safeRelativePath(record.Path) || record.Path <= previous {
			return errors.New("checksum records are not strictly sorted safe paths")
		}
		if !digestPattern.MatchString(record.SHA256) {
			return fmt.Errorf("invalid artifact digest for %q", record.Path)
		}
		fmt.Fprintf(&buffer, "%s  %s\n", strings.TrimPrefix(record.SHA256, "sha256:"), record.Path)
		previous = record.Path
	}
	return atomicWrite(path, 0o444, func(writer io.Writer) error {
		_, err := writer.Write(buffer.Bytes())
		return err
	})
}

func writeSPDX(
	path string,
	inventoryDigest string,
	artifacts []fileRecord,
	build *buildinfo.BuildInfo,
) (spdxDocument, error) {
	if !digestPattern.MatchString(inventoryDigest) {
		return spdxDocument{}, errors.New("invalid inventory digest for SPDX namespace")
	}
	namespaceSuffix := strings.TrimPrefix(inventoryDigest, "sha256:")
	document := spdxDocument{
		SPDXVersion: "SPDX-2.3",
		DataLicense: "CC0-1.0",
		SPDXID:      "SPDXRef-DOCUMENT",
		Name:        "bangumi-staff-stats-backend-" + namespaceSuffix,
		DocumentNamespace: "https://spdx.bangumi-staff-stats.invalid/backend/sha256-" +
			namespaceSuffix,
	}
	document.CreationInfo.Created = "1970-01-01T00:00:00Z"
	document.CreationInfo.Creators = []string{"Tool: backend/build"}

	rootIDs := make([]string, 0, len(artifacts))
	for _, artifact := range artifacts {
		id := stableSPDXID("artifact-" + artifact.Path)
		rootIDs = append(rootIDs, id)
		document.Packages = append(document.Packages, spdxPackage{
			Name:               artifact.Path,
			SPDXID:             id,
			Supplier:           "Organization: Bangumi Staff Statistics contributors",
			DownloadLocation:   "NOASSERTION",
			FilesAnalyzed:      false,
			Checksums:          []spdxChecksum{{Algorithm: "SHA256", ChecksumValue: strings.TrimPrefix(artifact.SHA256, "sha256:")}},
			LicenseConcluded:   "NOASSERTION",
			LicenseDeclared:    "NOASSERTION",
			CopyrightText:      "NOASSERTION",
			PrimaryPackageType: "APPLICATION",
		})
		document.Relationships = append(document.Relationships, spdxRelationship{
			SPDXElementID:      "SPDXRef-DOCUMENT",
			RelationshipType:   "DESCRIBES",
			RelatedSPDXElement: id,
		})
	}

	dependencies := runtimeDependencies(build)
	for _, dependency := range dependencies {
		id := stableSPDXID("dependency-" + dependency.Name + "@" + dependency.VersionInfo)
		dependency.SPDXID = id
		document.Packages = append(document.Packages, dependency)
		for _, rootID := range rootIDs {
			document.Relationships = append(document.Relationships, spdxRelationship{
				SPDXElementID:      rootID,
				RelationshipType:   "DEPENDS_ON",
				RelatedSPDXElement: id,
			})
		}
	}
	sort.Slice(document.Packages, func(left, right int) bool {
		return document.Packages[left].SPDXID < document.Packages[right].SPDXID
	})
	sort.Slice(document.Relationships, func(left, right int) bool {
		a := document.Relationships[left]
		b := document.Relationships[right]
		return a.SPDXElementID+"\x00"+a.RelationshipType+"\x00"+a.RelatedSPDXElement <
			b.SPDXElementID+"\x00"+b.RelationshipType+"\x00"+b.RelatedSPDXElement
	})
	if err := writeCanonicalJSONFile(path, document); err != nil {
		return spdxDocument{}, err
	}
	return document, nil
}

func runtimeDependencies(build *buildinfo.BuildInfo) []spdxPackage {
	result := []spdxPackage{{
		Name:             "go-runtime",
		VersionInfo:      build.GoVersion,
		Supplier:         "Organization: The Go Authors",
		DownloadLocation: "NOASSERTION",
		FilesAnalyzed:    false,
		LicenseConcluded: "BSD-3-Clause",
		LicenseDeclared:  "BSD-3-Clause",
		CopyrightText:    "NOASSERTION",
	}}
	seen := make(map[string]struct{}, len(build.Deps))
	for _, module := range build.Deps {
		if module == nil {
			continue
		}
		original := module
		actual := module
		comment := ""
		if module.Replace != nil {
			actual = module.Replace
			comment = fmt.Sprintf(
				"Replaces %s@%s.",
				original.Path,
				original.Version,
			)
		}
		key := actual.Path + "\x00" + actual.Version + "\x00" + actual.Sum
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		entry := spdxPackage{
			Name:             actual.Path,
			VersionInfo:      actual.Version,
			Supplier:         "NOASSERTION",
			DownloadLocation: "NOASSERTION",
			FilesAnalyzed:    false,
			LicenseConcluded: "NOASSERTION",
			LicenseDeclared:  "NOASSERTION",
			CopyrightText:    "NOASSERTION",
			Comment:          comment,
		}
		if checksum, ok := goSumSHA256(actual.Sum); ok {
			entry.Checksums = []spdxChecksum{{Algorithm: "SHA256", ChecksumValue: checksum}}
		}
		result = append(result, entry)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].Name+"\x00"+result[left].VersionInfo <
			result[right].Name+"\x00"+result[right].VersionInfo
	})
	return result
}

func goSumSHA256(sum string) (string, bool) {
	if !strings.HasPrefix(sum, "h1:") {
		return "", false
	}
	decoded, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(sum, "h1:"))
	if err != nil || len(decoded) != sha256.Size {
		return "", false
	}
	return hex.EncodeToString(decoded), true
}

func stableSPDXID(value string) string {
	digest := sha256.Sum256([]byte(value))
	return "SPDXRef-Package-" + hex.EncodeToString(digest[:12])
}

func verifyCommand(arguments []string) error {
	flags := flag.NewFlagSet("verify", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var root string
	flags.StringVar(&root, "artifact-root", "", "artifact directory")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if root == "" || flags.NArg() != 0 {
		return errors.New("verify requires --artifact-root and no positional arguments")
	}
	records, err := parseChecksumInventory(filepath.Join(root, checksumFileName))
	if err != nil {
		return err
	}
	actual, err := distributedFiles(root)
	if err != nil {
		return err
	}
	if !slices.Equal(records, actual) {
		return fmt.Errorf("checksum inventory does not match distributed files")
	}
	sbom, err := verifySPDX(filepath.Join(root, sbomFileName), records)
	if err != nil {
		return err
	}
	statementPath := filepath.Join(root, statementFileName)
	var statement componentStatement
	if err := readCanonicalJSONFile(statementPath, &statement); err != nil {
		return fmt.Errorf("decode component statement: %w", err)
	}
	return verifyStatement(root, statement, records, sbom)
}

func distributedFiles(root string) ([]fileRecord, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil, err
	}
	evidence := map[string]struct{}{
		checksumFileName:  {},
		sbomFileName:      {},
		statementFileName: {},
	}
	var names []string
	for _, entry := range entries {
		name := entry.Name()
		info, err := entry.Info()
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf("artifact root contains non-regular entry %q", name)
		}
		if _, excluded := evidence[name]; excluded {
			continue
		}
		names = append(names, name)
	}
	if len(names) != 2 {
		return nil, fmt.Errorf("artifact root contains %d distributed files, want 2", len(names))
	}
	return inventoryFiles(root, names)
}

func parseChecksumInventory(path string) ([]fileRecord, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var records []fileRecord
	previous := ""
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := scanner.Text()
		parts := strings.SplitN(line, "  ", 2)
		if len(parts) != 2 || len(parts[0]) != 64 {
			return nil, fmt.Errorf("malformed checksum line %q", line)
		}
		if _, err := hex.DecodeString(parts[0]); err != nil {
			return nil, fmt.Errorf("malformed checksum digest %q", parts[0])
		}
		if !safeRelativePath(parts[1]) || strings.Contains(parts[1], "/") || parts[1] <= previous {
			return nil, fmt.Errorf("unsafe or unsorted checksum path %q", parts[1])
		}
		digest, size, err := digestFile(filepath.Join(filepath.Dir(path), parts[1]))
		if err != nil {
			return nil, err
		}
		if digest != "sha256:"+parts[0] {
			return nil, fmt.Errorf("checksum mismatch for %q", parts[1])
		}
		records = append(records, fileRecord{Path: parts[1], Size: size, SHA256: digest})
		previous = parts[1]
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if len(records) == 0 {
		return nil, errors.New("checksum inventory is empty")
	}
	return records, nil
}

func verifySPDX(path string, records []fileRecord) (spdxDocument, error) {
	var document spdxDocument
	if err := readCanonicalJSONFile(path, &document); err != nil {
		return spdxDocument{}, fmt.Errorf("decode SPDX: %w", err)
	}
	if document.SPDXVersion != "SPDX-2.3" ||
		document.DataLicense != "CC0-1.0" ||
		document.SPDXID != "SPDXRef-DOCUMENT" ||
		document.CreationInfo.Created != "1970-01-01T00:00:00Z" {
		return spdxDocument{}, errors.New("SPDX header is not deterministic SPDX 2.3")
	}
	namespacePrefix := "https://spdx.bangumi-staff-stats.invalid/backend/sha256-"
	if !strings.HasPrefix(document.DocumentNamespace, namespacePrefix) ||
		!digestPattern.MatchString(
			"sha256:"+strings.TrimPrefix(document.DocumentNamespace, namespacePrefix),
		) {
		return spdxDocument{}, errors.New("SPDX namespace is not the Backend canonical namespace")
	}
	byName := make(map[string]spdxPackage, len(document.Packages))
	for _, packageRecord := range document.Packages {
		if _, duplicate := byName[packageRecord.Name]; duplicate {
			return spdxDocument{}, fmt.Errorf("duplicate SPDX package %q", packageRecord.Name)
		}
		byName[packageRecord.Name] = packageRecord
	}
	if runtimePackage, ok := byName["go-runtime"]; !ok || runtimePackage.VersionInfo != requiredGoVersion {
		return spdxDocument{}, errors.New("SPDX omits the pinned Go runtime")
	}
	for _, record := range records {
		packageRecord, ok := byName[record.Path]
		if !ok {
			return spdxDocument{}, fmt.Errorf("SPDX omits artifact %q", record.Path)
		}
		if packageRecord.FilesAnalyzed || len(packageRecord.Checksums) != 1 ||
			packageRecord.Checksums[0].Algorithm != "SHA256" ||
			packageRecord.Checksums[0].ChecksumValue != strings.TrimPrefix(record.SHA256, "sha256:") {
			return spdxDocument{}, fmt.Errorf("SPDX checksum mismatch for %q", record.Path)
		}
	}
	return document, nil
}

func verifyStatement(
	root string,
	statement componentStatement,
	records []fileRecord,
	sbom spdxDocument,
) error {
	if statement.SchemaVersion != 1 || statement.Component != componentID {
		return errors.New("component statement identity is not Backend schema v1")
	}
	if !gitIDPattern.MatchString(statement.Source.Revision) ||
		!gitIDPattern.MatchString(statement.Source.Tree) {
		return errors.New("component statement source identity is invalid")
	}
	if statement.Target.OS != "linux" ||
		(statement.Target.Architecture != "amd64" && statement.Target.Architecture != "arm64") {
		return errors.New("component statement target is unsupported")
	}
	if !slices.Equal(
		statement.Toolchain,
		requiredToolchain(),
	) {
		return errors.New(
			"component statement toolchain does not identify pinned BuildKit, Buildx, and Go",
		)
	}
	if len(statement.BaseImages) == 0 {
		return errors.New("component statement omits base images")
	}
	previous := ""
	for _, image := range statement.BaseImages {
		if !imageReferenceExpr.MatchString(image.Reference) || image.Reference <= previous {
			return errors.New("component statement base images are invalid or unsorted")
		}
		previous = image.Reference
	}
	if len(statement.Inputs) == 0 {
		return errors.New("component statement omits declared inputs")
	}
	previous = ""
	foundBuildkitImage := false
	for _, input := range statement.Inputs {
		if !safeRelativePath(input.Path) || !digestPattern.MatchString(input.SHA256) ||
			input.Path <= previous {
			return errors.New("component statement inputs are invalid or unsorted")
		}
		if input.Path == requiredBuildkitImageInputPath {
			foundBuildkitImage = true
			if input.SHA256 != requiredBuildkitImageDigest {
				return errors.New("component statement BuildKit image digest is not pinned")
			}
		}
		previous = input.Path
	}
	if !foundBuildkitImage {
		return errors.New("component statement omits the pinned BuildKit image input")
	}
	compatibility := statement.Compatibility
	if compatibility.Archive.ManifestSchemaVersion != (versionRange{Minimum: 1, Maximum: 1}) ||
		compatibility.Archive.SQLiteSchemaVersion != (versionRange{Minimum: 1, Maximum: 1}) ||
		!digestPattern.MatchString(compatibility.Archive.ManifestSchemaDigest) ||
		!digestPattern.MatchString(compatibility.Archive.SchemaSQLDigest) ||
		!digestPattern.MatchString(compatibility.OpenAPIDigest) {
		return errors.New("component statement compatibility facts are invalid")
	}
	if !slices.Equal(statement.Artifacts, records) {
		return errors.New("component statement artifact inventory does not match checksums")
	}
	setDigest, err := canonicalValueDigest(records)
	if err != nil {
		return err
	}
	if statement.ArtifactSetDigest != setDigest {
		return errors.New("component statement artifact-set digest does not match artifacts")
	}
	inventory, err := evidenceForFile(root, checksumFileName)
	if err != nil {
		return err
	}
	if statement.ChecksumInventory != inventory {
		return errors.New("component statement checksum evidence does not match")
	}
	sbomFile, err := evidenceForFile(root, sbomFileName)
	if err != nil {
		return err
	}
	expectedSBOM := sbomEvidence{
		Path:              sbomFile.Path,
		Size:              sbomFile.Size,
		SHA256:            sbomFile.SHA256,
		DocumentNamespace: sbom.DocumentNamespace,
		PackageCount:      len(sbom.Packages),
	}
	if statement.SBOM != expectedSBOM {
		return errors.New("component statement SBOM evidence does not match")
	}
	return nil
}

func publishCommand(arguments []string) error {
	flags := flag.NewFlagSet("publish", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var source string
	var destinationRoot string
	flags.StringVar(&source, "artifact-root", "", "validated artifact directory")
	flags.StringVar(&destinationRoot, "destination-root", "", "content-addressed root")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if source == "" || destinationRoot == "" || flags.NArg() != 0 {
		return errors.New("publish requires --artifact-root and --destination-root")
	}
	if err := verifyCommand([]string{"--artifact-root", source}); err != nil {
		return fmt.Errorf("refuse unverified publish: %w", err)
	}
	address, entries, err := directoryAddress(source)
	if err != nil {
		return err
	}
	destination := filepath.Join(destinationRoot, "sha256-"+strings.TrimPrefix(address, "sha256:"))
	if _, err := os.Lstat(destination); err == nil {
		if err := compareDirectories(source, destination); err != nil {
			return fmt.Errorf("existing content address disagrees: %w", err)
		}
		fmt.Fprintln(os.Stdout, destination)
		return nil
	} else if !errors.Is(err, fs.ErrNotExist) {
		return err
	}
	if err := os.MkdirAll(destinationRoot, 0o755); err != nil {
		return err
	}
	temporary, err := os.MkdirTemp(destinationRoot, ".incoming-")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temporary)
	for _, entry := range entries {
		if err := copyRegularFile(
			filepath.Join(source, entry),
			filepath.Join(temporary, entry),
			0o444,
		); err != nil {
			return err
		}
	}
	if err := os.Rename(temporary, destination); err != nil {
		return err
	}
	fmt.Fprintln(os.Stdout, destination)
	return nil
}

func directoryAddress(path string) (string, []string, error) {
	entries, err := os.ReadDir(path)
	if err != nil {
		return "", nil, err
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		info, err := entry.Info()
		if err != nil {
			return "", nil, err
		}
		if !info.Mode().IsRegular() || !safeRelativePath(entry.Name()) {
			return "", nil, fmt.Errorf("unsafe content-address input %q", entry.Name())
		}
		names = append(names, entry.Name())
	}
	sort.Strings(names)
	hasher := sha256.New()
	for _, name := range names {
		digest, size, err := digestFile(filepath.Join(path, name))
		if err != nil {
			return "", nil, err
		}
		fmt.Fprintf(hasher, "%s %d %s\n", digest, size, name)
	}
	return "sha256:" + hex.EncodeToString(hasher.Sum(nil)), names, nil
}

func compareDirectories(left string, right string) error {
	leftAddress, leftEntries, err := directoryAddress(left)
	if err != nil {
		return err
	}
	rightAddress, rightEntries, err := directoryAddress(right)
	if err != nil {
		return err
	}
	if leftAddress != rightAddress || !slices.Equal(leftEntries, rightEntries) {
		return errors.New("directory addresses differ")
	}
	for _, name := range leftEntries {
		equal, err := equalFiles(filepath.Join(left, name), filepath.Join(right, name))
		if err != nil {
			return err
		}
		if !equal {
			return fmt.Errorf("file bytes differ for %q", name)
		}
	}
	return nil
}

func copyRegularFile(source string, destination string, mode fs.FileMode) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return fmt.Errorf("source is not a regular file: %s", source)
	}
	return atomicWrite(destination, mode, func(writer io.Writer) error {
		file, err := os.Open(source)
		if err != nil {
			return err
		}
		defer file.Close()
		_, err = io.Copy(writer, file)
		return err
	})
}

func equalFiles(left string, right string) (bool, error) {
	leftDigest, leftSize, err := digestFile(left)
	if err != nil {
		return false, err
	}
	rightDigest, rightSize, err := digestFile(right)
	if err != nil {
		return false, err
	}
	return leftDigest == rightDigest && leftSize == rightSize, nil
}

func probeCommand(arguments []string) error {
	flags := flag.NewFlagSet("probe", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	var rawBaseURL string
	var timeout time.Duration
	flags.StringVar(&rawBaseURL, "base-url", "http://127.0.0.1:8080", "loopback API URL")
	flags.DurationVar(&timeout, "timeout", 20*time.Second, "bounded readiness deadline")
	if err := flags.Parse(arguments); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return fmt.Errorf("unexpected probe arguments: %v", flags.Args())
	}
	baseURL, err := url.Parse(rawBaseURL)
	if err != nil {
		return err
	}
	if baseURL.Scheme != "http" || baseURL.Hostname() != "127.0.0.1" ||
		baseURL.Port() == "" || baseURL.Path != "" ||
		baseURL.RawQuery != "" || baseURL.Fragment != "" {
		return errors.New("probe URL must be an explicit 127.0.0.1 HTTP origin")
	}
	if timeout <= 0 || timeout > time.Minute {
		return errors.New("probe timeout must be in (0, 1m]")
	}
	context, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	client := &http.Client{
		Timeout: 2 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return errors.New("redirects are forbidden")
		},
	}
	var lastErr error
	for {
		lastErr = probeEndpoints(context, client, strings.TrimSuffix(rawBaseURL, "/"))
		if lastErr == nil {
			fmt.Fprintln(os.Stdout, "backend artifact probe passed")
			return nil
		}
		select {
		case <-context.Done():
			return fmt.Errorf("probe deadline reached: %w", lastErr)
		case <-time.After(100 * time.Millisecond):
		}
	}
}

func probeEndpoints(context context.Context, client *http.Client, baseURL string) error {
	for _, endpoint := range []string{"/livez", "/readyz", "/metrics"} {
		request, err := http.NewRequestWithContext(context, http.MethodGet, baseURL+endpoint, nil)
		if err != nil {
			return err
		}
		response, err := client.Do(request)
		if err != nil {
			return err
		}
		body, readErr := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		closeErr := response.Body.Close()
		if readErr != nil {
			return readErr
		}
		if closeErr != nil {
			return closeErr
		}
		if response.StatusCode != http.StatusOK {
			return fmt.Errorf("%s returned %d: %s", endpoint, response.StatusCode, body)
		}
		if endpoint == "/metrics" {
			if !bytes.Contains(body, []byte("bgmss_current_snapshot_info")) ||
				!bytes.HasSuffix(body, []byte("\n")) {
				return errors.New("/metrics response is missing the current snapshot metric")
			}
		} else {
			var envelope map[string]any
			if err := json.Unmarshal(body, &envelope); err != nil {
				return fmt.Errorf("%s returned invalid JSON: %w", endpoint, err)
			}
			if _, ok := envelope["data"]; !ok {
				return fmt.Errorf("%s response is missing data", endpoint)
			}
		}
	}
	return nil
}

func writeCanonicalJSONFile(path string, value any) error {
	return atomicWrite(path, 0o444, func(writer io.Writer) error {
		return writeCanonicalJSON(writer, value)
	})
}

func readCanonicalJSONFile(path string, destination any) error {
	data, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	if err := decodeStrictJSON(data, destination); err != nil {
		return err
	}
	canonical, err := canonicalJSONBytes(destination)
	if err != nil {
		return err
	}
	if !bytes.Equal(data, canonical) {
		return errors.New("JSON is not canonical with one trailing newline")
	}
	return nil
}

func writeCanonicalJSON(writer io.Writer, value any) error {
	data, err := canonicalJSONBytes(value)
	if err != nil {
		return err
	}
	_, err = writer.Write(data)
	return err
}

func canonicalJSONBytes(value any) ([]byte, error) {
	encoded, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	var normalized any
	if err := decoder.Decode(&normalized); err != nil {
		return nil, err
	}
	var buffer bytes.Buffer
	if err := writeCanonicalValue(&buffer, normalized); err != nil {
		return nil, err
	}
	buffer.WriteByte('\n')
	return buffer.Bytes(), nil
}

func writeCanonicalValue(writer *bytes.Buffer, value any) error {
	switch typed := value.(type) {
	case nil:
		writer.WriteString("null")
	case bool:
		if typed {
			writer.WriteString("true")
		} else {
			writer.WriteString("false")
		}
	case string:
		encoded, err := json.Marshal(typed)
		if err != nil {
			return err
		}
		writer.Write(encoded)
	case json.Number:
		if _, err := typed.Int64(); err != nil {
			if _, floatErr := typed.Float64(); floatErr != nil {
				return fmt.Errorf("invalid canonical JSON number %q", typed)
			}
		}
		writer.WriteString(typed.String())
	case []any:
		writer.WriteByte('[')
		for index, item := range typed {
			if index != 0 {
				writer.WriteByte(',')
			}
			if err := writeCanonicalValue(writer, item); err != nil {
				return err
			}
		}
		writer.WriteByte(']')
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		writer.WriteByte('{')
		for index, key := range keys {
			if index != 0 {
				writer.WriteByte(',')
			}
			encodedKey, err := json.Marshal(key)
			if err != nil {
				return err
			}
			writer.Write(encodedKey)
			writer.WriteByte(':')
			if err := writeCanonicalValue(writer, typed[key]); err != nil {
				return err
			}
		}
		writer.WriteByte('}')
	default:
		return fmt.Errorf("unsupported canonical JSON value %T", value)
	}
	return nil
}

func canonicalValueDigest(value any) (string, error) {
	data, err := canonicalJSONBytes(value)
	if err != nil {
		return "", err
	}
	return "sha256:" + hashBytes(data), nil
}

func evidenceForFile(root string, name string) (evidenceRecord, error) {
	if !safeRelativePath(name) || strings.Contains(name, "/") {
		return evidenceRecord{}, fmt.Errorf("evidence name must be a safe top-level path: %q", name)
	}
	digest, size, err := digestFile(filepath.Join(root, name))
	if err != nil {
		return evidenceRecord{}, err
	}
	return evidenceRecord{Path: name, Size: size, SHA256: digest}, nil
}

func digestFile(path string) (string, int64, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", 0, err
	}
	if !info.Mode().IsRegular() {
		return "", 0, fmt.Errorf("not a regular file: %s", path)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", 0, err
	}
	defer file.Close()
	hasher := sha256.New()
	size, err := io.Copy(hasher, file)
	if err != nil {
		return "", 0, err
	}
	if size != info.Size() {
		return "", 0, fmt.Errorf("file changed while hashing: %s", path)
	}
	return "sha256:" + hex.EncodeToString(hasher.Sum(nil)), size, nil
}

func hashBytes(data []byte) string {
	digest := sha256.Sum256(data)
	return hex.EncodeToString(digest[:])
}

func safeRelativePath(path string) bool {
	if path == "" || filepath.IsAbs(path) || filepath.Clean(path) != path ||
		strings.Contains(path, "\\") || !pathPattern.MatchString(path) {
		return false
	}
	for _, part := range strings.Split(path, "/") {
		if part == "" || part == "." || part == ".." {
			return false
		}
	}
	return true
}

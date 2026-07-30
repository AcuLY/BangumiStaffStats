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
	"debug/elf"
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
	"path"
	"path/filepath"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	componentID                    = "backend"
	applicationVersion             = "v0.1.0"
	applicationVersionInputPath    = "VERSION"
	applicationVersionInputDigest  = "sha256:d0b4f9120ba026c00fa23cb84b4e1620a2e6436592e58155a5151653179572c0"
	domainRulesVersion             = "domain-raw-v1"
	castRulesVersion               = "cast-exact-v1"
	compatibilityMatrixInputPath   = "contracts/schemas/archive/compatibility-matrix.json"
	compatibilityMatrixDigest      = "sha256:659121caac966df42a6201dcfb539ac1cd0f7f6a4e452495707833f7c8b889ac"
	requiredBuildkitVersion        = "0.27.1"
	requiredBuildxVersion          = "0.34.1"
	requiredBuildkitImageDigest    = "sha256:1e110c71d389d6d24f67b9438e2f7b8da749a6ff407b22a1631e025c95599368"
	requiredBuildkitImageInputPath = "toolchain/buildkit-image"
	requiredGoVersion              = "go1.26.5"
	apiModulePath                  = "github.com/AcuLY/BangumiStaffStats/backend/cmd/api"
	archiveSmokeModulePath         = "github.com/AcuLY/BangumiStaffStats/backend/cmd/archive-smoke"
	apiBundlePath                  = "bin/bgmss-api"
	archiveSmokeBundlePath         = "bin/archive-smoke"
	apiExecutableRole              = "api-runtime"
	archiveSmokeExecutableRole     = "archive-validation"
	releaseinfoVersionSymbol       = "github.com/AcuLY/BangumiStaffStats/backend/internal/releaseinfo.Version"
	releaseinfoCommitSymbol        = "github.com/AcuLY/BangumiStaffStats/backend/internal/releaseinfo.Commit"
	checksumFileName               = "checksums.sha256"
	sbomFileName                   = "backend.spdx.json"
	statementFileName              = "component-statement.json"
	maxBundleSize                  = 512 << 20
	maxExecutableSize              = 256 << 20
	maxBundleMetadataSize          = 1 << 20
	maxImageArchiveSize            = 512 << 20
	maxImageArchiveMemberSize      = 256 << 20
	maxImageArchiveJSONSize        = 4 << 20
	maxImageArchiveMembers         = 4096
	ociImageLayoutVersion          = "1.0.0"
	ociIndexMediaType              = "application/vnd.oci.image.index.v1+json"
	ociManifestMediaType           = "application/vnd.oci.image.manifest.v1+json"
	ociConfigMediaType             = "application/vnd.oci.image.config.v1+json"
	ociLayerMediaType              = "application/vnd.oci.image.layer.v1.tar+gzip"
)

var (
	gitIDPattern       = regexp.MustCompile(`^(?:[0-9a-f]{40}|[0-9a-f]{64})$`)
	revisionPattern    = regexp.MustCompile(`^[0-9a-f]{40}$`)
	digestPattern      = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	pathPattern        = regexp.MustCompile(`^[A-Za-z0-9._-]+(?:/[A-Za-z0-9._-]+)*$`)
	imageReferenceExpr = regexp.MustCompile(`^[A-Za-z0-9._/:+-]+@sha256:[0-9a-f]{64}$`)
	ociBlobPathPattern = regexp.MustCompile(`^blobs/sha256/[0-9a-f]{64}$`)
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
	ManifestSchemaVersion     versionRange `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion       versionRange `json:"sqliteSchemaVersion"`
	ManifestSchemaDigest      string       `json:"manifestSchemaDigest"`
	SchemaSQLDigest           string       `json:"schemaSqlDigest"`
	DomainRulesVersion        string       `json:"domainRulesVersion"`
	CastRulesVersion          string       `json:"castRulesVersion"`
	CompatibilityMatrixDigest string       `json:"compatibilityMatrixDigest"`
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

type executableFact struct {
	Role   string `json:"role"`
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type bundleMetadata struct {
	SchemaVersion      int                `json:"schemaVersion"`
	ApplicationVersion string             `json:"applicationVersion"`
	Component          string             `json:"component"`
	Source             sourceIdentity     `json:"source"`
	Target             targetPlatform     `json:"target"`
	Toolchain          []toolFact         `json:"toolchain"`
	BaseImages         []baseImageFact    `json:"baseImages"`
	Inputs             []inputFact        `json:"inputs"`
	Compatibility      compatibilityFacts `json:"compatibility"`
	Image              imageMetadata      `json:"image"`
	Executables        []executableFact   `json:"executables"`
}

type fileRecord struct {
	Path   string `json:"path"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
}

type ociDescriptor struct {
	MediaType   string            `json:"mediaType"`
	Digest      string            `json:"digest"`
	Size        int64             `json:"size"`
	Platform    *targetPlatform   `json:"platform,omitempty"`
	Annotations map[string]string `json:"annotations,omitempty"`
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

type ociImageLayout struct {
	ImageLayoutVersion string `json:"imageLayoutVersion"`
}

type dockerCompatibilityRecord struct {
	Config   string   `json:"Config"`
	RepoTags []string `json:"RepoTags"`
	Layers   []string `json:"Layers"`
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
	SchemaVersion      int                `json:"schemaVersion"`
	ApplicationVersion string             `json:"applicationVersion"`
	Component          string             `json:"component"`
	Source             sourceIdentity     `json:"source"`
	Target             targetPlatform     `json:"target"`
	Toolchain          []toolFact         `json:"toolchain"`
	BaseImages         []baseImageFact    `json:"baseImages"`
	Inputs             []inputFact        `json:"inputs"`
	Compatibility      compatibilityFacts `json:"compatibility"`
	Artifacts          []fileRecord       `json:"artifacts"`
	ArtifactSetDigest  string             `json:"artifactSetDigest"`
	ChecksumInventory  evidenceRecord     `json:"checksumInventory"`
	SBOM               sbomEvidence       `json:"sbom"`
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
	APIBinaryPath               string
	ArchiveSmokeBinaryPath      string
	ImageArchivePath            string
	OutputPath                  string
	SourceRevision              string
	SourceTree                  string
	ApplicationVersion          string
	TargetOS                    string
	TargetArchitecture          string
	OpenAPIDigest               string
	ArchiveManifestSchemaDigest string
	ArchiveSchemaSQLDigest      string
	ArchiveDomainRulesVersion   string
	ArchiveCastRulesVersion     string
	CompatibilityMatrixDigest   string
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

	apiBuild, err := buildinfo.ReadFile(options.APIBinaryPath)
	if err != nil {
		return fmt.Errorf("read API build info: %w", err)
	}
	if err := validateBuildInfo(
		apiBuild,
		"API",
		apiModulePath,
		options.TargetOS,
		options.TargetArchitecture,
	); err != nil {
		return err
	}
	if err := validateLinkedReleaseIdentity(
		options.APIBinaryPath,
		"API",
		options.ApplicationVersion,
		options.SourceRevision,
	); err != nil {
		return err
	}
	if err := validateELFFile(options.APIBinaryPath, "API"); err != nil {
		return err
	}
	archiveSmokeBuild, err := buildinfo.ReadFile(options.ArchiveSmokeBinaryPath)
	if err != nil {
		return fmt.Errorf("read Archive smoke build info: %w", err)
	}
	if err := validateBuildInfo(
		archiveSmokeBuild,
		"Archive smoke",
		archiveSmokeModulePath,
		options.TargetOS,
		options.TargetArchitecture,
	); err != nil {
		return err
	}
	if err := validateLinkedReleaseIdentity(
		options.ArchiveSmokeBinaryPath,
		"Archive smoke",
		options.ApplicationVersion,
		options.SourceRevision,
	); err != nil {
		return err
	}
	if err := validateELFFile(options.ArchiveSmokeBinaryPath, "Archive smoke"); err != nil {
		return err
	}
	executables, err := executableFacts(
		options.APIBinaryPath,
		options.ArchiveSmokeBinaryPath,
	)
	if err != nil {
		return err
	}

	layoutPath, err := os.MkdirTemp(options.OutputPath, ".admitted-image-layout-")
	if err != nil {
		return err
	}
	defer removeOwnedTemporaryDirectory(layoutPath)
	if err := admitImageArchive(options.ImageArchivePath, layoutPath); err != nil {
		return fmt.Errorf("admit Docker exporter archive: %w", err)
	}
	image, err := inspectOCI(layoutPath, options)
	if err != nil {
		return err
	}
	ociName := fmt.Sprintf(
		"backend-api-%s-%s.oci.tar",
		options.TargetOS,
		options.TargetArchitecture,
	)
	ociPath := filepath.Join(options.OutputPath, ociName)
	if err := writeNormalizedDirectoryTar(layoutPath, ociPath); err != nil {
		return fmt.Errorf("normalize OCI archive: %w", err)
	}
	if err := removeOwnedTemporaryDirectory(layoutPath); err != nil {
		return fmt.Errorf("remove admitted OCI layout: %w", err)
	}
	ociDigest, _, err := digestFile(ociPath)
	if err != nil {
		return err
	}
	image.OCITarSHA256 = ociDigest

	metadata := bundleMetadata{
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
		Inputs: options.Inputs,
		Compatibility: compatibilityFacts{
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
		},
		Image:       image,
		Executables: executables,
	}
	bundleName := fmt.Sprintf(
		"backend-api-%s-%s.tar.gz",
		options.TargetOS,
		options.TargetArchitecture,
	)
	bundlePath := filepath.Join(options.OutputPath, bundleName)
	if err := writeBundle(
		options.APIBinaryPath,
		options.ArchiveSmokeBinaryPath,
		bundlePath,
		metadata,
	); err != nil {
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
	sbom, err := writeSPDX(
		sbomPath,
		inventoryDigest,
		records,
		[]*buildinfo.BuildInfo{apiBuild, archiveSmokeBuild},
		options.ApplicationVersion,
	)
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
		Toolchain:  requiredToolchain(),
		BaseImages: metadata.BaseImages,
		Inputs:     options.Inputs,
		Compatibility: compatibilityFacts{
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
	flags.StringVar(&options.APIBinaryPath, "api-binary", "", "built API executable")
	flags.StringVar(
		&options.ArchiveSmokeBinaryPath,
		"archive-smoke-binary",
		"",
		"built Archive smoke executable",
	)
	flags.StringVar(
		&options.ImageArchivePath,
		"image-archive",
		"",
		"raw Docker exporter archive",
	)
	flags.StringVar(&options.OutputPath, "output", "", "new output directory")
	flags.StringVar(&options.SourceRevision, "source-revision", "", "40-hex source revision")
	flags.StringVar(&options.SourceTree, "source-tree", "", "40-hex source tree")
	flags.StringVar(
		&options.ApplicationVersion,
		"application-version",
		"",
		"root application release version",
	)
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
		&options.ArchiveDomainRulesVersion,
		"archive-domain-rules-version",
		"",
		"Archive domain rules version",
	)
	flags.StringVar(
		&options.ArchiveCastRulesVersion,
		"archive-cast-rules-version",
		"",
		"Archive cast rules version",
	)
	flags.StringVar(
		&options.CompatibilityMatrixDigest,
		"archive-compatibility-matrix-sha256",
		"",
		"Archive compatibility matrix SHA-256",
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
		"api-binary":           options.APIBinaryPath,
		"archive-smoke-binary": options.ArchiveSmokeBinaryPath,
		"image-archive":        options.ImageArchivePath,
		"output":               options.OutputPath,
		"go-image":             options.GoImageReference,
		"runtime-image":        options.RuntimeImageReference,
		"target-arch":          options.TargetArchitecture,
		"source-revision":      options.SourceRevision,
		"source-tree":          options.SourceTree,
		"application-version":  options.ApplicationVersion,
	} {
		if value == "" {
			return fmt.Errorf("%s is required", name)
		}
	}
	if !revisionPattern.MatchString(options.SourceRevision) {
		return errors.New("source revision must be exactly 40 lowercase hex characters")
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
	if options.ApplicationVersion != applicationVersion {
		return fmt.Errorf(
			"application version = %q, want %q",
			options.ApplicationVersion,
			applicationVersion,
		)
	}
	if options.ArchiveDomainRulesVersion != domainRulesVersion ||
		options.ArchiveCastRulesVersion != castRulesVersion {
		return errors.New("Archive rule pair does not match the supported compatibility tuple")
	}
	for name, value := range map[string]string{
		"openapi":                      options.OpenAPIDigest,
		"archive manifest schema":      options.ArchiveManifestSchemaDigest,
		"archive schema SQL":           options.ArchiveSchemaSQLDigest,
		"Archive compatibility matrix": options.CompatibilityMatrixDigest,
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
	foundVersion := false
	foundCompatibilityMatrix := false
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
		if input.Path == applicationVersionInputPath {
			foundVersion = true
			if input.SHA256 != applicationVersionInputDigest {
				return fmt.Errorf("VERSION digest = %q, want %q", input.SHA256, applicationVersionInputDigest)
			}
		}
		if input.Path == compatibilityMatrixInputPath {
			foundCompatibilityMatrix = true
			if input.SHA256 != compatibilityMatrixDigest {
				return fmt.Errorf(
					"compatibility matrix input digest = %q, want %q",
					input.SHA256,
					compatibilityMatrixDigest,
				)
			}
		}
	}
	if !foundBuildkitImage {
		return fmt.Errorf("declared inputs omit %q", requiredBuildkitImageInputPath)
	}
	if !foundVersion {
		return fmt.Errorf("declared inputs omit %q", applicationVersionInputPath)
	}
	if !foundCompatibilityMatrix {
		return fmt.Errorf("declared inputs omit %q", compatibilityMatrixInputPath)
	}
	if options.CompatibilityMatrixDigest != compatibilityMatrixDigest {
		return fmt.Errorf(
			"Archive compatibility matrix digest = %q, want %q",
			options.CompatibilityMatrixDigest,
			compatibilityMatrixDigest,
		)
	}
	return nil
}

func validateLinkedReleaseIdentity(
	path string,
	label string,
	version string,
	revision string,
) error {
	info, err := os.Lstat(path)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxExecutableSize {
		return fmt.Errorf("%s binary is not a bounded regular file", label)
	}
	content, err := os.ReadFile(path)
	if err != nil {
		return err
	}
	return validateLinkedReleaseIdentityBytes(content, label, version, revision)
}

func validateLinkedReleaseIdentityBytes(
	content []byte,
	label string,
	version string,
	revision string,
) error {
	if version != applicationVersion || !revisionPattern.MatchString(revision) {
		return fmt.Errorf("%s expected release identity is invalid", label)
	}
	if !bytes.Contains(content, []byte(version)) ||
		!bytes.Contains(content, []byte(revision)) {
		return fmt.Errorf("%s binary omits the linked release identity", label)
	}
	return nil
}

func releaseLinkerFlags(version string, revision string) string {
	return fmt.Sprintf(
		"-buildid= -s -w -X %s=%s -X %s=%s",
		releaseinfoVersionSymbol,
		version,
		releaseinfoCommitSymbol,
		revision,
	)
}

func validateBuildInfo(
	build *buildinfo.BuildInfo,
	label string,
	modulePath string,
	targetOS string,
	targetArchitecture string,
) error {
	if build == nil {
		return fmt.Errorf("%s binary has no Go build information", label)
	}
	if build.GoVersion != requiredGoVersion {
		return fmt.Errorf(
			"%s Go version = %q, want %q",
			label,
			build.GoVersion,
			requiredGoVersion,
		)
	}
	if build.Path != modulePath {
		return fmt.Errorf("%s module path = %q, want %q", label, build.Path, modulePath)
	}
	settings := make(map[string]string, len(build.Settings))
	for _, setting := range build.Settings {
		settings[setting.Key] = setting.Value
	}
	if settings["GOOS"] != targetOS || settings["GOARCH"] != targetArchitecture {
		return fmt.Errorf(
			"%s target = %s/%s, want %s/%s",
			label,
			settings["GOOS"],
			settings["GOARCH"],
			targetOS,
			targetArchitecture,
		)
	}
	if settings["CGO_ENABLED"] != "0" {
		return fmt.Errorf("%s CGO_ENABLED = %q, want 0", label, settings["CGO_ENABLED"])
	}
	if settings["-trimpath"] != "true" {
		return fmt.Errorf("%s was not built with -trimpath", label)
	}
	for key := range settings {
		if strings.HasPrefix(key, "vcs.") {
			return fmt.Errorf("%s contains nondeterministic VCS build setting %q", label, key)
		}
	}
	return nil
}

func validateELFFile(path string, label string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	return validateELFPolicy(file, label)
}

func validateELFPolicy(reader io.ReaderAt, label string) error {
	executable, err := elf.NewFile(reader)
	if err != nil {
		return fmt.Errorf("%s is not a valid ELF executable: %w", label, err)
	}
	defer executable.Close()
	for _, section := range []string{".note.go.buildid", ".debug_info", ".symtab"} {
		if executable.Section(section) != nil {
			return fmt.Errorf("%s contains forbidden ELF section %q", label, section)
		}
	}
	return nil
}

func executableFacts(
	apiBinaryPath string,
	archiveSmokeBinaryPath string,
) ([]executableFact, error) {
	specifications := []struct {
		Role       string
		BundlePath string
		SourcePath string
	}{
		{
			Role:       archiveSmokeExecutableRole,
			BundlePath: archiveSmokeBundlePath,
			SourcePath: archiveSmokeBinaryPath,
		},
		{
			Role:       apiExecutableRole,
			BundlePath: apiBundlePath,
			SourcePath: apiBinaryPath,
		},
	}
	result := make([]executableFact, 0, len(specifications))
	for _, specification := range specifications {
		info, err := os.Lstat(specification.SourcePath)
		if err != nil {
			return nil, err
		}
		if !info.Mode().IsRegular() {
			return nil, fmt.Errorf(
				"%s executable is not a regular non-symlink file",
				specification.Role,
			)
		}
		digest, size, err := digestFile(specification.SourcePath)
		if err != nil {
			return nil, err
		}
		result = append(result, executableFact{
			Role:   specification.Role,
			Path:   specification.BundlePath,
			Size:   size,
			SHA256: digest,
		})
	}
	return result, nil
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

func removeOwnedTemporaryDirectory(root string) error {
	info, err := os.Lstat(root)
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if !info.IsDir() || info.Mode()&fs.ModeSymlink != 0 {
		return fmt.Errorf("refusing to remove non-directory temporary path %q", root)
	}
	if err := makeDirectoryTreeWritable(root); err != nil {
		return err
	}
	return os.RemoveAll(root)
}

func makeDirectoryTreeWritable(root string) error {
	return filepath.WalkDir(root, func(
		currentPath string,
		entry fs.DirEntry,
		walkErr error,
	) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return os.Chmod(currentPath, 0o700)
		}
		if entry.Type()&fs.ModeSymlink != 0 || !entry.Type().IsRegular() {
			return fmt.Errorf("temporary tree contains unsupported entry %q", currentPath)
		}
		return nil
	})
}

func admitImageArchive(sourcePath string, destinationPath string) error {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() ||
		info.Size() <= 0 ||
		info.Size() > maxImageArchiveSize {
		return errors.New("Docker exporter archive is not a bounded regular file")
	}
	if err := ensureNewDirectory(destinationPath); err != nil {
		return err
	}

	file, err := os.Open(sourcePath)
	if err != nil {
		return err
	}
	defer file.Close()
	tarReader := tar.NewReader(file)
	seen := make(map[string]struct{})
	var totalSize int64
	memberCount := 0
	for {
		header, nextErr := tarReader.Next()
		if nextErr == io.EOF {
			break
		}
		if nextErr != nil {
			return fmt.Errorf("read Docker exporter archive: %w", nextErr)
		}
		memberCount++
		if memberCount > maxImageArchiveMembers {
			return fmt.Errorf(
				"Docker exporter archive has more than %d members",
				maxImageArchiveMembers,
			)
		}
		name, directory, err := validateImageArchiveHeader(header)
		if err != nil {
			return err
		}
		if _, duplicate := seen[name]; duplicate {
			return fmt.Errorf("Docker exporter archive contains duplicate member %q", name)
		}
		seen[name] = struct{}{}

		parent := path.Dir(strings.TrimSuffix(name, "/"))
		if parent != "." {
			if _, ok := seen[parent+"/"]; !ok {
				return fmt.Errorf(
					"Docker exporter archive member %q precedes required directory %q",
					name,
					parent+"/",
				)
			}
		}
		materializedPath := filepath.Join(
			destinationPath,
			filepath.FromSlash(strings.TrimSuffix(name, "/")),
		)
		if directory {
			if err := os.Mkdir(materializedPath, 0o700); err != nil {
				return err
			}
			continue
		}
		if header.Size > maxImageArchiveMemberSize ||
			totalSize > maxImageArchiveSize-header.Size {
			return fmt.Errorf("Docker exporter archive member %q is oversized", name)
		}
		if name == "oci-layout" || name == "index.json" || name == "manifest.json" {
			if header.Size > maxImageArchiveJSONSize {
				return fmt.Errorf("Docker exporter JSON member %q is oversized", name)
			}
		}
		totalSize += header.Size
		output, err := os.OpenFile(
			materializedPath,
			os.O_WRONLY|os.O_CREATE|os.O_EXCL,
			0o600,
		)
		if err != nil {
			return err
		}
		_, copyErr := io.CopyN(output, tarReader, header.Size)
		syncErr := output.Sync()
		chmodErr := output.Chmod(0o444)
		closeErr := output.Close()
		if copyErr != nil {
			return fmt.Errorf("extract Docker exporter member %q: %w", name, copyErr)
		}
		if syncErr != nil {
			return syncErr
		}
		if chmodErr != nil {
			return chmodErr
		}
		if closeErr != nil {
			return closeErr
		}
	}
	var trailing [1]byte
	if count, err := file.Read(trailing[:]); err != io.EOF || count != 0 {
		if err != nil {
			return fmt.Errorf("read Docker exporter archive trailing bytes: %w", err)
		}
		return errors.New("Docker exporter archive contains trailing bytes")
	}

	for _, required := range []string{
		"blobs/",
		"blobs/sha256/",
		"index.json",
		"manifest.json",
		"oci-layout",
	} {
		if _, ok := seen[required]; !ok {
			return fmt.Errorf("Docker exporter archive omits %q", required)
		}
	}
	for _, directory := range []string{"blobs/sha256", "blobs"} {
		if err := os.Chmod(filepath.Join(destinationPath, directory), 0o555); err != nil {
			return err
		}
	}
	return nil
}

func validateImageArchiveHeader(header *tar.Header) (string, bool, error) {
	if header.Format != tar.FormatUSTAR ||
		len(header.PAXRecords) != 0 ||
		len(header.Xattrs) != 0 {
		return "", false, fmt.Errorf(
			"Docker exporter archive member %q uses PAX, xattr, or unsupported format",
			header.Name,
		)
	}
	if header.Linkname != "" {
		return "", false, fmt.Errorf(
			"Docker exporter archive member %q has a link target",
			header.Name,
		)
	}
	directory := header.Typeflag == tar.TypeDir
	regular := header.Typeflag == tar.TypeReg || header.Typeflag == tar.TypeRegA
	if !directory && !regular {
		return "", false, fmt.Errorf(
			"Docker exporter archive member %q has unsupported type %d",
			header.Name,
			header.Typeflag,
		)
	}
	if header.Size < 0 || (directory && header.Size != 0) {
		return "", false, fmt.Errorf(
			"Docker exporter archive member %q has invalid size %d",
			header.Name,
			header.Size,
		)
	}

	name := header.Name
	candidate := name
	if directory {
		if !strings.HasSuffix(name, "/") {
			return "", false, fmt.Errorf(
				"Docker exporter directory %q omits its trailing slash",
				name,
			)
		}
		candidate = strings.TrimSuffix(name, "/")
		if candidate == "" || strings.HasSuffix(candidate, "/") {
			return "", false, fmt.Errorf(
				"Docker exporter directory %q is not normalized",
				name,
			)
		}
	} else if strings.HasSuffix(name, "/") {
		return "", false, fmt.Errorf(
			"Docker exporter file %q has a directory suffix",
			name,
		)
	}
	if candidate == "" ||
		path.IsAbs(candidate) ||
		path.Clean(candidate) != candidate ||
		strings.Contains(candidate, "\\") ||
		strings.HasPrefix(candidate, "../") {
		return "", false, fmt.Errorf(
			"Docker exporter archive member %q is not a normalized relative path",
			name,
		)
	}
	if directory {
		if name != "blobs/" && name != "blobs/sha256/" {
			return "", false, fmt.Errorf(
				"Docker exporter archive contains extra directory %q",
				name,
			)
		}
		return name, true, nil
	}
	if name != "oci-layout" &&
		name != "index.json" &&
		name != "manifest.json" &&
		!ociBlobPathPattern.MatchString(name) {
		return "", false, fmt.Errorf(
			"Docker exporter archive contains extra file %q",
			name,
		)
	}
	return name, false, nil
}

func inspectOCI(layoutPath string, options packageOptions) (imageMetadata, error) {
	layoutBytes, err := readBoundedRegularFile(
		filepath.Join(layoutPath, "oci-layout"),
		maxImageArchiveJSONSize,
	)
	if err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI layout marker: %w", err)
	}
	var layout ociImageLayout
	if err := decodeStrictJSON(layoutBytes, &layout); err != nil {
		return imageMetadata{}, fmt.Errorf("decode OCI layout marker: %w", err)
	}
	if layout.ImageLayoutVersion != ociImageLayoutVersion {
		return imageMetadata{}, fmt.Errorf(
			"OCI layout version = %q, want %q",
			layout.ImageLayoutVersion,
			ociImageLayoutVersion,
		)
	}

	indexPath := filepath.Join(layoutPath, "index.json")
	var index ociIndex
	indexBytes, err := readBoundedRegularFile(indexPath, maxImageArchiveJSONSize)
	if err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI index: %w", err)
	}
	if err := decodeJSON(indexBytes, &index); err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI index: %w", err)
	}
	if index.SchemaVersion != 2 ||
		index.MediaType != ociIndexMediaType ||
		len(index.Manifests) != 1 {
		return imageMetadata{}, fmt.Errorf(
			"OCI index must contain exactly one OCI schema-v2 manifest, got schema=%d media=%q manifests=%d",
			index.SchemaVersion,
			index.MediaType,
			len(index.Manifests),
		)
	}
	manifestDescriptor := index.Manifests[0]
	if manifestDescriptor.MediaType != ociManifestMediaType ||
		manifestDescriptor.Platform == nil ||
		manifestDescriptor.Platform.OS != options.TargetOS ||
		manifestDescriptor.Platform.Architecture != options.TargetArchitecture {
		return imageMetadata{}, fmt.Errorf("OCI manifest platform does not match target")
	}
	imageName := declaredImageName(options)
	if manifestDescriptor.Annotations["io.containerd.image.name"] != imageName ||
		manifestDescriptor.Annotations["org.opencontainers.image.ref.name"] !=
			options.SourceRevision+"-"+options.TargetArchitecture {
		return imageMetadata{}, errors.New("OCI index does not bind the exact declared image name")
	}
	manifestBytes, err := readJSONDescriptor(layoutPath, manifestDescriptor)
	if err != nil {
		return imageMetadata{}, fmt.Errorf("read OCI manifest: %w", err)
	}
	var manifest ociManifest
	if err := decodeJSON(manifestBytes, &manifest); err != nil {
		return imageMetadata{}, fmt.Errorf("decode OCI manifest: %w", err)
	}
	if manifest.SchemaVersion != 2 ||
		manifest.MediaType != ociManifestMediaType ||
		manifest.Config.MediaType != ociConfigMediaType ||
		len(manifest.Layers) == 0 {
		return imageMetadata{}, errors.New("OCI manifest is missing its runtime layers")
	}
	configBytes, err := readJSONDescriptor(layoutPath, manifest.Config)
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
		"org.opencontainers.image.version":        options.ApplicationVersion,
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
	expectedBlobs := map[string]struct{}{}
	for _, descriptor := range []ociDescriptor{manifestDescriptor, manifest.Config} {
		relative, err := descriptorBlobPath(descriptor)
		if err != nil {
			return imageMetadata{}, err
		}
		expectedBlobs[relative] = struct{}{}
	}
	for _, descriptor := range manifest.Layers {
		if descriptor.MediaType != ociLayerMediaType {
			return imageMetadata{}, fmt.Errorf(
				"OCI layer %q has non-OCI media type %q",
				descriptor.Digest,
				descriptor.MediaType,
			)
		}
		if err := validateDescriptorFile(layoutPath, descriptor); err != nil {
			return imageMetadata{}, fmt.Errorf("read OCI layer %q: %w", descriptor.Digest, err)
		}
		relative, err := descriptorBlobPath(descriptor)
		if err != nil {
			return imageMetadata{}, err
		}
		expectedBlobs[relative] = struct{}{}
		layers = append(layers, descriptor.Digest)
	}
	if err := validateDockerCompatibilityManifest(
		layoutPath,
		imageName,
		manifest,
	); err != nil {
		return imageMetadata{}, err
	}
	if err := validateClosedImageLayout(layoutPath, expectedBlobs); err != nil {
		return imageMetadata{}, err
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

func declaredImageName(options packageOptions) string {
	return fmt.Sprintf(
		"localhost/bgmss-backend-api:%s-%s",
		options.SourceRevision,
		options.TargetArchitecture,
	)
}

func validateDockerCompatibilityManifest(
	layoutPath string,
	imageName string,
	manifest ociManifest,
) error {
	compatibilityPath := filepath.Join(layoutPath, "manifest.json")
	data, err := readBoundedRegularFile(compatibilityPath, maxImageArchiveJSONSize)
	if err != nil {
		return fmt.Errorf("read Docker compatibility manifest: %w", err)
	}
	var records []dockerCompatibilityRecord
	if err := decodeStrictJSON(data, &records); err != nil {
		return fmt.Errorf("decode Docker compatibility manifest: %w", err)
	}
	if len(records) != 1 {
		return fmt.Errorf(
			"Docker compatibility manifest contains %d records, want 1",
			len(records),
		)
	}
	expectedLayers := make([]string, 0, len(manifest.Layers))
	for _, descriptor := range manifest.Layers {
		relative, err := descriptorBlobPath(descriptor)
		if err != nil {
			return err
		}
		expectedLayers = append(expectedLayers, relative)
	}
	expectedConfig, err := descriptorBlobPath(manifest.Config)
	if err != nil {
		return err
	}
	record := records[0]
	if record.Config != expectedConfig ||
		!slices.Equal(record.Layers, expectedLayers) ||
		!slices.Equal(record.RepoTags, []string{imageName}) {
		return errors.New("Docker compatibility manifest disagrees with the OCI graph or image name")
	}
	canonical, err := json.Marshal(records)
	if err != nil {
		return err
	}
	if !bytes.Equal(data, canonical) {
		return errors.New("Docker compatibility manifest is not the exporter canonical encoding")
	}
	return nil
}

func validateClosedImageLayout(
	layoutPath string,
	expectedBlobs map[string]struct{},
) error {
	expectedFiles := map[string]struct{}{
		"index.json":    {},
		"manifest.json": {},
		"oci-layout":    {},
	}
	for blob := range expectedBlobs {
		expectedFiles[blob] = struct{}{}
	}
	expectedDirectories := map[string]struct{}{
		"blobs":        {},
		"blobs/sha256": {},
	}
	seenFiles := make(map[string]struct{}, len(expectedFiles))
	seenDirectories := make(map[string]struct{}, len(expectedDirectories))
	err := filepath.WalkDir(layoutPath, func(
		currentPath string,
		entry fs.DirEntry,
		walkErr error,
	) error {
		if walkErr != nil {
			return walkErr
		}
		if currentPath == layoutPath {
			return nil
		}
		relative, err := filepath.Rel(layoutPath, currentPath)
		if err != nil {
			return err
		}
		relative = filepath.ToSlash(relative)
		info, err := os.Lstat(currentPath)
		if err != nil {
			return err
		}
		if info.IsDir() {
			if _, ok := expectedDirectories[relative]; !ok {
				return fmt.Errorf("OCI layout contains extra directory %q", relative)
			}
			if info.Mode().Perm() != 0o555 {
				return fmt.Errorf("OCI directory %q mode = %o, want 0555", relative, info.Mode().Perm())
			}
			seenDirectories[relative] = struct{}{}
			return nil
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("OCI layout contains unsupported entry %q", relative)
		}
		if _, ok := expectedFiles[relative]; !ok {
			return fmt.Errorf("OCI layout contains extra or orphan file %q", relative)
		}
		if info.Mode().Perm() != 0o444 {
			return fmt.Errorf("OCI file %q mode = %o, want 0444", relative, info.Mode().Perm())
		}
		seenFiles[relative] = struct{}{}
		return nil
	})
	if err != nil {
		return err
	}
	if len(seenFiles) != len(expectedFiles) ||
		len(seenDirectories) != len(expectedDirectories) {
		return errors.New("OCI layout omits a required graph member or directory")
	}
	return nil
}

func isRootUser(user string) bool {
	trimmed := strings.TrimSpace(strings.ToLower(user))
	if trimmed == "" {
		return true
	}
	uid := strings.SplitN(trimmed, ":", 2)[0]
	if uid == "root" {
		return true
	}
	if strings.HasPrefix(uid, "+") || strings.HasPrefix(uid, "-") {
		uid = uid[1:]
	}
	numericUID, err := strconv.ParseUint(uid, 10, 64)
	return err == nil && numericUID == 0
}

func descriptorBlobPath(descriptor ociDescriptor) (string, error) {
	if !digestPattern.MatchString(descriptor.Digest) || descriptor.Size < 0 {
		return "", errors.New("invalid OCI descriptor")
	}
	parts := strings.SplitN(descriptor.Digest, ":", 2)
	return "blobs/" + parts[0] + "/" + parts[1], nil
}

func validateDescriptorFile(layoutPath string, descriptor ociDescriptor) error {
	relative, err := descriptorBlobPath(descriptor)
	if err != nil {
		return err
	}
	actual, size, err := digestFile(filepath.Join(layoutPath, filepath.FromSlash(relative)))
	if err != nil {
		return err
	}
	if actual != descriptor.Digest || size != descriptor.Size {
		return fmt.Errorf(
			"descriptor mismatch: digest=%s/%s size=%d/%d",
			actual,
			descriptor.Digest,
			size,
			descriptor.Size,
		)
	}
	return nil
}

func readJSONDescriptor(layoutPath string, descriptor ociDescriptor) ([]byte, error) {
	if descriptor.Size < 0 || descriptor.Size > maxImageArchiveJSONSize {
		return nil, errors.New("OCI JSON descriptor is outside the accepted size bound")
	}
	if err := validateDescriptorFile(layoutPath, descriptor); err != nil {
		return nil, err
	}
	relative, err := descriptorBlobPath(descriptor)
	if err != nil {
		return nil, err
	}
	return readBoundedRegularFile(
		filepath.Join(layoutPath, filepath.FromSlash(relative)),
		maxImageArchiveJSONSize,
	)
}

func readBoundedRegularFile(path string, maximum int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() < 0 || info.Size() > maximum {
		return nil, errors.New("file is not a bounded regular non-symlink file")
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	if int64(len(data)) != info.Size() {
		return nil, errors.New("file size changed while reading")
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

func writeBundle(
	apiBinaryPath string,
	archiveSmokeBinaryPath string,
	outputPath string,
	metadata bundleMetadata,
) error {
	metadataBytes, err := canonicalJSONBytes(metadata)
	if err != nil {
		return err
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
			{
				Name: archiveSmokeBundlePath,
				Mode: 0o555,
				Path: archiveSmokeBinaryPath,
			},
			{Name: apiBundlePath, Mode: 0o555, Path: apiBinaryPath},
			{Name: "metadata/", Mode: 0o555},
			{Name: "metadata/build.json", Mode: 0o444, Data: metadataBytes},
		}
		for _, entry := range entries {
			size := int64(len(entry.Data))
			if entry.Path != "" {
				info, err := os.Lstat(entry.Path)
				if err != nil {
					return err
				}
				if !info.Mode().IsRegular() {
					return fmt.Errorf("bundle source is not a regular file: %s", entry.Path)
				}
				size = info.Size()
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
	builds []*buildinfo.BuildInfo,
	releaseVersion string,
) (spdxDocument, error) {
	if !digestPattern.MatchString(inventoryDigest) {
		return spdxDocument{}, errors.New("invalid inventory digest for SPDX namespace")
	}
	if releaseVersion != applicationVersion {
		return spdxDocument{}, errors.New("invalid application version for SPDX")
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
			VersionInfo:        releaseVersion,
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

	dependencies := runtimeDependencies(builds)
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

func runtimeDependencies(builds []*buildinfo.BuildInfo) []spdxPackage {
	result := []spdxPackage{{
		Name:             "go-runtime",
		VersionInfo:      requiredGoVersion,
		Supplier:         "Organization: The Go Authors",
		DownloadLocation: "NOASSERTION",
		FilesAnalyzed:    false,
		LicenseConcluded: "BSD-3-Clause",
		LicenseDeclared:  "BSD-3-Clause",
		CopyrightText:    "NOASSERTION",
	}}
	seen := make(map[string]struct{})
	for _, build := range builds {
		if build == nil {
			continue
		}
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
				entry.Checksums = []spdxChecksum{{
					Algorithm:     "SHA256",
					ChecksumValue: checksum,
				}}
			}
			result = append(result, entry)
		}
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
	if err := verifyStatement(root, statement, records, sbom); err != nil {
		return err
	}
	if err := verifyBundle(root, statement, records); err != nil {
		return err
	}
	return verifyImageArchive(root, statement, records)
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
			packageRecord.VersionInfo != applicationVersion ||
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
	if statement.ApplicationVersion != applicationVersion {
		return errors.New("component statement application version is invalid")
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
	foundVersion := false
	foundCompatibilityMatrix := false
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
		if input.Path == applicationVersionInputPath {
			foundVersion = input.SHA256 == applicationVersionInputDigest
		}
		if input.Path == compatibilityMatrixInputPath {
			foundCompatibilityMatrix = input.SHA256 == compatibilityMatrixDigest
		}
		previous = input.Path
	}
	if !foundBuildkitImage {
		return errors.New("component statement omits the pinned BuildKit image input")
	}
	if !foundVersion || !foundCompatibilityMatrix {
		return errors.New("component statement omits a release authority input")
	}
	compatibility := statement.Compatibility
	if compatibility.Archive.ManifestSchemaVersion != (versionRange{Minimum: 1, Maximum: 1}) ||
		compatibility.Archive.SQLiteSchemaVersion != (versionRange{Minimum: 1, Maximum: 1}) ||
		!digestPattern.MatchString(compatibility.Archive.ManifestSchemaDigest) ||
		!digestPattern.MatchString(compatibility.Archive.SchemaSQLDigest) ||
		compatibility.Archive.DomainRulesVersion != domainRulesVersion ||
		compatibility.Archive.CastRulesVersion != castRulesVersion ||
		compatibility.Archive.CompatibilityMatrixDigest != compatibilityMatrixDigest ||
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

type verifiedBundleContents struct {
	Metadata     bundleMetadata
	API          []byte
	ArchiveSmoke []byte
}

type bundleMemberSpecification struct {
	Name    string
	Type    byte
	Mode    int64
	MaxSize int64
}

func verifyBundle(
	root string,
	statement componentStatement,
	records []fileRecord,
) error {
	bundleName := fmt.Sprintf(
		"backend-api-%s-%s.tar.gz",
		statement.Target.OS,
		statement.Target.Architecture,
	)
	ociName := fmt.Sprintf(
		"backend-api-%s-%s.oci.tar",
		statement.Target.OS,
		statement.Target.Architecture,
	)
	bundleRecord, bundleFound := findArtifactRecord(records, bundleName)
	ociRecord, ociFound := findArtifactRecord(records, ociName)
	if !bundleFound || !ociFound || len(records) != 2 {
		return errors.New("Backend distributed artifact names do not match the statement target")
	}
	if bundleRecord.Size <= 0 || bundleRecord.Size > maxBundleSize {
		return fmt.Errorf("Backend bundle size %d is outside the accepted bound", bundleRecord.Size)
	}
	contents, err := readVerifiedBundle(filepath.Join(root, bundleName))
	if err != nil {
		return fmt.Errorf("verify Backend bundle: %w", err)
	}
	metadata := contents.Metadata
	if metadata.SchemaVersion != 2 || metadata.Component != componentID {
		return errors.New("Backend bundle metadata is not schema version 2")
	}
	if metadata.ApplicationVersion != statement.ApplicationVersion ||
		metadata.Source != statement.Source ||
		metadata.Target != statement.Target ||
		metadata.Compatibility != statement.Compatibility ||
		!slices.Equal(metadata.Toolchain, statement.Toolchain) ||
		!slices.Equal(metadata.BaseImages, statement.BaseImages) ||
		!slices.Equal(metadata.Inputs, statement.Inputs) {
		return errors.New("Backend bundle metadata disagrees with the component statement")
	}
	if err := validateImageEvidence(metadata.Image, ociRecord); err != nil {
		return err
	}

	expectedExecutables := []executableFact{
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
	}
	if !slices.Equal(metadata.Executables, expectedExecutables) {
		return errors.New("Backend bundle executable evidence is not the closed canonical inventory")
	}

	apiBuild, err := buildinfo.Read(bytes.NewReader(contents.API))
	if err != nil {
		return fmt.Errorf("read bundled API build info: %w", err)
	}
	if err := validateBuildInfo(
		apiBuild,
		"bundled API",
		apiModulePath,
		statement.Target.OS,
		statement.Target.Architecture,
	); err != nil {
		return err
	}
	if err := validateLinkedReleaseIdentityBytes(
		contents.API,
		"bundled API",
		statement.ApplicationVersion,
		statement.Source.Revision,
	); err != nil {
		return err
	}
	if err := validateELFPolicy(bytes.NewReader(contents.API), "bundled API"); err != nil {
		return err
	}
	archiveSmokeBuild, err := buildinfo.Read(bytes.NewReader(contents.ArchiveSmoke))
	if err != nil {
		return fmt.Errorf("read bundled Archive smoke build info: %w", err)
	}
	if err := validateBuildInfo(
		archiveSmokeBuild,
		"bundled Archive smoke",
		archiveSmokeModulePath,
		statement.Target.OS,
		statement.Target.Architecture,
	); err != nil {
		return err
	}
	if err := validateLinkedReleaseIdentityBytes(
		contents.ArchiveSmoke,
		"bundled Archive smoke",
		statement.ApplicationVersion,
		statement.Source.Revision,
	); err != nil {
		return err
	}
	return validateELFPolicy(
		bytes.NewReader(contents.ArchiveSmoke),
		"bundled Archive smoke",
	)
}

func findArtifactRecord(records []fileRecord, path string) (fileRecord, bool) {
	for _, record := range records {
		if record.Path == path {
			return record, true
		}
	}
	return fileRecord{}, false
}

func validateImageEvidence(image imageMetadata, ociRecord fileRecord) error {
	for label, digest := range map[string]string{
		"index":    image.IndexSHA256,
		"manifest": image.ManifestDigest,
		"config":   image.ConfigDigest,
		"OCI tar":  image.OCITarSHA256,
	} {
		if !digestPattern.MatchString(digest) {
			return fmt.Errorf("Backend bundle image %s digest is invalid", label)
		}
	}
	if image.OCITarSHA256 != ociRecord.SHA256 {
		return errors.New("Backend bundle image digest disagrees with the distributed OCI archive")
	}
	if len(image.LayerDigests) == 0 {
		return errors.New("Backend bundle image evidence omits runtime layers")
	}
	for _, digest := range image.LayerDigests {
		if !digestPattern.MatchString(digest) {
			return errors.New("Backend bundle image evidence contains an invalid layer digest")
		}
	}
	if isRootUser(image.User) ||
		!slices.Equal(image.Entrypoint, []string{"/usr/local/bin/bgmss-api"}) {
		return errors.New("Backend bundle image evidence violates the API runtime policy")
	}
	return nil
}

func verifyImageArchive(
	root string,
	statement componentStatement,
	records []fileRecord,
) error {
	ociName := fmt.Sprintf(
		"backend-api-%s-%s.oci.tar",
		statement.Target.OS,
		statement.Target.Architecture,
	)
	ociRecord, found := findArtifactRecord(records, ociName)
	if !found ||
		ociRecord.Size <= 0 ||
		ociRecord.Size > maxImageArchiveSize {
		return errors.New("Backend OCI archive is missing or outside the accepted size bound")
	}
	temporaryRoot, err := os.MkdirTemp("", "bgmss-backend-image-verify-")
	if err != nil {
		return err
	}
	defer removeOwnedTemporaryDirectory(temporaryRoot)
	layoutPath := filepath.Join(temporaryRoot, "layout")
	ociPath := filepath.Join(root, ociName)
	if err := admitImageArchive(ociPath, layoutPath); err != nil {
		return fmt.Errorf("verify normalized OCI archive: %w", err)
	}
	options := packageOptions{
		SourceRevision:              statement.Source.Revision,
		SourceTree:                  statement.Source.Tree,
		ApplicationVersion:          statement.ApplicationVersion,
		TargetOS:                    statement.Target.OS,
		TargetArchitecture:          statement.Target.Architecture,
		OpenAPIDigest:               statement.Compatibility.OpenAPIDigest,
		ArchiveManifestSchemaDigest: statement.Compatibility.Archive.ManifestSchemaDigest,
		ArchiveSchemaSQLDigest:      statement.Compatibility.Archive.SchemaSQLDigest,
	}
	actual, err := inspectOCI(layoutPath, options)
	if err != nil {
		return fmt.Errorf("verify distributed OCI graph: %w", err)
	}
	actual.OCITarSHA256 = ociRecord.SHA256
	repackedPath := filepath.Join(temporaryRoot, "repacked.oci.tar")
	if err := writeNormalizedDirectoryTar(layoutPath, repackedPath); err != nil {
		return fmt.Errorf("repack distributed OCI graph: %w", err)
	}
	equal, err := equalFiles(ociPath, repackedPath)
	if err != nil {
		return err
	}
	if !equal {
		return errors.New("distributed OCI archive is not the normalized epoch-zero USTAR encoding")
	}

	bundleName := fmt.Sprintf(
		"backend-api-%s-%s.tar.gz",
		statement.Target.OS,
		statement.Target.Architecture,
	)
	contents, err := readVerifiedBundle(filepath.Join(root, bundleName))
	if err != nil {
		return err
	}
	if !equalImageMetadata(actual, contents.Metadata.Image) {
		return errors.New("distributed OCI graph disagrees with bundle image evidence")
	}
	return nil
}

func equalImageMetadata(left imageMetadata, right imageMetadata) bool {
	return left.IndexSHA256 == right.IndexSHA256 &&
		left.ManifestDigest == right.ManifestDigest &&
		left.ConfigDigest == right.ConfigDigest &&
		slices.Equal(left.LayerDigests, right.LayerDigests) &&
		left.User == right.User &&
		slices.Equal(left.Entrypoint, right.Entrypoint) &&
		left.OCITarSHA256 == right.OCITarSHA256
}

func readVerifiedBundle(path string) (verifiedBundleContents, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return verifiedBundleContents{}, err
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > maxBundleSize {
		return verifiedBundleContents{}, errors.New("bundle is not a bounded regular file")
	}
	compressed, err := os.ReadFile(path)
	if err != nil {
		return verifiedBundleContents{}, err
	}
	compressedReader := bytes.NewReader(compressed)
	gzipReader, err := gzip.NewReader(compressedReader)
	if err != nil {
		return verifiedBundleContents{}, err
	}
	gzipReader.Multistream(false)
	if (gzipReader.Header.ModTime != (time.Time{}) &&
		!gzipReader.Header.ModTime.Equal(time.Unix(0, 0))) ||
		gzipReader.Header.Name != "" ||
		gzipReader.Header.Comment != "" ||
		len(gzipReader.Header.Extra) != 0 ||
		gzipReader.Header.OS != 255 {
		gzipReader.Close()
		return verifiedBundleContents{}, errors.New("bundle gzip header is not normalized")
	}

	specifications := []bundleMemberSpecification{
		{Name: "bin/", Type: tar.TypeDir, Mode: 0o555},
		{
			Name:    archiveSmokeBundlePath,
			Type:    tar.TypeReg,
			Mode:    0o555,
			MaxSize: maxExecutableSize,
		},
		{
			Name:    apiBundlePath,
			Type:    tar.TypeReg,
			Mode:    0o555,
			MaxSize: maxExecutableSize,
		},
		{Name: "metadata/", Type: tar.TypeDir, Mode: 0o555},
		{
			Name:    "metadata/build.json",
			Type:    tar.TypeReg,
			Mode:    0o444,
			MaxSize: maxBundleMetadataSize,
		},
	}
	tarReader := tar.NewReader(gzipReader)
	members := make(map[string][]byte, 3)
	for _, specification := range specifications {
		header, nextErr := tarReader.Next()
		if nextErr != nil {
			gzipReader.Close()
			return verifiedBundleContents{}, fmt.Errorf(
				"bundle omits %q: %w",
				specification.Name,
				nextErr,
			)
		}
		if err := validateBundleHeader(header, specification); err != nil {
			gzipReader.Close()
			return verifiedBundleContents{}, err
		}
		if specification.Type == tar.TypeDir {
			continue
		}
		content, readErr := io.ReadAll(io.LimitReader(tarReader, specification.MaxSize+1))
		if readErr != nil {
			gzipReader.Close()
			return verifiedBundleContents{}, readErr
		}
		if int64(len(content)) != header.Size || int64(len(content)) > specification.MaxSize {
			gzipReader.Close()
			return verifiedBundleContents{}, fmt.Errorf(
				"bundle member %q has an invalid size",
				specification.Name,
			)
		}
		if _, duplicate := members[specification.Name]; duplicate {
			gzipReader.Close()
			return verifiedBundleContents{}, fmt.Errorf(
				"bundle contains duplicate member %q",
				specification.Name,
			)
		}
		members[specification.Name] = content
	}
	if header, nextErr := tarReader.Next(); nextErr != io.EOF {
		gzipReader.Close()
		if nextErr != nil {
			return verifiedBundleContents{}, nextErr
		}
		return verifiedBundleContents{}, fmt.Errorf(
			"bundle contains unexpected member %q",
			header.Name,
		)
	}
	trailing, readErr := io.ReadAll(io.LimitReader(gzipReader, 1))
	closeErr := gzipReader.Close()
	if readErr != nil {
		return verifiedBundleContents{}, readErr
	}
	if closeErr != nil {
		return verifiedBundleContents{}, closeErr
	}
	if len(trailing) != 0 || compressedReader.Len() != 0 {
		return verifiedBundleContents{}, errors.New("bundle contains trailing compressed data")
	}

	metadataBytes := members["metadata/build.json"]
	var metadata bundleMetadata
	if err := decodeStrictJSON(metadataBytes, &metadata); err != nil {
		return verifiedBundleContents{}, fmt.Errorf("decode bundle metadata: %w", err)
	}
	canonicalMetadata, err := canonicalJSONBytes(metadata)
	if err != nil {
		return verifiedBundleContents{}, err
	}
	if !bytes.Equal(metadataBytes, canonicalMetadata) {
		return verifiedBundleContents{}, errors.New("bundle metadata is not canonical JSON")
	}
	return verifiedBundleContents{
		Metadata:     metadata,
		API:          members[apiBundlePath],
		ArchiveSmoke: members[archiveSmokeBundlePath],
	}, nil
}

func validateBundleHeader(
	header *tar.Header,
	specification bundleMemberSpecification,
) error {
	if header.Name != specification.Name {
		return fmt.Errorf(
			"bundle member = %q, want %q",
			header.Name,
			specification.Name,
		)
	}
	if header.Typeflag != specification.Type ||
		header.Mode != specification.Mode ||
		header.Uid != 0 ||
		header.Gid != 0 ||
		header.Uname != "" ||
		header.Gname != "" ||
		header.Linkname != "" ||
		!header.ModTime.Equal(time.Unix(0, 0)) ||
		!header.AccessTime.IsZero() ||
		!header.ChangeTime.IsZero() ||
		header.Devmajor != 0 ||
		header.Devminor != 0 ||
		len(header.PAXRecords) != 0 ||
		len(header.Xattrs) != 0 ||
		header.Format != tar.FormatUSTAR {
		return fmt.Errorf("bundle member %q has a non-normalized header", header.Name)
	}
	if specification.Type == tar.TypeDir {
		if header.Size != 0 {
			return fmt.Errorf("bundle directory %q is not empty", header.Name)
		}
		return nil
	}
	if header.Size <= 0 || header.Size > specification.MaxSize {
		return fmt.Errorf("bundle member %q exceeds its size bound", header.Name)
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

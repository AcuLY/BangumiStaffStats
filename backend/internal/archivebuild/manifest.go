package archivebuild

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"os"
	"strings"
	"time"
	"unicode/utf8"
)

type orderedCounts struct {
	Names  []string
	Values map[string]int64
}

func (o *orderedCounts) UnmarshalJSON(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var values map[string]int64
	if err := decoder.Decode(&values); err != nil || requireJSONEOF(decoder) != nil {
		return fmt.Errorf("counts")
	}
	o.Values = values
	return nil
}

func (o orderedCounts) MarshalJSON() ([]byte, error) {
	var output bytes.Buffer
	output.WriteByte('{')
	for index, name := range o.Names {
		value, ok := o.Values[name]
		if !ok || value < 0 {
			return nil, fmt.Errorf("missing count %s", name)
		}
		if index > 0 {
			output.WriteByte(',')
		}
		nameJSON, _ := json.Marshal(name)
		output.Write(nameJSON)
		output.WriteByte(':')
		fmt.Fprintf(&output, "%d", value)
	}
	if len(o.Values) != len(o.Names) {
		return nil, fmt.Errorf("extra count")
	}
	output.WriteByte('}')
	return output.Bytes(), nil
}

type Manifest struct {
	ManifestSchemaVersion  int                `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion    int                `json:"sqliteSchemaVersion"`
	DataVersionAlgorithm   string             `json:"dataVersionAlgorithm"`
	DataVersion            string             `json:"dataVersion"`
	GeneratorVersion       string             `json:"generatorVersion"`
	GeneratedAt            string             `json:"generatedAt"`
	ArchiveRelease         string             `json:"archiveRelease"`
	ArchiveAssetURL        string             `json:"archiveAssetUrl"`
	ArchiveAssetName       string             `json:"archiveAssetName"`
	ArchiveSize            int64              `json:"archiveSize"`
	ArchiveDigest          string             `json:"archiveDigest"`
	CommonCommit           string             `json:"commonCommit"`
	CommonSubjectStaffsURL string             `json:"commonSubjectStaffsUrl"`
	CommonSize             int64              `json:"commonSize"`
	CommonDigest           string             `json:"commonDigest"`
	SchemaSQLDigest        string             `json:"schemaSqlDigest"`
	CatalogConfigDigest    string             `json:"catalogConfigDigest"`
	DomainRulesVersion     string             `json:"domainRulesVersion"`
	CastRulesVersion       string             `json:"castRulesVersion"`
	SourceFiles            []SourceAccounting `json:"sourceFiles"`
	TableCounts            orderedCounts      `json:"tableCounts"`
	QualitySummary         orderedCounts      `json:"qualitySummary"`
	SQLiteFile             string             `json:"sqliteFile"`
	SQLiteSize             int64              `json:"sqliteSize"`
	SQLiteDigest           string             `json:"sqliteDigest"`
}

func canonicalPreimage(identity BuildIdentity) ([]byte, error) {
	if err := validateIdentity(identity); err != nil {
		return nil, err
	}
	value := DataVersionAlgorithm + "\n" +
		"archiveRelease=" + identity.ArchiveRelease + "\n" +
		"archiveDigest=" + identity.ArchiveDigest + "\n" +
		"commonCommit=" + identity.CommonCommit + "\n" +
		"commonDigest=" + identity.CommonDigest + "\n" +
		fmt.Sprintf("manifestSchemaVersion=%d\n", identity.ManifestSchemaVersion) +
		fmt.Sprintf("sqliteSchemaVersion=%d\n", identity.SQLiteSchemaVersion) +
		"schemaSqlDigest=" + identity.SchemaSQLDigest + "\n" +
		"domainRulesVersion=" + identity.DomainRulesVersion + "\n" +
		"castRulesVersion=" + identity.CastRulesVersion + "\n" +
		"catalogConfigDigest=" + identity.CatalogConfigDigest + "\n"
	for _, character := range value {
		if character > 0x7f {
			return nil, failure("IDENTITY_INVALID", nil)
		}
	}
	return []byte(value), nil
}

func DataVersion(identity BuildIdentity) (string, error) {
	preimage, err := canonicalPreimage(identity)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(preimage)
	return "dv1-" + hex.EncodeToString(sum[:]), nil
}

func validateIdentity(identity BuildIdentity) error {
	if identity.ArchiveRelease == "" || len(identity.ArchiveRelease) > 255 ||
		!validDigest(identity.ArchiveDigest) ||
		!commonCommitPattern.MatchString(identity.CommonCommit) ||
		!validDigest(identity.CommonDigest) ||
		identity.ManifestSchemaVersion != ManifestSchemaVersion ||
		identity.SQLiteSchemaVersion != SQLiteSchemaVersion ||
		!validDigest(identity.SchemaSQLDigest) ||
		identity.DomainRulesVersion != DomainRulesVersion ||
		identity.CastRulesVersion != CastRulesVersion ||
		!validDigest(identity.CatalogConfigDigest) {
		return failure("IDENTITY_INVALID", nil)
	}
	return nil
}

func digestFile(ctx context.Context, path string) (int64, string, error) {
	file, err := os.Open(path)
	if err != nil {
		return 0, "", err
	}
	defer file.Close()
	hash := sha256.New()
	buffer := make([]byte, 1024*1024)
	var size int64
	for {
		if err := contextError(ctx); err != nil {
			return 0, "", err
		}
		count, readErr := file.Read(buffer)
		if count > 0 {
			size += int64(count)
			_, _ = hash.Write(buffer[:count])
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return 0, "", readErr
		}
	}
	return size, "sha256:" + hex.EncodeToString(hash.Sum(nil)), nil
}

func formatGeneratedAt(value time.Time) (string, error) {
	value = value.UTC().Truncate(time.Microsecond)
	if value.Year() < 1 || value.Year() > 9999 {
		return "", failure("MANIFEST_SCHEMA_INVALID", nil)
	}
	return value.Format(time.RFC3339Nano), nil
}

func validManifestURL(value string, common bool) bool {
	if !utf8.ValidString(value) || strings.ContainsAny(value, "\x00\r\n") {
		return false
	}
	length := utf8.RuneCountInString(value)
	if length < 12 || length > 2048 {
		return false
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.Hostname() == "" || parsed.User != nil || parsed.Fragment != "" {
		return false
	}
	return !common || strings.HasSuffix(value, "/subject_staffs.yml")
}

type finalizeManifestRequest struct {
	Destination      string
	Identity         BuildIdentity
	GeneratedAt      time.Time
	GeneratorVersion string
	Acquired         AcquiredInputs
	Build            BuildResult
}

func finalizeManifest(ctx context.Context, request finalizeManifestRequest) (Manifest, string, error) {
	version, err := DataVersion(request.Identity)
	if err != nil {
		return Manifest{}, "", err
	}
	if request.Build.DataVersion != version || len(request.Build.Accounting) != len(SourceNames) {
		return Manifest{}, "", failure("MANIFEST_ACCOUNTING_INVALID", nil)
	}
	for index := range request.Build.Accounting {
		entry := request.Build.Accounting[index]
		if entry.Name != SourceNames[index] || entry.RecordsTotal != entry.Imported+entry.Duplicate+entry.Invalid+entry.Unresolved {
			return Manifest{}, "", failure("MANIFEST_ACCOUNTING_INVALID", nil)
		}
	}
	generatedAt, err := formatGeneratedAt(request.GeneratedAt)
	if err != nil {
		return Manifest{}, "", err
	}
	if !validManifestURL(request.Acquired.ArchiveAssetURL, false) || !validManifestURL(request.Acquired.CommonURL, true) {
		return Manifest{}, "", failure("MANIFEST_SCHEMA_INVALID", nil)
	}
	sqliteSize, sqliteDigest, err := digestFile(ctx, request.Build.SQLitePath)
	if err != nil {
		return Manifest{}, "", failure("SQLITE_DIGEST_FAILED", err)
	}
	manifest := Manifest{
		ManifestSchemaVersion:  ManifestSchemaVersion,
		SQLiteSchemaVersion:    SQLiteSchemaVersion,
		DataVersionAlgorithm:   DataVersionAlgorithm,
		DataVersion:            version,
		GeneratorVersion:       request.GeneratorVersion,
		GeneratedAt:            generatedAt,
		ArchiveRelease:         request.Identity.ArchiveRelease,
		ArchiveAssetURL:        request.Acquired.ArchiveAssetURL,
		ArchiveAssetName:       request.Acquired.ArchiveAssetName,
		ArchiveSize:            request.Acquired.ArchiveSize,
		ArchiveDigest:          request.Identity.ArchiveDigest,
		CommonCommit:           request.Identity.CommonCommit,
		CommonSubjectStaffsURL: request.Acquired.CommonURL,
		CommonSize:             request.Acquired.CommonSize,
		CommonDigest:           request.Identity.CommonDigest,
		SchemaSQLDigest:        request.Identity.SchemaSQLDigest,
		CatalogConfigDigest:    request.Identity.CatalogConfigDigest,
		DomainRulesVersion:     DomainRulesVersion,
		CastRulesVersion:       CastRulesVersion,
		SourceFiles:            append([]SourceAccounting(nil), request.Build.Accounting...),
		TableCounts:            orderedCounts{Names: TableNames[:], Values: request.Build.TableCounts},
		QualitySummary:         orderedCounts{Names: QualityNames[:], Values: request.Build.QualitySummary},
		SQLiteFile:             SQLiteFilename,
		SQLiteSize:             sqliteSize,
		SQLiteDigest:           sqliteDigest,
	}
	data, err := prettyCanonicalJSON(manifest)
	if err != nil {
		return Manifest{}, "", failure("MANIFEST_SCHEMA_INVALID", err)
	}
	file, err := os.OpenFile(request.Destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return Manifest{}, "", failure("MANIFEST_WRITE_FAILED", err)
	}
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	closeErr := file.Close()
	if err == nil {
		err = closeErr
	}
	if err != nil {
		_ = os.Remove(request.Destination)
		return Manifest{}, "", failure("MANIFEST_WRITE_FAILED", err)
	}
	return manifest, digestBytes(data), nil
}

func decodeManifest(data []byte) (Manifest, error) {
	if !utf8.Valid(data) {
		return Manifest{}, failure("MANIFEST_SCHEMA_INVALID", nil)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest Manifest
	if err := decoder.Decode(&manifest); err != nil || requireJSONEOF(decoder) != nil {
		return Manifest{}, failure("MANIFEST_SCHEMA_INVALID", err)
	}
	if !validDataVersion(manifest.DataVersion) || manifest.DataVersionAlgorithm != DataVersionAlgorithm ||
		manifest.ManifestSchemaVersion != ManifestSchemaVersion || manifest.SQLiteSchemaVersion != SQLiteSchemaVersion ||
		manifest.SQLiteFile != SQLiteFilename || !validDigest(manifest.SQLiteDigest) ||
		!validManifestURL(manifest.ArchiveAssetURL, false) || !validManifestURL(manifest.CommonSubjectStaffsURL, true) {
		return Manifest{}, failure("MANIFEST_SCHEMA_INVALID", nil)
	}
	if parsed, err := time.Parse(time.RFC3339Nano, manifest.GeneratedAt); err != nil || parsed.Location() != time.UTC ||
		strings.Contains(manifest.GeneratedAt, "+00:00") {
		return Manifest{}, failure("MANIFEST_SCHEMA_INVALID", err)
	}
	return manifest, nil
}

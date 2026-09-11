// Package archivebuild acquires Bangumi Archive inputs and builds one
// immutable SQLite candidate. It deliberately has no dependency on the
// application, HTTP handlers, query services, or the Archive consumer.
package archivebuild

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"time"
)

const (
	DataVersionAlgorithm  = "bgmss-archive-data-version-v1"
	LogicalRowsAlgorithm  = "bgmss-producer-logical-rows-v1"
	DomainRulesVersion    = "domain-raw-v1"
	CastRulesVersion      = "cast-exact-v1"
	ManifestSchemaVersion = 1
	SQLiteSchemaVersion   = 2
	SQLiteApplicationID   = 1111969107
	SQLiteFilename        = "bangumi.sqlite"
	ManifestFilename      = "manifest.json"
	DefaultCommonCommit   = "6a8442c17143a870357a5ff812362e8b5cfe9f9d"
)

var (
	digestPattern       = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	dataVersionPattern  = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	commonCommitPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

var SourceNames = [...]string{
	"subject.jsonlines",
	"person.jsonlines",
	"character.jsonlines",
	"subject-persons.jsonlines",
	"subject-characters.jsonlines",
	"person-characters.jsonlines",
	"subject-relations.jsonlines",
}

var ArchiveMemberNames = [...]string{
	"subject.jsonlines",
	"person.jsonlines",
	"character.jsonlines",
	"subject-persons.jsonlines",
	"subject-characters.jsonlines",
	"person-characters.jsonlines",
	"subject-relations.jsonlines",
	"episode.jsonlines",
	"person-relations.jsonlines",
}

var TableNames = [...]string{
	"archive_meta",
	"subject",
	"subject_rating_bucket",
	"subject_tag",
	"person",
	"person_career",
	"character",
	"subject_relation",
	"staff_position",
	"staff_position_category",
	"staff_credit",
	"cast_credit",
	"staff_set",
	"staff_set_member",
	"catalog_position",
	"catalog_position_member",
	"catalog_group",
	"catalog_group_member",
	"catalog_capability",
	"catalog_selection_rule",
}

var QualityNames = [...]string{
	"NO_CHARACTERS",
	"NO_CAST_RELATIONS",
	"FILTERED_BY_VALID_CV",
	"UNKNOWN_STAFF_POSITION",
}

var subjectTypes = map[int64]string{1: "book", 2: "anime", 3: "music", 4: "game", 6: "real"}

var subjectTypeOrder = map[string]int{"book": 0, "anime": 1, "music": 2, "game": 3, "real": 4}

// Error is a stable, bounded builder failure. Cause is never included in the
// public string so callers can log the code without leaking paths or URLs.
type Error struct {
	Code   string
	Source string
	Line   int
	Cause  error
}

func (e *Error) Error() string { return e.Code }

func (e *Error) Unwrap() error { return e.Cause }

func failure(code string, cause error) error { return &Error{Code: code, Cause: cause} }

func sourceFailure(code, source string, line int, cause error) error {
	return &Error{Code: code, Source: source, Line: line, Cause: cause}
}

// ErrorCode returns the stable code carried by an archivebuild error.
func ErrorCode(err error) string {
	var buildErr *Error
	if errors.As(err, &buildErr) {
		return buildErr.Code
	}
	return "INTERNAL_ERROR"
}

type SourceInput struct {
	Name           string
	Path           string
	Size           int64
	Digest         string
	DeclaredSize   int64
	DeclaredDigest string
}

type AcquiredInputs struct {
	ArchiveRelease   string
	ArchiveAssetURL  string
	ArchiveAssetName string
	ArchiveSize      int64
	ArchiveDigest    string
	CommonCommit     string
	CommonURL        string
	CommonSize       int64
	CommonDigest     string
	CommonBytes      []byte
	Sources          []SourceInput
}

type BuildIdentity struct {
	ArchiveRelease        string `json:"archiveRelease"`
	ArchiveDigest         string `json:"archiveDigest"`
	CommonCommit          string `json:"commonCommit"`
	CommonDigest          string `json:"commonDigest"`
	ManifestSchemaVersion int    `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion   int    `json:"sqliteSchemaVersion"`
	SchemaSQLDigest       string `json:"schemaSqlDigest"`
	DomainRulesVersion    string `json:"domainRulesVersion"`
	CastRulesVersion      string `json:"castRulesVersion"`
	CatalogConfigDigest   string `json:"catalogConfigDigest"`
}

type SourceAccounting struct {
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	Digest       string `json:"digest"`
	RecordsTotal int64  `json:"recordsTotal"`
	Imported     int64  `json:"imported"`
	Duplicate    int64  `json:"duplicate"`
	Invalid      int64  `json:"invalid"`
	Unresolved   int64  `json:"unresolved"`
}

type BuildResult struct {
	DataVersion    string
	SQLitePath     string
	Accounting     []SourceAccounting
	TableCounts    map[string]int64
	QualitySummary map[string]int64
	LogicalDigests map[string]string
	QualityReport  map[string]any
}

type RunStatus string

const (
	StatusPublished RunStatus = "published"
	StatusNoChange  RunStatus = "no-change"
)

type RunResult struct {
	Status         RunStatus
	DataVersion    string
	ManifestDigest string
	SQLiteDigest   string
	VersionRoot    string
	QualityReport  map[string]any
}

type Provider interface {
	Acquire(context.Context, string, string) (AcquiredInputs, error)
}

type RunConfig struct {
	OutputRoot       string
	CommonCommit     string
	GeneratorVersion string
	GeneratedAt      time.Time
	HTTPSProxy       string
	Provider         Provider
}

func (c RunConfig) validate() (RunConfig, error) {
	if c.CommonCommit == "" {
		c.CommonCommit = DefaultCommonCommit
	}
	if !commonCommitPattern.MatchString(c.CommonCommit) {
		return c, failure("COMMON_COMMIT_INVALID", nil)
	}
	if c.GeneratorVersion == "" || len(c.GeneratorVersion) > 128 {
		return c, failure("GENERATOR_VERSION_INVALID", nil)
	}
	if !filepath.IsAbs(c.OutputRoot) || filepath.Clean(c.OutputRoot) != c.OutputRoot {
		return c, failure("OUTPUT_ROOT_INVALID", nil)
	}
	if c.GeneratedAt.IsZero() {
		c.GeneratedAt = time.Now().UTC().Truncate(time.Second)
	}
	if c.GeneratedAt.Location() != time.UTC {
		c.GeneratedAt = c.GeneratedAt.UTC()
	}
	return c, nil
}

func contextError(ctx context.Context) error {
	if err := ctx.Err(); err != nil {
		return failure("CANCELED", err)
	}
	return nil
}

func validDigest(value string) bool { return digestPattern.MatchString(value) }

func validDataVersion(value string) bool { return dataVersionPattern.MatchString(value) }

func subjectTypeFromCode(code int64) (string, error) {
	value, ok := subjectTypes[code]
	if !ok {
		return "", failure("SOURCE_RECORD_MALFORMED", fmt.Errorf("subject type"))
	}
	return value, nil
}

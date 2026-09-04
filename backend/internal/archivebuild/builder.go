package archivebuild

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"
	"sort"
	"strconv"
	"strings"

	_ "modernc.org/sqlite"
)

type BuildRequest struct {
	Destination  string
	Sources      []SourceInput
	CommonBytes  []byte
	CatalogBytes []byte
	SchemaSQL    []byte
	Identity     BuildIdentity
}

func BuildDatabase(ctx context.Context, request BuildRequest) (result BuildResult, returnErr error) {
	if err := contextError(ctx); err != nil {
		return BuildResult{}, err
	}
	version, err := DataVersion(request.Identity)
	if err != nil {
		return BuildResult{}, err
	}
	if digestBytes(request.CommonBytes) != request.Identity.CommonDigest {
		return BuildResult{}, failure("COMMON_DIGEST_MISMATCH", nil)
	}
	if digestBytes(request.CatalogBytes) != request.Identity.CatalogConfigDigest {
		return BuildResult{}, failure("CATALOG_DIGEST_MISMATCH", nil)
	}
	if digestBytes(request.SchemaSQL) != request.Identity.SchemaSQLDigest {
		return BuildResult{}, failure("SCHEMA_DIGEST_MISMATCH", nil)
	}
	sources, err := verifySources(ctx, request.Sources)
	if err != nil {
		return BuildResult{}, err
	}
	common, catalog, err := parseCatalog(request.CommonBytes, request.CatalogBytes)
	if err != nil {
		return BuildResult{}, err
	}
	if _, err := os.Lstat(request.Destination); err == nil || !os.IsNotExist(err) {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	if err := os.MkdirAll(filepathDir(request.Destination), 0o750); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	defer func() {
		if returnErr != nil {
			_ = os.Remove(request.Destination)
			_ = os.Remove(request.Destination + "-journal")
			_ = os.Remove(request.Destination + "-wal")
			_ = os.Remove(request.Destination + "-shm")
		}
	}()
	database, err := sql.Open("sqlite", request.Destination)
	if err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	database.SetMaxOpenConns(1)
	database.SetMaxIdleConns(1)
	defer database.Close()
	connection, err := database.Conn(ctx)
	if err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	defer connection.Close()
	if _, err = connection.ExecContext(ctx, "PRAGMA foreign_keys = ON"); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	if _, err = connection.ExecContext(ctx, "PRAGMA temp_store = FILE"); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	if _, err = connection.ExecContext(ctx, "PRAGMA journal_mode = DELETE"); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	if _, err = connection.ExecContext(ctx, string(request.SchemaSQL)); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	if _, err = connection.ExecContext(ctx, tempSchemaSQL); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	transaction, err := connection.BeginTx(ctx, nil)
	if err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	committed := false
	defer func() {
		if !committed {
			_ = transaction.Rollback()
		}
	}()
	if _, err = transaction.ExecContext(ctx, "INSERT INTO archive_meta VALUES (1, ?, ?, ?, ?, ?, ?, ?)", version, ManifestSchemaVersion, SQLiteSchemaVersion, DataVersionAlgorithm, DomainRulesVersion, CastRulesVersion, request.Identity.CatalogConfigDigest); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	commonIdentities, err := insertCatalog(ctx, transaction, common, catalog, request.Identity.CommonCommit)
	if err != nil {
		return BuildResult{}, err
	}
	processor := sourceProcessor{ctx: ctx, tx: transaction, commonIdentities: commonIdentities, governed: catalog.Governed}
	accounting, unresolved, fatalErr := processor.process(sources)
	if fatalErr != nil {
		return BuildResult{}, fatalErr
	}
	if err := transaction.Commit(); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	committed = true
	qualityReport, qualitySummary, err := compileQuality(ctx, connection, catalog.Governed, unresolved)
	if err != nil {
		return BuildResult{}, err
	}
	tableCounts, err := tableCounts(ctx, connection)
	if err != nil {
		return BuildResult{}, err
	}
	logicalDigests, err := logicalDigests(ctx, connection, catalog)
	if err != nil {
		return BuildResult{}, err
	}
	var foreignKeyProblem any
	if err := connection.QueryRowContext(ctx, "PRAGMA foreign_key_check").Scan(&foreignKeyProblem); err != sql.ErrNoRows {
		if err == nil {
			return BuildResult{}, failure("SQLITE_INTEGRITY_FAILED", nil)
		}
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	var quickCheck string
	if err := connection.QueryRowContext(ctx, "PRAGMA quick_check").Scan(&quickCheck); err != nil || quickCheck != "ok" {
		return BuildResult{}, failure("SQLITE_INTEGRITY_FAILED", err)
	}
	if err := connection.Close(); err != nil {
		return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
	}
	for _, suffix := range []string{"-journal", "-wal", "-shm"} {
		if _, err := os.Lstat(request.Destination + suffix); err == nil {
			return BuildResult{}, failure("SQLITE_BUILD_FAILED", nil)
		} else if !os.IsNotExist(err) {
			return BuildResult{}, failure("SQLITE_BUILD_FAILED", err)
		}
	}
	return BuildResult{DataVersion: version, SQLitePath: request.Destination, Accounting: accounting, TableCounts: tableCounts, QualitySummary: qualitySummary, LogicalDigests: logicalDigests, QualityReport: qualityReport}, nil
}

const tempSchemaSQL = `
CREATE TEMP TABLE seen_record (
  source TEXT NOT NULL,
  identity TEXT NOT NULL,
  digest TEXT NOT NULL,
  PRIMARY KEY (source, identity)
) STRICT;
CREATE TEMP TABLE entity_subject (
  subject_id INTEGER NOT NULL PRIMARY KEY,
  subject_type TEXT NOT NULL
) STRICT;
CREATE TEMP TABLE source_subject_character (
  subject_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  role_type INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (subject_id, character_id)
) STRICT;
CREATE TEMP TABLE eligible_staff_person (
  person_id INTEGER NOT NULL PRIMARY KEY
) STRICT;
CREATE TEMP TABLE exact_cast_edge (
  subject_type TEXT NOT NULL,
  subject_id INTEGER NOT NULL,
  person_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  role_type INTEGER NOT NULL,
  sort_order INTEGER NOT NULL,
  PRIMARY KEY (subject_type, subject_id, person_id, character_id)
) STRICT;`

func filepathDir(value string) string {
	index := strings.LastIndexAny(value, `/\\`)
	if index <= 0 {
		return "."
	}
	return value[:index]
}

func verifySources(ctx context.Context, supplied []SourceInput) ([]SourceInput, error) {
	byName := make(map[string]SourceInput, len(supplied))
	for _, source := range supplied {
		if _, ok := byName[source.Name]; ok {
			return nil, sourceFailure("SOURCE_SET_EXTRA", source.Name, 0, nil)
		}
		byName[source.Name] = source
	}
	for name := range byName {
		if !slicesContains(SourceNames[:], name) {
			return nil, sourceFailure("SOURCE_SET_EXTRA", name, 0, nil)
		}
	}
	result := make([]SourceInput, 0, len(SourceNames))
	for _, name := range SourceNames {
		source, ok := byName[name]
		if !ok {
			return nil, sourceFailure("SOURCE_SET_MISSING", name, 0, nil)
		}
		metadata, err := os.Lstat(source.Path)
		if err != nil || !metadata.Mode().IsRegular() || metadata.Mode()&os.ModeSymlink != 0 {
			return nil, sourceFailure("SOURCE_FILE_INVALID", name, 0, err)
		}
		size, digest, err := digestFile(ctx, source.Path)
		if err != nil {
			return nil, sourceFailure(ErrorCode(err), name, 0, err)
		}
		if size != source.Size || source.DeclaredSize != source.Size {
			return nil, sourceFailure("SOURCE_SIZE_MISMATCH", name, 0, nil)
		}
		if digest != source.Digest || source.DeclaredDigest != source.Digest {
			return nil, sourceFailure("SOURCE_DIGEST_MISMATCH", name, 0, nil)
		}
		result = append(result, source)
	}
	return result, nil
}

func slicesContains(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func insertCatalog(ctx context.Context, tx *sql.Tx, common commonCatalog, catalog compiledCatalog, commonCommit string) (map[string]struct{}, error) {
	identities := make(map[string]struct{}, len(common.Positions))
	if catalog.Governed {
		categoryOrder := make(map[string]int64)
		for _, category := range catalog.OrderedCategories {
			categoryOrder[category.SubjectType] += 10
			if _, err := tx.ExecContext(ctx, "INSERT INTO staff_position_category VALUES (?, ?, ?, ?)", category.SubjectType, category.Key, category.Names.CN, categoryOrder[category.SubjectType]); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
		positionOrder := make(map[string]int64)
		for _, position := range catalog.OrderedPositions {
			positionOrder[position.SubjectType] += 10
			categories, _ := compactJSON(position.CategoryKeys)
			if _, err := tx.ExecContext(ctx, "INSERT INTO staff_position VALUES (?, ?, ?, ?, ?, ?, ?, 'selectable', ?)", position.SubjectType, position.PositionID, nullableString(position.Names.CN), nullableString(position.Names.EN), nullableString(position.Names.JP), categories, positionOrder[position.SubjectType], commonCommit); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
			identities[position.SubjectType+":"+strconv.FormatInt(position.PositionID, 10)] = struct{}{}
		}
	} else {
		categories := append([]commonCategory(nil), common.Categories...)
		sort.Slice(categories, func(i, j int) bool {
			if subjectTypeOrder[categories[i].SubjectType] != subjectTypeOrder[categories[j].SubjectType] {
				return subjectTypeOrder[categories[i].SubjectType] < subjectTypeOrder[categories[j].SubjectType]
			}
			left, right := int64(0), int64(0)
			if categories[i].Order != nil {
				left = *categories[i].Order
			}
			if categories[j].Order != nil {
				right = *categories[j].Order
			}
			if left != right {
				return left < right
			}
			return categories[i].Key < categories[j].Key
		})
		for _, category := range categories {
			order := int64(0)
			if category.Order != nil {
				order = *category.Order
			}
			if _, err := tx.ExecContext(ctx, "INSERT INTO staff_position_category VALUES (?, ?, ?, ?)", category.SubjectType, category.Key, category.Names.CN, order); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
		positions := append([]commonPosition(nil), common.Positions...)
		sort.Slice(positions, func(i, j int) bool {
			if subjectTypeOrder[positions[i].SubjectType] != subjectTypeOrder[positions[j].SubjectType] {
				return subjectTypeOrder[positions[i].SubjectType] < subjectTypeOrder[positions[j].SubjectType]
			}
			return positions[i].PositionID < positions[j].PositionID
		})
		for _, position := range positions {
			order := int64(0)
			if position.Order != nil {
				order = *position.Order
			}
			categoriesJSON, _ := compactJSON(position.CategoryKeys)
			if _, err := tx.ExecContext(ctx, "INSERT INTO staff_position VALUES (?, ?, ?, ?, ?, ?, ?, 'selectable', ?)", position.SubjectType, position.PositionID, nullableString(position.Names.CN), nullableString(position.Names.EN), nullableString(position.Names.JP), categoriesJSON, order, commonCommit); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
			identities[position.SubjectType+":"+strconv.FormatInt(position.PositionID, 10)] = struct{}{}
		}
	}
	for _, set := range catalog.StaffSets {
		if _, err := tx.ExecContext(ctx, "INSERT INTO staff_set VALUES (?, ?, ?, ?)", set.Key, set.SubjectType, set.Label, set.DisplayOrder); err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		for _, member := range set.Members {
			id, _ := strconv.ParseInt(member[strings.LastIndex(member, ":")+1:], 10, 64)
			if _, err := tx.ExecContext(ctx, "INSERT INTO staff_set_member VALUES (?, ?, ?)", set.Key, set.SubjectType, id); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	for _, position := range catalog.Positions {
		var cn, en, jp any
		if catalog.Governed {
			cn, en, jp = nullableString(position.Names.CN), nullableString(position.Names.EN), nullableString(position.Names.JP)
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_position VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", position.PositionKey, position.SubjectType, position.PositionKind, position.Label, cn, en, jp, position.DisplayOrder, boolInt(position.Selectable)); err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		for _, capability := range position.Capabilities {
			if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_capability VALUES (?, ?, 1)", position.PositionKey, capability); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
		if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_selection_rule VALUES (?, ?, ?, ?)", position.RuleKey, position.PositionKey, position.RuleKind, position.RuleValue); err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		for _, member := range position.MemberKeys {
			if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_position_member VALUES (?, ?)", position.PositionKey, member); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	for _, group := range catalog.Groups {
		if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_group VALUES (?, ?, ?, ?)", group.GroupKey, group.SubjectType, group.Label, group.DisplayOrder); err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		for index, key := range group.PositionKeys {
			if _, err := tx.ExecContext(ctx, "INSERT INTO catalog_group_member VALUES (?, ?, ?)", group.GroupKey, key, index); err != nil {
				return nil, failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	return identities, nil
}

func compactJSON(value any) (string, error) {
	data, err := json.Marshal(value)
	return string(data), err
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func boolInt(value bool) int {
	if value {
		return 1
	}
	return 0
}

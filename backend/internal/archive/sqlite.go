package archive

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"net/url"
	"os"
	"strconv"
	"strings"
	"unicode/utf8"

	_ "modernc.org/sqlite"
	sqlitevfs "modernc.org/sqlite/vfs"
)

const sqliteDriverName = "sqlite"

func openValidatedStore(ctx context.Context, files selectedFiles, hooks loadHooks) (*Store, error) {
	store := &Store{
		archiveRoot: files.root,
		identity: Identity{
			DataVersion:    files.manifest.DataVersion,
			ManifestDigest: files.manifestDigest,
			SQLiteDigest:   files.sqliteDigest,
		},
	}
	accepted := false
	defer func() {
		if !accepted {
			_ = store.Close()
		}
	}()

	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	if hooks.beforeSQLiteOpen != nil {
		hooks.beforeSQLiteOpen()
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}

	versionRoot, err := files.root.OpenRoot(files.versionPath)
	if err != nil {
		return nil, outcome(CodeArchiveImmutableLayoutInvalid)
	}
	store.versionRoot = versionRoot
	openedSQLite, err := versionRoot.Lstat(sqliteFilename)
	if err != nil || openedSQLite.Mode()&os.ModeSymlink != 0 ||
		!openedSQLite.Mode().IsRegular() ||
		!sameFileSnapshot(files.sqliteInfo, openedSQLite) {
		return nil, outcome(CodeArchiveImmutableLayoutInvalid)
	}

	sqliteFiles := &validatedSQLiteFS{
		root:     versionRoot,
		expected: files.sqliteInfo,
		hooks:    hooks,
	}
	vfsName, registeredVFS, err := sqlitevfs.New(sqliteFiles)
	if err != nil {
		return nil, outcome(CodeArchiveFileInvalid)
	}
	store.sqliteVFS = registeredVFS

	dsn := immutableSQLiteDSN(vfsName)
	database, err := sql.Open(sqliteDriverName, dsn)
	if err != nil {
		return nil, outcome(CodeSQLiteFormatInvalid)
	}
	store.db = database
	database.SetMaxOpenConns(4)
	database.SetMaxIdleConns(4)
	database.SetConnMaxLifetime(0)
	database.SetConnMaxIdleTime(0)

	if err := database.PingContext(ctx); err != nil {
		return nil, sqliteOpenOutcome(ctx, sqliteFiles)
	}

	connections := make([]*sql.Conn, 0, 4)
	defer func() {
		for _, connection := range connections {
			_ = connection.Close()
		}
	}()
	for range 4 {
		connection, err := database.Conn(ctx)
		if err != nil {
			return nil, sqliteOpenOutcome(ctx, sqliteFiles)
		}
		connections = append(connections, connection)
	}
	if sqliteFiles.invalid.Load() {
		return nil, outcome(CodeArchiveImmutableLayoutInvalid)
	}
	for _, connection := range connections {
		if err := verifyConnection(ctx, connection); err != nil {
			return nil, err
		}
	}

	validationConnection := connections[0]
	if err := verifySQLiteIdentity(ctx, validationConnection, files.manifest); err != nil {
		return nil, err
	}
	if err := verifyIntegrity(ctx, validationConnection); err != nil {
		return nil, err
	}
	if err := verifyRequiredObjects(ctx, validationConnection); err != nil {
		return nil, err
	}
	if err := verifyTableCounts(ctx, validationConnection, files.manifest.TableCounts); err != nil {
		return nil, err
	}

	if hooks.beforeFinalFileCheck != nil {
		hooks.beforeFinalFileCheck()
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	if err := verifySQLiteUnchanged(files); err != nil {
		return nil, err
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	accepted = true
	return store, nil
}

func sqliteOpenOutcome(ctx context.Context, sqliteFiles *validatedSQLiteFS) error {
	if ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	if sqliteFiles.invalid.Load() {
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	return outcome(CodeSQLiteFormatInvalid)
}

func immutableSQLiteDSN(vfsName string) string {
	dsn := &url.URL{
		Scheme:   "file",
		Path:     sqliteFilename,
		OmitHost: true,
	}
	parameters := url.Values{}
	parameters.Set("cache", "private")
	parameters.Set("immutable", "1")
	parameters.Set("mode", "ro")
	parameters.Set("vfs", vfsName)
	parameters.Add("_pragma", "busy_timeout(5000)")
	parameters.Add("_pragma", "foreign_keys(1)")
	parameters.Add("_pragma", "query_only(1)")
	dsn.RawQuery = parameters.Encode()
	return dsn.String()
}

func verifyConnection(ctx context.Context, connection *sql.Conn) error {
	pragmas := []struct {
		query string
		want  int64
	}{
		{query: "PRAGMA busy_timeout", want: 5000},
		{query: "PRAGMA foreign_keys", want: 1},
		{query: "PRAGMA query_only", want: 1},
	}
	for _, pragma := range pragmas {
		var value int64
		if err := connection.QueryRowContext(ctx, pragma.query).Scan(&value); err != nil || value != pragma.want {
			if ctx.Err() != nil {
				return outcome(CodeArchiveContextCanceled)
			}
			return outcome(CodeArchiveImmutableLayoutInvalid)
		}
	}

	var journalMode string
	if err := connection.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&journalMode); err != nil ||
		!strings.EqualFold(journalMode, "delete") {
		if ctx.Err() != nil {
			return outcome(CodeArchiveContextCanceled)
		}
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	if err := verifyMainDatabasePath(ctx, connection); err != nil {
		return err
	}
	return nil
}

func verifyMainDatabasePath(ctx context.Context, connection *sql.Conn) error {
	rows, err := connection.QueryContext(ctx, "PRAGMA database_list")
	if err != nil {
		if ctx.Err() != nil {
			return outcome(CodeArchiveContextCanceled)
		}
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	defer rows.Close()

	foundMain := false
	for rows.Next() {
		var sequence int
		var name string
		var path string
		if err := rows.Scan(&sequence, &name, &path); err != nil {
			return outcome(CodeArchiveImmutableLayoutInvalid)
		}
		if name == "main" {
			if foundMain || path != sqliteFilename {
				return outcome(CodeArchiveImmutableLayoutInvalid)
			}
			foundMain = true
		}
	}
	if err := rows.Err(); err != nil || !foundMain {
		if ctx.Err() != nil {
			return outcome(CodeArchiveContextCanceled)
		}
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	return nil
}

func verifySQLiteIdentity(ctx context.Context, connection *sql.Conn, value manifest) error {
	var applicationID int64
	if err := connection.QueryRowContext(ctx, "PRAGMA application_id").Scan(&applicationID); err != nil ||
		applicationID != sqliteApplicationID {
		return sqliteIdentityOutcome(ctx)
	}
	var userVersion int64
	if err := connection.QueryRowContext(ctx, "PRAGMA user_version").Scan(&userVersion); err != nil ||
		userVersion != sqliteSchemaVersion {
		return sqliteIdentityOutcome(ctx)
	}

	var (
		dataVersion         string
		manifestVersion     int64
		databaseVersion     int64
		algorithm           string
		domainRulesVersion  string
		castRulesVersion    string
		catalogConfigDigest string
	)
	err := connection.QueryRowContext(ctx, `
		SELECT data_version,
		       manifest_schema_version,
		       sqlite_schema_version,
		       data_version_algorithm,
		       domain_rules_version,
		       cast_rules_version,
		       catalog_config_digest
		  FROM archive_meta
		 WHERE singleton = 1
	`).Scan(
		&dataVersion,
		&manifestVersion,
		&databaseVersion,
		&algorithm,
		&domainRulesVersion,
		&castRulesVersion,
		&catalogConfigDigest,
	)
	if err != nil ||
		dataVersion != value.DataVersion ||
		manifestVersion != value.ManifestSchemaVersion ||
		databaseVersion != value.SQLiteSchemaVersion ||
		algorithm != value.DataVersionAlgorithm ||
		domainRulesVersion != value.DomainRulesVersion ||
		castRulesVersion != value.CastRulesVersion ||
		catalogConfigDigest != value.CatalogConfigDigest {
		return sqliteIdentityOutcome(ctx)
	}
	return nil
}

func sqliteIdentityOutcome(ctx context.Context) error {
	if ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	return outcome(CodeSQLiteDataVersionMismatch)
}

func verifyIntegrity(ctx context.Context, connection *sql.Conn) error {
	rows, err := connection.QueryContext(ctx, "PRAGMA integrity_check(1)")
	if err != nil {
		return sqliteFormatOutcome(ctx)
	}
	var results []string
	for rows.Next() {
		var result string
		if err := rows.Scan(&result); err != nil {
			rows.Close()
			return sqliteFormatOutcome(ctx)
		}
		results = append(results, result)
	}
	rowsErr := rows.Err()
	if err := rows.Close(); err != nil || rowsErr != nil || len(results) != 1 || results[0] != "ok" {
		return sqliteFormatOutcome(ctx)
	}

	foreignKeys, err := connection.QueryContext(ctx, "PRAGMA foreign_key_check")
	if err != nil {
		return sqliteFormatOutcome(ctx)
	}
	hasViolation := foreignKeys.Next()
	rowsErr = foreignKeys.Err()
	if err := foreignKeys.Close(); err != nil || rowsErr != nil || hasViolation {
		return sqliteFormatOutcome(ctx)
	}
	return nil
}

func sqliteFormatOutcome(ctx context.Context) error {
	if ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	return outcome(CodeSQLiteFormatInvalid)
}

func verifyRequiredObjects(ctx context.Context, connection *sql.Conn) error {
	rows, err := connection.QueryContext(ctx, `
		SELECT type, name, tbl_name, sql
		  FROM sqlite_schema
		 WHERE type IN ('table', 'index', 'view', 'trigger')
		   AND sql IS NOT NULL
		   AND lower(substr(name, 1, 7)) <> 'sqlite_'
		 ORDER BY
		       type COLLATE BINARY,
		       name COLLATE BINARY,
		       tbl_name COLLATE BINARY
	`)
	if err != nil {
		return requiredObjectOutcome(ctx)
	}
	defer rows.Close()

	type schemaObject struct {
		objectType string
		name       string
		table      string
		sql        string
	}
	objects := make([]schemaObject, 0, schemaObjectCount)
	for rows.Next() {
		var object schemaObject
		if err := rows.Scan(&object.objectType, &object.name, &object.table, &object.sql); err != nil ||
			!utf8.ValidString(object.objectType) ||
			!utf8.ValidString(object.name) ||
			!utf8.ValidString(object.table) ||
			!utf8.ValidString(object.sql) {
			return requiredObjectOutcome(ctx)
		}
		objects = append(objects, object)
	}
	if err := rows.Err(); err != nil {
		return requiredObjectOutcome(ctx)
	}
	if err := rows.Close(); err != nil || len(objects) != schemaObjectCount {
		return requiredObjectOutcome(ctx)
	}

	hasher := sha256.New()
	_, _ = hasher.Write([]byte(schemaObjectAlgorithm + "\n"))
	_, _ = hasher.Write([]byte("count=" + strconv.Itoa(len(objects)) + "\n"))
	for _, object := range objects {
		for _, field := range []struct {
			name  string
			value string
		}{
			{name: "type", value: object.objectType},
			{name: "name", value: object.name},
			{name: "table", value: object.table},
			{name: "sql", value: object.sql},
		} {
			_, _ = hasher.Write([]byte(field.name + "=" + strconv.Itoa(len([]byte(field.value))) + ":"))
			_, _ = hasher.Write([]byte(field.value))
			_, _ = hasher.Write([]byte("\n"))
		}
	}
	actualDigest := "sha256:" + hex.EncodeToString(hasher.Sum(nil))
	if actualDigest != schemaObjectDigest {
		return requiredObjectOutcome(ctx)
	}
	return nil
}

func requiredObjectOutcome(ctx context.Context) error {
	if ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	return outcome(CodeSQLiteRequiredObjectMissing)
}

func verifyTableCounts(ctx context.Context, connection *sql.Conn, expected map[string]int64) error {
	for _, table := range requiredTableNames {
		var count int64
		query := "SELECT COUNT(*) FROM " + quoteIdentifier(table)
		if err := connection.QueryRowContext(ctx, query).Scan(&count); err != nil {
			return requiredObjectOutcome(ctx)
		}
		if count != expected[table] {
			if ctx.Err() != nil {
				return outcome(CodeArchiveContextCanceled)
			}
			return outcome(CodeSQLiteTableCountMismatch)
		}
	}
	return nil
}

func quoteIdentifier(identifier string) string {
	return `"` + strings.ReplaceAll(identifier, `"`, `""`) + `"`
}

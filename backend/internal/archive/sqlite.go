package archive

import (
	"context"
	"database/sql"
	"net/url"
	"os"
	"strings"

	_ "modernc.org/sqlite"
	sqlitevfs "modernc.org/sqlite/vfs"
)

const sqliteDriverName = "sqlite"

func openStore(ctx context.Context, files selectedFiles, hooks loadHooks) (*Store, error) {
	store := &Store{archiveRoot: files.root}
	opened := false
	defer func() {
		if !opened {
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

	sqliteFiles := &containedSQLiteFS{
		root:     versionRoot,
		expected: files.sqliteInfo,
		hooks:    hooks,
	}
	vfsName, registeredVFS, err := sqlitevfs.New(sqliteFiles)
	if err != nil {
		return nil, outcome(CodeArchiveFileInvalid)
	}
	store.sqliteVFS = registeredVFS

	database, err := sql.Open(sqliteDriverName, immutableSQLiteDSN(vfsName))
	if err != nil {
		return nil, outcome(CodeArchiveFileInvalid)
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

	dataVersion, err := readSnapshotDataVersion(ctx, connections[0])
	if err != nil || dataVersion != files.dataVersion {
		if err == nil {
			err = outcome(CodeArchiveFileInvalid)
		}
		return nil, err
	}
	store.identity = Identity{DataVersion: dataVersion}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	opened = true
	return store, nil
}

func sqliteOpenOutcome(ctx context.Context, sqliteFiles *containedSQLiteFS) error {
	if ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	if sqliteFiles.invalid.Load() {
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	return outcome(CodeArchiveFileInvalid)
}

func immutableSQLiteDSN(vfsName string) string {
	dsn := &url.URL{Scheme: "file", Path: sqliteFilename, OmitHost: true}
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
	return verifyMainDatabasePath(ctx, connection)
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
		var databasePath string
		if err := rows.Scan(&sequence, &name, &databasePath); err != nil {
			return outcome(CodeArchiveImmutableLayoutInvalid)
		}
		if name == "main" {
			if foundMain || databasePath != sqliteFilename {
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

func readSnapshotDataVersion(ctx context.Context, connection *sql.Conn) (string, error) {
	var dataVersion string
	err := connection.QueryRowContext(ctx, `
		SELECT data_version
		  FROM archive_meta
		 WHERE singleton = 1
	`).Scan(&dataVersion)
	if err != nil || dataVersion == "" {
		if ctx.Err() != nil {
			return "", outcome(CodeArchiveContextCanceled)
		}
		return "", outcome(CodeArchiveFileInvalid)
	}
	return dataVersion, nil
}

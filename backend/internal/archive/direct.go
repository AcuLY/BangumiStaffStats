package archive

import (
	"context"
	"database/sql"
	"os"
	"path"

	sqlitevfs "modernc.org/sqlite/vfs"
)

// OpenCandidate opens one producer-completed inactive version without reading
// current.json or repeating producer admission. The caller owns the Store.
func OpenCandidate(ctx context.Context, rootPath, dataVersion string) (*Store, error) {
	return openDirectCandidate(ctx, rootPath, dataVersion, false, loadHooks{})
}

func openCurrentDirect(ctx context.Context, rootPath string, hooks loadHooks) (*Store, error) {
	return openDirectCandidate(ctx, rootPath, "", true, hooks)
}

func openDirectCandidate(
	ctx context.Context,
	rootPath string,
	dataVersion string,
	useCurrent bool,
	hooks loadHooks,
) (*Store, error) {
	root, err := openArchiveRoot(ctx, rootPath, hooks)
	if err != nil {
		return nil, err
	}
	selectedVersion := dataVersion
	if useCurrent {
		pointerBytes, _, readErr := readRegularFile(
			ctx,
			root,
			currentPointerFilename,
			maxPointerBytes,
		)
		if readErr != nil {
			_ = root.Close()
			return nil, readErr
		}
		pointerValue, decodeErr := decodePointer(pointerBytes)
		if decodeErr != nil {
			_ = root.Close()
			return nil, decodeErr
		}
		if pointerValue.PointerSchemaVersion != pointerSchemaVersion {
			_ = root.Close()
			return nil, outcome(CodeArchiveVersionUnsupported)
		}
		selectedVersion = pointerValue.DataVersion
		if hooks.afterPointerRead != nil {
			hooks.afterPointerRead()
		}
	}

	files, err := selectDirectSQLite(ctx, root, selectedVersion)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	return openDirectStore(ctx, files, selectedVersion, hooks)
}

func selectDirectSQLite(
	ctx context.Context,
	root *os.Root,
	dataVersion string,
) (selectedFiles, error) {
	if err := contextOutcome(ctx); err != nil {
		return selectedFiles{}, err
	}
	if !dataVersionPattern.MatchString(dataVersion) {
		return selectedFiles{}, outcome(CodeArchiveFileInvalid)
	}
	versionPath := path.Join(versionsDirectory, dataVersion)
	if err := requireDirectory(root, versionsDirectory); err != nil {
		return selectedFiles{}, err
	}
	if err := requireDirectory(root, versionPath); err != nil {
		return selectedFiles{}, err
	}
	sqlitePath := path.Join(versionPath, sqliteFilename)
	sqliteInfo, err := root.Lstat(sqlitePath)
	if err != nil || sqliteInfo.Mode()&os.ModeSymlink != 0 ||
		!sqliteInfo.Mode().IsRegular() {
		return selectedFiles{}, outcome(CodeArchiveFileInvalid)
	}
	if err := rejectSidecars(root, sqlitePath); err != nil {
		return selectedFiles{}, err
	}
	return selectedFiles{
		root:        root,
		versionPath: versionPath,
		sqlitePath:  sqlitePath,
		sqliteInfo:  sqliteInfo,
	}, nil
}

func openDirectStore(
	ctx context.Context,
	files selectedFiles,
	dataVersion string,
	hooks loadHooks,
) (*Store, error) {
	store := &Store{
		archiveRoot: files.root,
		identity:    Identity{DataVersion: dataVersion},
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
	database, err := sql.Open(sqliteDriverName, immutableSQLiteDSN(vfsName))
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

	connection, err := database.Conn(ctx)
	if err != nil {
		return nil, sqliteOpenOutcome(ctx, sqliteFiles)
	}
	defer connection.Close()
	if err := verifyConnection(ctx, connection); err != nil {
		return nil, err
	}
	if err := verifyDirectDataVersion(ctx, connection, dataVersion); err != nil {
		return nil, err
	}
	if hooks.beforeFinalFileCheck != nil {
		hooks.beforeFinalFileCheck()
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	if sqliteFiles.invalid.Load() {
		return nil, outcome(CodeArchiveImmutableLayoutInvalid)
	}
	if err := verifySQLiteUnchanged(files); err != nil {
		return nil, err
	}
	accepted = true
	return store, nil
}

func verifyDirectDataVersion(
	ctx context.Context,
	connection *sql.Conn,
	expected string,
) error {
	rows, err := connection.QueryContext(ctx, `
		SELECT data_version
		  FROM archive_meta
		 WHERE singleton = 1
	`)
	if err != nil {
		return sqliteIdentityOutcome(ctx)
	}
	defer rows.Close()
	if !rows.Next() {
		return sqliteIdentityOutcome(ctx)
	}
	var actual string
	if err := rows.Scan(&actual); err != nil || actual != expected || rows.Next() {
		return sqliteIdentityOutcome(ctx)
	}
	if err := rows.Err(); err != nil {
		return sqliteIdentityOutcome(ctx)
	}
	return nil
}

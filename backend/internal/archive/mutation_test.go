package archive

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	sqlitevfs "modernc.org/sqlite/vfs"
)

func TestCandidateRejectsUnsafeRootsAndPaths(t *testing.T) {
	_, validDataVersion := arrangeValidCandidate(t, false)
	tests := []struct {
		name string
		run  func(t *testing.T) error
		code Code
	}{
		{
			name: "relative root",
			run: func(t *testing.T) error {
				_, err := LoadCandidate(context.Background(), ".", validDataVersion)
				return err
			},
			code: CodeArchiveRootInvalid,
		},
		{
			name: "root symlink",
			run: func(t *testing.T) error {
				target, dataVersion := arrangeValidCandidate(t, false)
				link := filepath.Join(t.TempDir(), "archive-link")
				if err := os.Symlink(target, link); err != nil {
					t.Fatal(err)
				}
				_, err := LoadCandidate(context.Background(), link, dataVersion)
				return err
			},
			code: CodeArchiveRootInvalid,
		},
		{
			name: "unsafe data version",
			run: func(t *testing.T) error {
				root, _ := arrangeValidCandidate(t, false)
				_, err := LoadCandidate(context.Background(), root, "../escape")
				return err
			},
			code: CodeArchiveFileInvalid,
		},
		{
			name: "versions symlink",
			run: func(t *testing.T) error {
				source, dataVersion := arrangeValidCandidate(t, false)
				root := t.TempDir()
				if err := os.Symlink(filepath.Join(source, versionsDirectory), filepath.Join(root, versionsDirectory)); err != nil {
					t.Fatal(err)
				}
				_, err := LoadCandidate(context.Background(), root, dataVersion)
				return err
			},
			code: CodeArchiveFileInvalid,
		},
		{
			name: "version directory symlink",
			run: func(t *testing.T) error {
				source, dataVersion := arrangeValidCandidate(t, false)
				root := t.TempDir()
				if err := os.Mkdir(filepath.Join(root, versionsDirectory), 0o755); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(
					filepath.Join(source, versionsDirectory, dataVersion),
					filepath.Join(root, versionsDirectory, dataVersion),
				); err != nil {
					t.Fatal(err)
				}
				_, err := LoadCandidate(context.Background(), root, dataVersion)
				return err
			},
			code: CodeArchiveFileInvalid,
		},
		{
			name: "manifest symlink",
			run: func(t *testing.T) error {
				root, dataVersion := arrangeValidCandidate(t, false)
				manifestPath := runtimeManifestPath(root, dataVersion)
				target := manifestPath + ".target"
				if err := os.Rename(manifestPath, target); err != nil {
					t.Fatal(err)
				}
				if err := os.Symlink(target, manifestPath); err != nil {
					t.Fatal(err)
				}
				_, err := LoadCandidate(context.Background(), root, dataVersion)
				return err
			},
			code: CodeArchiveFileInvalid,
		},
		{
			name: "sqlite directory",
			run: func(t *testing.T) error {
				root, dataVersion := arrangeValidCandidate(t, false)
				sqlitePath := runtimeSQLitePath(root, dataVersion)
				if err := os.Remove(sqlitePath); err != nil {
					t.Fatal(err)
				}
				if err := os.Mkdir(sqlitePath, 0o755); err != nil {
					t.Fatal(err)
				}
				_, err := LoadCandidate(context.Background(), root, dataVersion)
				return err
			},
			code: CodeArchiveFileInvalid,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			requireCode(t, test.run(t), test.code)
		})
	}
}

func TestArchiveRootFinalComponentReboundFailsClosed(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	replacementRoot, replacementDataVersion := arrangeValidCandidate(t, false)
	if replacementDataVersion != dataVersion {
		t.Fatalf("replacement dataVersion = %q, want %q", replacementDataVersion, dataVersion)
	}
	validatedPath := root + ".validated"
	swapped := false
	t.Cleanup(func() {
		if !swapped {
			return
		}
		_ = os.Remove(root)
		_ = os.Rename(validatedPath, root)
	})

	store, err := loadCandidate(
		context.Background(),
		root,
		dataVersion,
		loadHooks{
			beforeArchiveRootOpen: func() {
				if err := os.Rename(root, validatedPath); err != nil {
					t.Fatalf("rename validated root: %v", err)
				}
				if err := os.Symlink(replacementRoot, root); err != nil {
					t.Fatalf("bind replacement root symlink: %v", err)
				}
				swapped = true
			},
		},
	)
	if store != nil {
		store.Close()
		t.Fatal("rebound root returned a store")
	}
	requireCode(t, err, CodeArchiveRootInvalid)
}

func TestArchiveRootAllowsAnAncestorSymlink(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	link := filepath.Join(t.TempDir(), "ancestor-link")
	if err := os.Symlink(filepath.Dir(root), link); err != nil {
		t.Fatal(err)
	}
	rootThroughAncestorLink := filepath.Join(link, filepath.Base(root))
	store, err := LoadCandidate(context.Background(), rootThroughAncestorLink, dataVersion)
	if err != nil {
		t.Fatalf("load through ancestor symlink: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
}

func TestCurrentPointerMustBeARegularFile(t *testing.T) {
	root, _ := arrangeValidCandidate(t, true)
	if err := os.Remove(filepath.Join(root, currentPointerFilename)); err != nil {
		t.Fatal(err)
	}
	if err := os.Mkdir(filepath.Join(root, currentPointerFilename), 0o755); err != nil {
		t.Fatal(err)
	}
	state := new(State)
	requireCode(t, state.LoadCurrent(context.Background(), root), CodeArchiveFileInvalid)
	if state.Ready() {
		t.Fatal("invalid pointer object published readiness")
	}
}

func TestCurrentPointerCompatibilityAndDigestGatePublication(t *testing.T) {
	tests := []struct {
		name     string
		mutate   func(*pointer)
		expected Code
	}{
		{
			name: "unsupported pointer version",
			mutate: func(value *pointer) {
				value.PointerSchemaVersion = 2
			},
			expected: CodeArchiveVersionUnsupported,
		},
		{
			name: "manifest digest mismatch",
			mutate: func(value *pointer) {
				value.ManifestDigest = "sha256:" + strings.Repeat("0", 64)
			},
			expected: CodeSQLiteDataVersionMismatch,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root, _ := arrangeValidCandidate(t, true)
			pointerPath := filepath.Join(root, currentPointerFilename)
			var value pointer
			mustDecodeJSON(t, mustReadFile(t, pointerPath), &value)
			test.mutate(&value)
			data, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			if err := os.WriteFile(pointerPath, append(data, '\n'), 0o644); err != nil {
				t.Fatal(err)
			}
			state := new(State)
			requireCode(t, state.LoadCurrent(context.Background(), root), test.expected)
			if state.Ready() {
				t.Fatal("invalid pointer published readiness")
			}
		})
	}
}

func TestImmutableLayoutRejectsEverySidecar(t *testing.T) {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		t.Run(suffix, func(t *testing.T) {
			root, dataVersion := arrangeValidCandidate(t, false)
			if err := os.WriteFile(runtimeSQLitePath(root, dataVersion)+suffix, []byte("sidecar"), 0o644); err != nil {
				t.Fatal(err)
			}
			_, err := LoadCandidate(context.Background(), root, dataVersion)
			requireCode(t, err, CodeArchiveImmutableLayoutInvalid)
		})
	}
}

func TestMissingSQLiteIsNotCreated(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	sqlitePath := runtimeSQLitePath(root, dataVersion)
	if err := os.Remove(sqlitePath); err != nil {
		t.Fatal(err)
	}
	_, err := LoadCandidate(context.Background(), root, dataVersion)
	requireCode(t, err, CodeArchiveFileInvalid)
	if _, statErr := os.Lstat(sqlitePath); !os.IsNotExist(statErr) {
		t.Fatalf("missing SQLite was created: %v", statErr)
	}

	missingRootPath := t.TempDir()
	missingRoot, openRootErr := os.OpenRoot(missingRootPath)
	if openRootErr != nil {
		t.Fatalf("open root: %v", openRootErr)
	}
	vfsName, registeredVFS, vfsErr := sqlitevfs.New(missingRoot.FS())
	if vfsErr != nil {
		missingRoot.Close()
		t.Fatalf("register VFS: %v", vfsErr)
	}
	database, openErr := sql.Open(sqliteDriverName, immutableSQLiteDSN(vfsName))
	if openErr != nil {
		registeredVFS.Close()
		missingRoot.Close()
		t.Fatalf("sql.Open: %v", openErr)
	}
	if pingErr := database.PingContext(context.Background()); pingErr == nil {
		database.Close()
		registeredVFS.Close()
		missingRoot.Close()
		t.Fatal("read-only driver unexpectedly opened a missing database")
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
	if err := registeredVFS.Close(); err != nil {
		t.Fatal(err)
	}
	if err := missingRoot.Close(); err != nil {
		t.Fatal(err)
	}
	missingDriverPath := filepath.Join(missingRootPath, sqliteFilename)
	if _, statErr := os.Lstat(missingDriverPath); !os.IsNotExist(statErr) {
		t.Fatalf("driver created missing SQLite: %v", statErr)
	}
}

func TestEveryPooledConnectionRejectsWrites(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	connections := make([]*sql.Conn, 0, 4)
	for range 4 {
		connection, err := store.db.Conn(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		connections = append(connections, connection)
	}
	defer func() {
		for _, connection := range connections {
			connection.Close()
		}
	}()
	for index, connection := range connections {
		if _, err := connection.ExecContext(
			context.Background(),
			"CREATE TABLE forbidden_write_"+string(rune('a'+index))+" (id INTEGER)",
		); err == nil {
			t.Fatalf("connection %d accepted DDL", index)
		}
		if _, err := connection.ExecContext(
			context.Background(),
			"UPDATE subject SET name = name WHERE subject_id = 1",
		); err == nil {
			t.Fatalf("connection %d accepted DML", index)
		}
	}
}

func TestStoreRawQueryBoundaryRejectsUnsafeSQLBeforeDriver(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	externalPath := filepath.Join(t.TempDir(), "must-not-exist.sqlite")
	tests := []struct {
		name  string
		query string
	}{
		{name: "empty", query: ""},
		{name: "pragma", query: "PRAGMA query_only = 0"},
		{name: "attach", query: "ATTACH DATABASE '" + externalPath + "' AS external"},
		{name: "ddl", query: "CREATE TABLE forbidden (id INTEGER)"},
		{name: "dml", query: "UPDATE subject SET name = name"},
		{name: "line comment", query: "SELECT 1 -- forbidden"},
		{name: "block comment open", query: "SELECT /* forbidden */ 1"},
		{name: "block comment close", query: "SELECT '*/'"},
		{name: "semicolon", query: "SELECT 1;"},
		{name: "multiple statements", query: "SELECT 1; SELECT 2"},
		{name: "invalid first keyword", query: "EXPLAIN SELECT 1"},
		{name: "keyword prefix", query: "SELECTED value FROM subject"},
		{name: "unicode leading space", query: "\u00a0SELECT 1"},
		{name: "overly long", query: "SELECT " + strings.Repeat(" ", maxReadQueryBytes)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			rows, queryErr := store.QueryContext(context.Background(), test.query)
			if rows != nil {
				rows.Close()
			}
			if !errors.Is(queryErr, ErrUnsafeQuery) {
				t.Fatalf("error = %v, want ErrUnsafeQuery", queryErr)
			}
		})
	}
	if _, err := os.Lstat(externalPath); !os.IsNotExist(err) {
		t.Fatalf("rejected ATTACH created an external file: %v", err)
	}

	var count int64
	queryOne(t, store, " \nSELECT COUNT(*) FROM subject", &count)
	if count != 8 {
		t.Fatalf("SELECT count = %d", count)
	}
	queryOne(
		t,
		store,
		"WITH selected AS (SELECT subject_id FROM subject) SELECT COUNT(*) FROM selected",
		&count,
	)
	if count != 8 {
		t.Fatalf("WITH count = %d", count)
	}
	maximumLengthQuery := "SELECT 1" + strings.Repeat(" ", maxReadQueryBytes-len("SELECT 1"))
	var one int64
	queryOne(t, store, maximumLengthQuery, &one)
	if one != 1 {
		t.Fatalf("maximum-length SELECT = %d", one)
	}

	sqlitePath := runtimeSQLitePath(root, dataVersion)
	before := digestBytes(mustReadFile(t, sqlitePath))
	rows, writeErr := store.QueryContext(
		context.Background(),
		"WITH selected AS (SELECT subject_id FROM subject LIMIT 1) "+
			"DELETE FROM subject WHERE subject_id IN (SELECT subject_id FROM selected) RETURNING subject_id",
	)
	if rows != nil {
		for rows.Next() {
		}
		if rowsErr := rows.Err(); writeErr == nil {
			writeErr = rowsErr
		}
		rows.Close()
	}
	if writeErr == nil {
		t.Fatal("write-capable WITH escaped query_only")
	}
	if errors.Is(writeErr, ErrUnsafeQuery) {
		t.Fatalf("write-capable WITH did not reach the second gate: %v", writeErr)
	}
	if !strings.Contains(strings.ToLower(writeErr.Error()), "readonly") {
		t.Fatalf("write-capable WITH did not fail at a read-only gate: %v", writeErr)
	}
	if after := digestBytes(mustReadFile(t, sqlitePath)); after != before {
		t.Fatalf("write-capable WITH changed SQLite: %s -> %s", before, after)
	}
}

func TestRootBoundReadOnlyVFSPreventsWritesAndExternalAttach(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	store, err := LoadCandidate(context.Background(), root, dataVersion)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()

	connection, err := store.db.Conn(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	defer connection.Close()
	if _, err := connection.ExecContext(context.Background(), "PRAGMA query_only = 0"); err != nil {
		t.Fatalf("disable query_only for VFS defense test: %v", err)
	}
	var queryOnly int64
	if err := connection.QueryRowContext(context.Background(), "PRAGMA query_only").Scan(&queryOnly); err != nil {
		t.Fatal(err)
	}
	if queryOnly != 0 {
		t.Fatalf("query_only = %d, want 0 for VFS defense test", queryOnly)
	}

	sqlitePath := runtimeSQLitePath(root, dataVersion)
	before := digestBytes(mustReadFile(t, sqlitePath))
	if _, err := connection.ExecContext(
		context.Background(),
		"CREATE TABLE vfs_must_reject (id INTEGER)",
	); err == nil {
		t.Fatal("read-only VFS accepted a main database write")
	}

	externalPath := filepath.Join(t.TempDir(), "attached.sqlite")
	if _, err := connection.ExecContext(
		context.Background(),
		"ATTACH DATABASE ? AS external",
		externalPath,
	); err == nil {
		t.Fatal("read-only root-bound VFS attached an external database")
	}
	if _, err := os.Lstat(externalPath); !os.IsNotExist(err) {
		t.Fatalf("ATTACH created an external file: %v", err)
	}
	if after := digestBytes(mustReadFile(t, sqlitePath)); after != before {
		t.Fatalf("VFS escape attempt changed SQLite: %s -> %s", before, after)
	}
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		if _, err := os.Lstat(sqlitePath + suffix); !os.IsNotExist(err) {
			t.Fatalf("VFS escape attempt created sidecar %q: %v", suffix, err)
		}
	}
}

func TestDerivedSQLiteMutationsFailAtTheirFirstGate(t *testing.T) {
	tests := []struct {
		name     string
		mutation func(t *testing.T, sqlitePath string)
		expected Code
	}{
		{
			name: "required table missing",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(t, sqlitePath, "DROP TABLE subject_tag")
			},
			expected: CodeSQLiteRequiredObjectMissing,
		},
		{
			name: "required index missing",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(t, sqlitePath, "DROP INDEX idx_subject_tag_lookup")
			},
			expected: CodeSQLiteRequiredObjectMissing,
		},
		{
			name: "required definition weakened",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutations(
					t,
					sqlitePath,
					"PRAGMA writable_schema = ON",
					`UPDATE sqlite_schema
					    SET sql = replace(
							sql,
							'CHECK (nsfw IN (0, 1))',
							'CHECK (nsfw IN (0, 1, 2))'
						)
					  WHERE type = 'table' AND name = 'subject'`,
					"PRAGMA writable_schema = OFF",
				)
			},
			expected: CodeSQLiteRequiredObjectMissing,
		},
		{
			name: "extra explicit object",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(
					t,
					sqlitePath,
					"CREATE TABLE archive_extra_seal_probe (id INTEGER) STRICT",
				)
			},
			expected: CodeSQLiteRequiredObjectMissing,
		},
		{
			name: "embedded metadata mismatch",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(
					t,
					sqlitePath,
					"UPDATE archive_meta SET data_version = 'dv1-1111111111111111111111111111111111111111111111111111111111111111'",
				)
			},
			expected: CodeSQLiteDataVersionMismatch,
		},
		{
			name: "user version mismatch",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(t, sqlitePath, "PRAGMA user_version = 2")
			},
			expected: CodeSQLiteDataVersionMismatch,
		},
		{
			name: "foreign key violation",
			mutation: func(t *testing.T, sqlitePath string) {
				execSQLiteMutation(t, sqlitePath, "DELETE FROM person WHERE person_id = 100")
			},
			expected: CodeSQLiteFormatInvalid,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root, dataVersion := arrangeValidCandidate(t, false)
			sqlitePath := runtimeSQLitePath(root, dataVersion)
			test.mutation(t, sqlitePath)
			resignCandidate(t, root, dataVersion)
			_, err := LoadCandidate(context.Background(), root, dataVersion)
			requireCode(t, err, test.expected)
		})
	}
}

func TestManifestCountMutationFailsLast(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	manifestPath := runtimeManifestPath(root, dataVersion)
	var value manifest
	mustDecodeJSON(t, mustReadFile(t, manifestPath), &value)
	value.TableCounts["subject"]++
	writeManifest(t, manifestPath, value)

	_, err := LoadCandidate(context.Background(), root, dataVersion)
	requireCode(t, err, CodeSQLiteTableCountMismatch)
}

func TestUnsupportedRulePairFailsBeforeDataVersionAndSQLite(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*manifest)
	}{
		{
			name: "domain rules",
			mutate: func(value *manifest) {
				value.DomainRulesVersion = "domain-other-v1"
			},
		},
		{
			name: "cast rules",
			mutate: func(value *manifest) {
				value.CastRulesVersion = "cast-other-v1"
			},
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			root, dataVersion := arrangeValidCandidate(t, false)
			manifestPath := runtimeManifestPath(root, dataVersion)
			var value manifest
			mustDecodeJSON(t, mustReadFile(t, manifestPath), &value)
			test.mutate(&value)
			value.DataVersion = "dv1-" + strings.Repeat("0", 64)
			writeManifest(t, manifestPath, value)

			sqliteOpened := false
			store, err := loadCandidate(
				context.Background(),
				root,
				dataVersion,
				loadHooks{
					beforeSQLiteOpen: func() {
						sqliteOpened = true
					},
				},
			)
			if store != nil {
				store.Close()
				t.Fatal("unsupported rule pair returned a store")
			}
			requireCode(t, err, CodeArchiveVersionUnsupported)
			if sqliteOpened {
				t.Fatal("unsupported rule pair reached SQLite open")
			}
		})
	}
}

func TestSQLiteDigestMismatchPrecedesInvalidHeader(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	sqlitePath := runtimeSQLitePath(root, dataVersion)
	sqliteData := mustReadFile(t, sqlitePath)
	for index := range 16 {
		sqliteData[index] = 'x'
	}
	if err := os.WriteFile(sqlitePath, sqliteData, 0o644); err != nil {
		t.Fatal(err)
	}

	_, err := LoadCandidate(context.Background(), root, dataVersion)
	requireCode(t, err, CodeSQLiteDigestMismatch)
}

func TestPathReboundKeepsTheValidatedRootBoundInode(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	replacementRoot, replacementDataVersion := arrangeValidCandidate(t, false)
	if replacementDataVersion != dataVersion {
		t.Fatalf("replacement dataVersion = %q, want %q", replacementDataVersion, dataVersion)
	}
	execSQLiteMutation(
		t,
		runtimeSQLitePath(replacementRoot, dataVersion),
		"UPDATE subject SET name = 'replacement-root' WHERE subject_id = (SELECT MIN(subject_id) FROM subject)",
	)
	resignCandidate(t, replacementRoot, dataVersion)

	validatedPath := root + ".validated"
	t.Cleanup(func() {
		_ = os.RemoveAll(validatedPath)
	})
	store, err := loadCandidate(
		context.Background(),
		root,
		dataVersion,
		loadHooks{
			beforeSQLiteOpen: func() {
				if err := os.Rename(root, validatedPath); err != nil {
					t.Fatalf("rename validated root: %v", err)
				}
				if err := os.Rename(replacementRoot, root); err != nil {
					t.Fatalf("bind replacement root: %v", err)
				}
			},
		},
	)
	if err != nil {
		t.Fatalf("load root-bound candidate after pathname rebound: %v", err)
	}
	defer store.Close()

	var replacementRows int64
	queryOne(
		t,
		store,
		"SELECT COUNT(*) FROM subject WHERE name = 'replacement-root'",
		&replacementRows,
	)
	if replacementRows != 0 {
		t.Fatal("store opened replacement bytes through the rebound pathname")
	}
}

func TestEverySQLiteVFSOpenRequiresTheValidatedFileIdentity(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	sqlitePath := runtimeSQLitePath(root, dataVersion)
	approvedPath := sqlitePath + ".approved"
	replacementPath := sqlitePath + ".replacement"
	copyTestFile(t, sqlitePath, replacementPath)
	execSQLiteMutation(
		t,
		replacementPath,
		"UPDATE subject SET name = 'unvalidated-replacement' WHERE subject_id = (SELECT MIN(subject_id) FROM subject)",
	)
	approvedDigest := digestBytes(mustReadFile(t, sqlitePath))
	swapped := false
	t.Cleanup(func() {
		if !swapped {
			return
		}
		_ = os.Remove(sqlitePath)
		_ = os.Rename(approvedPath, sqlitePath)
	})

	store, err := loadCandidate(
		context.Background(),
		root,
		dataVersion,
		loadHooks{
			beforeSQLiteVFSOpen: func(openNumber int) {
				if openNumber != 2 {
					return
				}
				if err := os.Rename(sqlitePath, approvedPath); err != nil {
					t.Fatalf("park approved SQLite: %v", err)
				}
				if err := os.Rename(replacementPath, sqlitePath); err != nil {
					t.Fatalf("bind replacement SQLite: %v", err)
				}
				swapped = true
			},
			afterSQLiteVFSOpen: func(openNumber int) {
				if openNumber != 2 {
					return
				}
				if err := os.Rename(sqlitePath, replacementPath); err != nil {
					t.Fatalf("park replacement SQLite: %v", err)
				}
				if err := os.Rename(approvedPath, sqlitePath); err != nil {
					t.Fatalf("restore approved SQLite: %v", err)
				}
				swapped = false
			},
		},
	)
	if store != nil {
		store.Close()
		t.Fatal("a pooled connection accepted replacement SQLite bytes")
	}
	requireCode(t, err, CodeArchiveImmutableLayoutInvalid)
	if got := digestBytes(mustReadFile(t, sqlitePath)); got != approvedDigest {
		t.Fatalf("approved SQLite was not restored: %s -> %s", approvedDigest, got)
	}
}

func TestSQLiteIdentityChangeDuringValidationFailsClosed(t *testing.T) {
	root, dataVersion := arrangeValidCandidate(t, false)
	sqlitePath := runtimeSQLitePath(root, dataVersion)
	store, err := loadCandidate(
		context.Background(),
		root,
		dataVersion,
		loadHooks{
			beforeFinalFileCheck: func() {
				future := time.Now().Add(2 * time.Second)
				if err := os.Chtimes(sqlitePath, future, future); err != nil {
					t.Fatalf("change SQLite timestamp: %v", err)
				}
			},
		},
	)
	if store != nil {
		store.Close()
		t.Fatal("changed candidate returned a store")
	}
	requireCode(t, err, CodeArchiveImmutableLayoutInvalid)
}

func TestImmutableSQLiteDSNUsesOnlyApprovedOptions(t *testing.T) {
	const vfsName = "vfs-test-name"
	dsn := immutableSQLiteDSN(vfsName)
	parsed, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.Scheme != "file" || parsed.Opaque != sqliteFilename {
		t.Fatalf("DSN identity = scheme %q opaque %q path %q", parsed.Scheme, parsed.Opaque, parsed.Path)
	}
	query := parsed.Query()
	if query.Get("cache") != "private" ||
		query.Get("immutable") != "1" ||
		query.Get("mode") != "ro" ||
		query.Get("vfs") != vfsName {
		t.Fatalf("DSN options = %v", query)
	}
	if got := query["_pragma"]; strings.Join(got, "\x00") !=
		"busy_timeout(5000)\x00foreign_keys(1)\x00query_only(1)" {
		t.Fatalf("DSN pragmas = %v", got)
	}
	if len(query) != 5 || strings.Contains(dsn, "nolock") || strings.Contains(dsn, "shared") {
		t.Fatalf("DSN has unapproved options: %q", dsn)
	}
}

func execSQLiteMutation(t *testing.T, sqlitePath, statement string) {
	t.Helper()
	execSQLiteMutations(t, sqlitePath, statement)
}

func execSQLiteMutations(t *testing.T, sqlitePath string, statements ...string) {
	t.Helper()
	dsn := &url.URL{Scheme: "file", Path: sqlitePath}
	parameters := url.Values{}
	parameters.Set("mode", "rw")
	parameters.Set("_pragma", "foreign_keys(0)")
	dsn.RawQuery = parameters.Encode()
	database, err := sql.Open(sqliteDriverName, dsn.String())
	if err != nil {
		t.Fatal(err)
	}
	for _, statement := range statements {
		if _, err := database.ExecContext(context.Background(), statement); err != nil {
			database.Close()
			t.Fatalf("mutate SQLite: %v", err)
		}
	}
	if err := database.Close(); err != nil {
		t.Fatal(err)
	}
}

func resignCandidate(t *testing.T, root, dataVersion string) {
	t.Helper()
	manifestPath := runtimeManifestPath(root, dataVersion)
	var value manifest
	mustDecodeJSON(t, mustReadFile(t, manifestPath), &value)
	sqliteData := mustReadFile(t, runtimeSQLitePath(root, dataVersion))
	value.SQLiteSize = int64(len(sqliteData))
	value.SQLiteDigest = digestBytes(sqliteData)
	writeManifest(t, manifestPath, value)
}

func writeManifest(t *testing.T, path string, value manifest) {
	t.Helper()
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatal(err)
	}
}

package archive

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sync/atomic"
)

const (
	currentPointerFilename = "current.json"
	manifestFilename       = "manifest.json"
	versionsDirectory      = "versions"
)

type selectedFiles struct {
	root           *os.Root
	versionPath    string
	sqlitePath     string
	pointer        pointer
	manifest       manifest
	manifestDigest string
	sqliteDigest   string
	sqliteInfo     os.FileInfo
}

type validatedSQLiteFS struct {
	root     *os.Root
	expected os.FileInfo
	hooks    loadHooks

	openCount atomic.Int64
	invalid   atomic.Bool
}

func (filesystem *validatedSQLiteFS) Open(name string) (fs.File, error) {
	openNumber := int(filesystem.openCount.Add(1))
	if filesystem.hooks.beforeSQLiteVFSOpen != nil {
		filesystem.hooks.beforeSQLiteVFSOpen(openNumber)
	}

	before, beforeErr := filesystem.root.Lstat(name)
	if name != sqliteFilename ||
		beforeErr != nil ||
		before.Mode()&os.ModeSymlink != 0 ||
		!before.Mode().IsRegular() {
		filesystem.invalid.Store(true)
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrInvalid}
	}

	file, openErr := filesystem.root.Open(name)
	if filesystem.hooks.afterSQLiteVFSOpen != nil {
		filesystem.hooks.afterSQLiteVFSOpen(openNumber)
	}
	if openErr != nil {
		filesystem.invalid.Store(true)
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrInvalid}
	}

	opened, openedErr := file.Stat()
	after, afterErr := filesystem.root.Lstat(name)
	if openedErr != nil ||
		afterErr != nil ||
		after.Mode()&os.ModeSymlink != 0 ||
		!opened.Mode().IsRegular() ||
		!after.Mode().IsRegular() ||
		!sameFileSnapshot(filesystem.expected, before) ||
		!sameFileSnapshot(filesystem.expected, opened) ||
		!sameFileSnapshot(filesystem.expected, after) {
		filesystem.invalid.Store(true)
		_ = file.Close()
		return nil, &fs.PathError{Op: "open", Path: name, Err: fs.ErrInvalid}
	}
	return file, nil
}

func openArchiveRoot(ctx context.Context, rootPath string, hooks loadHooks) (*os.Root, error) {
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	if rootPath == "" || !filepath.IsAbs(rootPath) {
		return nil, outcome(CodeArchiveRootInvalid)
	}
	cleanRoot := filepath.Clean(rootPath)
	info, err := os.Lstat(cleanRoot)
	if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return nil, outcome(CodeArchiveRootInvalid)
	}
	if hooks.beforeArchiveRootOpen != nil {
		hooks.beforeArchiveRootOpen()
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, err
	}
	root, err := os.OpenRoot(cleanRoot)
	if err != nil {
		return nil, outcome(CodeArchiveRootInvalid)
	}
	opened, openedErr := root.Stat(".")
	current, currentErr := os.Lstat(cleanRoot)
	if openedErr != nil ||
		currentErr != nil ||
		current.Mode()&os.ModeSymlink != 0 ||
		!current.IsDir() ||
		!sameFileSnapshot(info, opened) ||
		!sameFileSnapshot(info, current) {
		_ = root.Close()
		return nil, outcome(CodeArchiveRootInvalid)
	}
	if err := contextOutcome(ctx); err != nil {
		_ = root.Close()
		return nil, err
	}
	return root, nil
}

func selectCurrentFiles(ctx context.Context, root *os.Root, hooks loadHooks) (selectedFiles, error) {
	pointerBytes, _, err := readRegularFile(ctx, root, currentPointerFilename, maxPointerBytes)
	if err != nil {
		return selectedFiles{}, err
	}
	pointerValue, err := decodePointer(pointerBytes)
	if err != nil {
		return selectedFiles{}, err
	}
	if pointerValue.PointerSchemaVersion != pointerSchemaVersion {
		return selectedFiles{}, outcome(CodeArchiveVersionUnsupported)
	}
	if hooks.afterPointerRead != nil {
		hooks.afterPointerRead()
	}
	files, err := selectCandidateFiles(
		ctx,
		root,
		pointerValue.DataVersion,
		pointerValue.ManifestDigest,
	)
	if err != nil {
		return selectedFiles{}, err
	}
	files.pointer = pointerValue
	return files, nil
}

func selectCandidateFiles(
	ctx context.Context,
	root *os.Root,
	dataVersion string,
	expectedManifestDigest string,
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

	manifestPath := path.Join(versionPath, manifestFilename)
	manifestBytes, _, err := readRegularFile(ctx, root, manifestPath, maxManifestBytes)
	if err != nil {
		return selectedFiles{}, err
	}
	manifestValue, err := decodeManifest(manifestBytes)
	if err != nil {
		return selectedFiles{}, err
	}
	if err := validateCompatibility(manifestValue); err != nil {
		return selectedFiles{}, err
	}
	if recomputeDataVersion(manifestValue) != manifestValue.DataVersion {
		return selectedFiles{}, outcome(CodeDataVersionMismatch)
	}
	if dataVersion != manifestValue.DataVersion {
		return selectedFiles{}, outcome(CodeSQLiteDataVersionMismatch)
	}
	manifestDigest := digestBytes(manifestBytes)
	if expectedManifestDigest != "" && manifestDigest != expectedManifestDigest {
		return selectedFiles{}, outcome(CodeSQLiteDataVersionMismatch)
	}

	sqlitePath := path.Join(versionPath, sqliteFilename)
	sqliteInfo, sqliteDigest, sqliteHeaderValid, err := inspectSQLiteFile(ctx, root, sqlitePath, manifestValue.SQLiteSize)
	if err != nil {
		return selectedFiles{}, err
	}
	if sqliteDigest != manifestValue.SQLiteDigest {
		return selectedFiles{}, outcome(CodeSQLiteDigestMismatch)
	}
	if !sqliteHeaderValid {
		return selectedFiles{}, outcome(CodeSQLiteFormatInvalid)
	}
	if err := rejectSidecars(root, sqlitePath); err != nil {
		return selectedFiles{}, err
	}

	return selectedFiles{
		root:           root,
		versionPath:    versionPath,
		sqlitePath:     sqlitePath,
		manifest:       manifestValue,
		manifestDigest: manifestDigest,
		sqliteDigest:   sqliteDigest,
		sqliteInfo:     sqliteInfo,
	}, nil
}

func requireDirectory(root *os.Root, name string) error {
	info, err := root.Lstat(name)
	if err != nil || info.Mode()&os.ModeSymlink != 0 || !info.IsDir() {
		return outcome(CodeArchiveFileInvalid)
	}
	return nil
}

func readRegularFile(ctx context.Context, root *os.Root, name string, limit int64) ([]byte, os.FileInfo, error) {
	before, err := root.Lstat(name)
	if err != nil || before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	file, err := root.Open(name)
	if err != nil {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	defer file.Close()

	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	if err := contextOutcome(ctx); err != nil {
		return nil, nil, err
	}
	data, err := io.ReadAll(io.LimitReader(file, limit+1))
	if err != nil || int64(len(data)) > limit {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	after, err := root.Lstat(name)
	if err != nil || after.Mode()&os.ModeSymlink != 0 || !after.Mode().IsRegular() ||
		!sameFileSnapshot(before, after) {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	return data, after, nil
}

func inspectSQLiteFile(
	ctx context.Context,
	root *os.Root,
	name string,
	expectedSize int64,
) (os.FileInfo, string, bool, error) {
	before, err := root.Lstat(name)
	if err != nil || before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
		return nil, "", false, outcome(CodeArchiveFileInvalid)
	}
	if before.Size() != expectedSize {
		return nil, "", false, outcome(CodeSQLiteFormatInvalid)
	}
	file, err := root.Open(name)
	if err != nil {
		return nil, "", false, outcome(CodeArchiveFileInvalid)
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return nil, "", false, outcome(CodeArchiveFileInvalid)
	}

	hasher := sha256.New()
	header := make([]byte, 16)
	total := int64(0)
	buffer := make([]byte, 64*1024)
	for {
		if err := contextOutcome(ctx); err != nil {
			return nil, "", false, err
		}
		count, readErr := file.Read(buffer)
		if count > 0 {
			if total < int64(len(header)) {
				copy(header[total:], buffer[:count])
			}
			total += int64(count)
			if _, err := hasher.Write(buffer[:count]); err != nil {
				return nil, "", false, outcome(CodeArchiveFileInvalid)
			}
		}
		if errors.Is(readErr, io.EOF) {
			break
		}
		if readErr != nil {
			return nil, "", false, outcome(CodeArchiveFileInvalid)
		}
	}
	if total != expectedSize {
		return nil, "", false, outcome(CodeSQLiteFormatInvalid)
	}
	after, err := root.Lstat(name)
	if err != nil || after.Mode()&os.ModeSymlink != 0 || !after.Mode().IsRegular() ||
		!sameFileSnapshot(before, after) {
		return nil, "", false, outcome(CodeArchiveFileInvalid)
	}
	return after, "sha256:" + hex.EncodeToString(hasher.Sum(nil)), string(header) == "SQLite format 3\x00", nil
}

func rejectSidecars(root *os.Root, sqlitePath string) error {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		_, err := root.Lstat(sqlitePath + suffix)
		if err == nil || !errors.Is(err, os.ErrNotExist) {
			return outcome(CodeArchiveImmutableLayoutInvalid)
		}
	}
	return nil
}

func verifySQLiteUnchanged(files selectedFiles) error {
	after, err := files.root.Lstat(files.sqlitePath)
	if err != nil || after.Mode()&os.ModeSymlink != 0 || !after.Mode().IsRegular() ||
		!sameFileSnapshot(files.sqliteInfo, after) {
		return outcome(CodeArchiveImmutableLayoutInvalid)
	}
	return rejectSidecars(files.root, files.sqlitePath)
}

func sameFileSnapshot(before, after os.FileInfo) bool {
	return os.SameFile(before, after) &&
		before.Size() == after.Size() &&
		before.ModTime().Equal(after.ModTime())
}

func contextOutcome(ctx context.Context) error {
	if ctx == nil || ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	return nil
}

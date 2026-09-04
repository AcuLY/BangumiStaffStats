package archive

import (
	"context"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sync/atomic"
)

const (
	currentPointerFilename = "current.json"
	versionsDirectory      = "versions"
)

type selectedFiles struct {
	root        *os.Root
	versionPath string
	sqliteInfo  os.FileInfo
}

type containedSQLiteFS struct {
	root     *os.Root
	expected os.FileInfo
	hooks    loadHooks

	openCount atomic.Int64
	invalid   atomic.Bool
}

func (filesystem *containedSQLiteFS) Open(name string) (fs.File, error) {
	openNumber := int(filesystem.openCount.Add(1))
	if filesystem.hooks.beforeSQLiteVFSOpen != nil {
		filesystem.hooks.beforeSQLiteVFSOpen(openNumber)
	}

	before, beforeErr := filesystem.root.Lstat(name)
	if name != sqliteFilename || beforeErr != nil ||
		before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() {
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
	if openedErr != nil || afterErr != nil ||
		after.Mode()&os.ModeSymlink != 0 || !opened.Mode().IsRegular() ||
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
	if openedErr != nil || currentErr != nil ||
		current.Mode()&os.ModeSymlink != 0 || !current.IsDir() ||
		!sameFileSnapshot(info, opened) || !sameFileSnapshot(info, current) {
		_ = root.Close()
		return nil, outcome(CodeArchiveRootInvalid)
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
	if hooks.afterPointerRead != nil {
		hooks.afterPointerRead()
	}
	return selectVersionFiles(ctx, root, pointerValue.DataVersion)
}

func selectVersionFiles(ctx context.Context, root *os.Root, dataVersion string) (selectedFiles, error) {
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
	return selectedFiles{root: root, versionPath: versionPath, sqliteInfo: sqliteInfo}, nil
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
	if err != nil || after.Mode()&os.ModeSymlink != 0 ||
		!after.Mode().IsRegular() || !sameFileSnapshot(before, after) {
		return nil, nil, outcome(CodeArchiveFileInvalid)
	}
	return data, after, nil
}

func rejectSidecars(root *os.Root, sqlitePath string) error {
	for _, suffix := range []string{"-wal", "-shm", "-journal"} {
		_, err := root.Lstat(sqlitePath + suffix)
		if err == nil || !os.IsNotExist(err) {
			return outcome(CodeArchiveImmutableLayoutInvalid)
		}
	}
	return nil
}

func sameFileSnapshot(before, after os.FileInfo) bool {
	return os.SameFile(before, after) && before.Size() == after.Size() &&
		before.ModTime().Equal(after.ModTime())
}

func contextOutcome(ctx context.Context) error {
	if ctx == nil || ctx.Err() != nil {
		return outcome(CodeArchiveContextCanceled)
	}
	return nil
}

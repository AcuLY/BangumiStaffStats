// Package archive loads and publishes immutable Archive snapshots.
package archive

import (
	"context"
	"os"
)

type loadHooks struct {
	afterPointerRead      func()
	beforeArchiveRootOpen func()
	beforeSQLiteOpen      func()
	beforeSQLiteVFSOpen   func(int)
	afterSQLiteVFSOpen    func(int)
	beforeFinalFileCheck  func()
}

// LoadCandidate validates one fixed inactive version without reading or
// publishing current.json. The caller owns the returned store.
func LoadCandidate(ctx context.Context, rootPath, dataVersion string) (*Store, error) {
	return loadCandidate(ctx, rootPath, dataVersion, loadHooks{})
}

func loadCandidate(
	ctx context.Context,
	rootPath string,
	dataVersion string,
	hooks loadHooks,
) (*Store, error) {
	root, err := openArchiveRoot(ctx, rootPath, hooks)
	if err != nil {
		return nil, err
	}
	return loadFromRoot(ctx, root, dataVersion, false, hooks)
}

func loadCurrentCandidate(ctx context.Context, rootPath string, hooks loadHooks) (*Store, error) {
	root, err := openArchiveRoot(ctx, rootPath, hooks)
	if err != nil {
		return nil, err
	}
	return loadFromRoot(ctx, root, "", true, hooks)
}

func loadFromRoot(
	ctx context.Context,
	root *os.Root,
	dataVersion string,
	useCurrent bool,
	hooks loadHooks,
) (*Store, error) {
	var (
		files selectedFiles
		err   error
	)
	if useCurrent {
		files, err = selectCurrentFiles(ctx, root, hooks)
	} else {
		files, err = selectCandidateFiles(ctx, root, dataVersion, "")
	}
	if err != nil {
		_ = root.Close()
		return nil, err
	}

	// openValidatedStore takes ownership of root on both success and failure so
	// SQLite can remain bound to the already validated directory handle.
	return openValidatedStore(ctx, files, hooks)
}

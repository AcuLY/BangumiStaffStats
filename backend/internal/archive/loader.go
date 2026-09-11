// Package archive directly opens and publishes immutable Archive snapshots.
package archive

import "context"

type loadHooks struct {
	afterPointerRead      func()
	beforeArchiveRootOpen func()
	beforeSQLiteOpen      func()
	beforeSQLiteVFSOpen   func(int)
	afterSQLiteVFSOpen    func(int)
}

// OpenVersion directly opens one fixed version without reading or publishing
// current.json. The caller owns the returned Store.
func OpenVersion(ctx context.Context, rootPath, dataVersion string) (*Store, error) {
	return openVersionStore(ctx, rootPath, dataVersion, loadHooks{})
}

func openVersionStore(
	ctx context.Context,
	rootPath string,
	dataVersion string,
	hooks loadHooks,
) (*Store, error) {
	root, err := openArchiveRoot(ctx, rootPath, hooks)
	if err != nil {
		return nil, err
	}
	files, err := selectVersionFiles(ctx, root, dataVersion)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	return openStore(ctx, files, hooks)
}

func openCurrentStore(ctx context.Context, rootPath string, hooks loadHooks) (*Store, error) {
	root, err := openArchiveRoot(ctx, rootPath, hooks)
	if err != nil {
		return nil, err
	}
	files, err := selectCurrentFiles(ctx, root, hooks)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	return openStore(ctx, files, hooks)
}

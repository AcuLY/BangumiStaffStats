package archivebuild

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// RunOnce acquires one exact input set, builds an inactive immutable candidate,
// and atomically publishes its version directory. It never reads or writes the
// current pointer and never opens the candidate as an application Store.
func RunOnce(ctx context.Context, rawConfig RunConfig) (RunResult, error) {
	config, err := rawConfig.validate()
	if err != nil {
		return RunResult{}, err
	}
	root, versionsRoot, err := validateOutputRoot(config.OutputRoot)
	if err != nil {
		return RunResult{}, err
	}
	stage, err := os.MkdirTemp(root, ".bgmss-stage-")
	if err != nil {
		return RunResult{}, failure("STAGING_CREATE_FAILED", err)
	}
	stageOwned := true
	defer func() {
		if stageOwned {
			_ = removeOwnedStage(stage, root)
		}
	}()
	if err := os.Mkdir(filepath.Join(stage, "versions"), 0o750); err != nil {
		return RunResult{}, failure("STAGING_CREATE_FAILED", err)
	}
	provider := config.Provider
	if provider == nil {
		network, err := NewNetworkProvider(config.HTTPSProxy)
		if err != nil {
			return RunResult{}, err
		}
		provider = network
	}
	acquired, err := provider.Acquire(ctx, stage, config.CommonCommit)
	if err != nil {
		return RunResult{}, err
	}
	if acquired.CommonCommit != config.CommonCommit || !validDigest(acquired.ArchiveDigest) ||
		!validDigest(acquired.CommonDigest) || len(acquired.Sources) != len(SourceNames) {
		return RunResult{}, failure("ACQUIRED_INPUT_INVALID", nil)
	}
	embedded, err := LoadEmbeddedInputs()
	if err != nil {
		return RunResult{}, err
	}
	identity := BuildIdentity{
		ArchiveRelease:        acquired.ArchiveRelease,
		ArchiveDigest:         acquired.ArchiveDigest,
		CommonCommit:          acquired.CommonCommit,
		CommonDigest:          acquired.CommonDigest,
		ManifestSchemaVersion: ManifestSchemaVersion,
		SQLiteSchemaVersion:   SQLiteSchemaVersion,
		SchemaSQLDigest:       embedded.SchemaSQLDigest,
		DomainRulesVersion:    DomainRulesVersion,
		CastRulesVersion:      CastRulesVersion,
		CatalogConfigDigest:   embedded.CatalogConfigDigest,
	}
	version, err := DataVersion(identity)
	if err != nil {
		return RunResult{}, err
	}
	destination := filepath.Join(versionsRoot, version)
	if _, err := os.Lstat(destination); err == nil {
		return inspectExistingVersion(destination, version)
	} else if !os.IsNotExist(err) {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	candidate := filepath.Join(stage, "versions", version)
	if err := os.Mkdir(candidate, 0o750); err != nil {
		return RunResult{}, failure("STAGING_CREATE_FAILED", err)
	}
	build, err := BuildDatabase(ctx, BuildRequest{
		Destination:  filepath.Join(candidate, SQLiteFilename),
		Sources:      acquired.Sources,
		CommonBytes:  acquired.CommonBytes,
		CatalogBytes: embedded.CatalogConfig,
		SchemaSQL:    embedded.SchemaSQL,
		Identity:     identity,
	})
	if err != nil {
		return RunResult{}, err
	}
	manifest, manifestDigest, err := finalizeManifest(ctx, finalizeManifestRequest{
		Destination: filepath.Join(candidate, ManifestFilename), Identity: identity,
		GeneratedAt: config.GeneratedAt, GeneratorVersion: config.GeneratorVersion,
		Acquired: acquired, Build: build,
	})
	if err != nil {
		return RunResult{}, err
	}
	entries, err := os.ReadDir(candidate)
	if err != nil || len(entries) != 2 || entries[0].Name() != SQLiteFilename || entries[1].Name() != ManifestFilename {
		// ReadDir is lexically sorted: bangumi.sqlite precedes manifest.json.
		return RunResult{}, failure("CANDIDATE_LAYOUT_INVALID", err)
	}
	for _, name := range []string{"download", "sources"} {
		work := filepath.Join(stage, name)
		if _, err := os.Lstat(work); err == nil {
			if err := os.RemoveAll(work); err != nil {
				return RunResult{}, failure("STAGING_CLEANUP_FAILED", err)
			}
		} else if !os.IsNotExist(err) {
			return RunResult{}, failure("STAGING_CLEANUP_FAILED", err)
		}
	}
	if err := contextError(ctx); err != nil {
		return RunResult{}, err
	}
	if _, err := os.Lstat(destination); err == nil {
		return RunResult{}, failure("PUBLICATION_COLLISION", nil)
	} else if !os.IsNotExist(err) {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	if err := os.Rename(candidate, destination); err != nil {
		return RunResult{}, failure("PUBLICATION_FAILED", err)
	}
	return RunResult{Status: StatusPublished, DataVersion: version, ManifestDigest: manifestDigest, SQLiteDigest: manifest.SQLiteDigest, VersionRoot: destination, QualityReport: build.QualityReport}, nil
}

func validateOutputRoot(value string) (string, string, error) {
	metadata, err := os.Lstat(value)
	if err != nil || !metadata.IsDir() || metadata.Mode()&os.ModeSymlink != 0 {
		return "", "", failure("OUTPUT_ROOT_INVALID", err)
	}
	resolved, err := filepath.EvalSymlinks(value)
	if err != nil || resolved != value {
		return "", "", failure("OUTPUT_ROOT_INVALID", err)
	}
	versions := filepath.Join(value, "versions")
	if err := os.Mkdir(versions, 0o750); err != nil && !os.IsExist(err) {
		return "", "", failure("OUTPUT_ROOT_INVALID", err)
	}
	versionInfo, err := os.Lstat(versions)
	if err != nil || !versionInfo.IsDir() || versionInfo.Mode()&os.ModeSymlink != 0 {
		return "", "", failure("OUTPUT_ROOT_INVALID", err)
	}
	return value, versions, nil
}

func removeOwnedStage(stage, root string) error {
	cleanStage := filepath.Clean(stage)
	if filepath.Dir(cleanStage) != root || !strings.HasPrefix(filepath.Base(cleanStage), ".bgmss-stage-") {
		return failure("STAGING_CLEANUP_FAILED", nil)
	}
	if err := os.RemoveAll(cleanStage); err != nil {
		return failure("STAGING_CLEANUP_FAILED", err)
	}
	return nil
}

func inspectExistingVersion(root, version string) (RunResult, error) {
	metadata, err := os.Lstat(root)
	if err != nil || !metadata.IsDir() || metadata.Mode()&os.ModeSymlink != 0 {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	entries, err := os.ReadDir(root)
	if err != nil || len(entries) != 2 {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	for _, entry := range entries {
		if entry.Name() != SQLiteFilename && entry.Name() != ManifestFilename {
			return RunResult{}, failure("PUBLICATION_COLLISION", nil)
		}
		info, err := entry.Info()
		if err != nil || !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
			return RunResult{}, failure("PUBLICATION_COLLISION", err)
		}
	}
	manifestBytes, err := os.ReadFile(filepath.Join(root, ManifestFilename))
	if err != nil || len(manifestBytes) > 4*1024*1024 {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	manifest, err := decodeManifest(manifestBytes)
	if err != nil || manifest.DataVersion != version {
		return RunResult{}, failure("PUBLICATION_COLLISION", err)
	}
	return RunResult{Status: StatusNoChange, DataVersion: version, ManifestDigest: digestBytes(manifestBytes), SQLiteDigest: manifest.SQLiteDigest, VersionRoot: root}, nil
}

func (r RunResult) String() string {
	return fmt.Sprintf("%s:%s", r.Status, r.DataVersion)
}

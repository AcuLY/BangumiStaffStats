package app

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/archivebuild"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

const embeddedBuilderVersion = "backend-go-v1"

var (
	archiveVersionName = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	archiveDigestName  = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
)

type embeddedArchiveUpdater struct {
	root string
	run  func(context.Context, archivebuild.RunConfig) (archivebuild.RunResult, error)
}

// NewEmbeddedArchiveUpdater bridges the app scheduler to the Go builder.
func NewEmbeddedArchiveUpdater(root string) ArchiveUpdateRunner {
	return &embeddedArchiveUpdater{root: root, run: archivebuild.RunOnce}
}

func (updater *embeddedArchiveUpdater) RunOnce(
	ctx context.Context,
	activate ArchiveActivator,
) (ArchiveUpdateResult, error) {
	if updater == nil || updater.run == nil || ctx == nil || activate == nil {
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseFreshness},
			errors.New("app: invalid embedded Archive updater")
	}
	result, err := updater.run(ctx, archivebuild.RunConfig{
		OutputRoot:       updater.root,
		GeneratorVersion: embeddedBuilderVersion,
	})
	if err != nil {
		return ArchiveUpdateResult{Phase: buildFailurePhase(err)}, err
	}
	if result.Status == archivebuild.StatusNoChange {
		current, readErr := readCurrentDataVersion(updater.root)
		if readErr != nil && !os.IsNotExist(readErr) {
			return ArchiveUpdateResult{Phase: observability.UpdatePhaseFreshness}, readErr
		}
		if current == result.DataVersion {
			if err := cleanupArchiveVersions(ctx, updater.root, result.DataVersion); err != nil {
				return ArchiveUpdateResult{Phase: observability.UpdatePhaseCleanup}, err
			}
			return ArchiveUpdateResult{
				Status: observability.UpdateStatusNoChange,
				Phase:  observability.UpdatePhaseCleanup,
			}, nil
		}
	}
	if result.Status != archivebuild.StatusPublished &&
		result.Status != archivebuild.StatusNoChange {
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseBuild},
			errors.New("app: invalid embedded builder result")
	}

	candidate, err := archive.OpenVersion(ctx, updater.root, result.DataVersion)
	if err != nil {
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseCandidateOpen}, err
	}
	pointer, err := prepareCurrentPointer(
		updater.root,
		result.DataVersion,
		result.ManifestDigest,
	)
	if err != nil {
		_ = candidate.Close()
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseActivation}, err
	}
	defer pointer.Discard()
	err = activate(ctx, ArchiveActivation{
		Candidate:       candidate,
		CommitPointer:   pointer.Commit,
		RollbackPointer: pointer.Rollback,
		Cleanup: func(cleanupContext context.Context) error {
			return cleanupArchiveVersions(cleanupContext, updater.root, result.DataVersion)
		},
	})
	if err != nil {
		return ArchiveUpdateResult{Phase: observability.UpdatePhaseActivation}, err
	}
	return ArchiveUpdateResult{
		Status: observability.UpdateStatusActivated,
		Phase:  observability.UpdatePhaseCleanup,
	}, nil
}

func buildFailurePhase(err error) observability.UpdatePhase {
	code := archivebuild.ErrorCode(err)
	if strings.HasPrefix(code, "ARCHIVE") || strings.HasPrefix(code, "COMMON") {
		return observability.UpdatePhaseAcquisition
	}
	return observability.UpdatePhaseBuild
}

type pointerDocument struct {
	PointerSchemaVersion int    `json:"pointerSchemaVersion"`
	DataVersion          string `json:"dataVersion"`
	ManifestDigest       string `json:"manifestDigest"`
}

func readCurrentDataVersion(root string) (string, error) {
	data, err := os.ReadFile(filepath.Join(root, "current.json"))
	if err != nil {
		return "", err
	}
	decoder := json.NewDecoder(strings.NewReader(string(data)))
	decoder.DisallowUnknownFields()
	var document pointerDocument
	if err := decoder.Decode(&document); err != nil ||
		document.PointerSchemaVersion != 1 ||
		!archiveVersionName.MatchString(document.DataVersion) ||
		!archiveDigestName.MatchString(document.ManifestDigest) {
		return "", errors.New("app: invalid current Archive pointer")
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return "", errors.New("app: invalid current Archive pointer")
	}
	return document.DataVersion, nil
}

type preparedPointer struct {
	current   string
	temporary string
	previous  []byte
	hadOld    bool
}

func prepareCurrentPointer(root, dataVersion, manifestDigest string) (*preparedPointer, error) {
	if !archiveVersionName.MatchString(dataVersion) || !archiveDigestName.MatchString(manifestDigest) {
		return nil, errors.New("app: invalid Archive pointer identity")
	}
	current := filepath.Join(root, "current.json")
	previous, err := os.ReadFile(current)
	hadOld := err == nil
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("read current Archive pointer: %w", err)
	}
	data, err := json.Marshal(pointerDocument{
		PointerSchemaVersion: 1,
		DataVersion:          dataVersion,
		ManifestDigest:       manifestDigest,
	})
	if err != nil {
		return nil, fmt.Errorf("encode current Archive pointer: %w", err)
	}
	data = append(data, '\n')
	file, err := os.CreateTemp(root, ".current-pointer-")
	if err != nil {
		return nil, fmt.Errorf("create current Archive pointer: %w", err)
	}
	temporary := file.Name()
	if chmodErr := file.Chmod(0o640); chmodErr != nil {
		_ = file.Close()
		_ = os.Remove(temporary)
		return nil, fmt.Errorf("protect current Archive pointer: %w", chmodErr)
	}
	_, writeErr := file.Write(data)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	if closeErr := file.Close(); writeErr == nil {
		writeErr = closeErr
	}
	if writeErr != nil {
		_ = os.Remove(temporary)
		return nil, fmt.Errorf("write current Archive pointer: %w", writeErr)
	}
	return &preparedPointer{
		current: current, temporary: temporary, previous: previous, hadOld: hadOld,
	}, nil
}

func (pointer *preparedPointer) Commit(context.Context) error {
	if pointer == nil || pointer.temporary == "" {
		return errors.New("app: invalid prepared Archive pointer")
	}
	if err := os.Rename(pointer.temporary, pointer.current); err != nil {
		return fmt.Errorf("activate current Archive pointer: %w", err)
	}
	pointer.temporary = ""
	return nil
}

func (pointer *preparedPointer) Rollback(context.Context) error {
	if pointer == nil {
		return errors.New("app: invalid prepared Archive pointer")
	}
	if !pointer.hadOld {
		if err := os.Remove(pointer.current); err != nil && !os.IsNotExist(err) {
			return fmt.Errorf("remove current Archive pointer: %w", err)
		}
		return nil
	}
	file, err := os.CreateTemp(filepath.Dir(pointer.current), ".rollback-pointer-")
	if err != nil {
		return fmt.Errorf("create rollback Archive pointer: %w", err)
	}
	temporary := file.Name()
	if chmodErr := file.Chmod(0o640); chmodErr != nil {
		_ = file.Close()
		_ = os.Remove(temporary)
		return chmodErr
	}
	_, writeErr := file.Write(pointer.previous)
	if writeErr == nil {
		writeErr = file.Sync()
	}
	if closeErr := file.Close(); writeErr == nil {
		writeErr = closeErr
	}
	if writeErr == nil {
		writeErr = os.Rename(temporary, pointer.current)
	}
	if writeErr != nil {
		_ = os.Remove(temporary)
		return fmt.Errorf("restore current Archive pointer: %w", writeErr)
	}
	return nil
}

func (pointer *preparedPointer) Discard() {
	if pointer != nil && pointer.temporary != "" {
		_ = os.Remove(pointer.temporary)
		pointer.temporary = ""
	}
}

func cleanupArchiveVersions(ctx context.Context, root, keep string) error {
	if ctx == nil || !archiveVersionName.MatchString(keep) {
		return errors.New("app: invalid Archive cleanup")
	}
	versionsRoot := filepath.Join(root, "versions")
	entries, err := os.ReadDir(versionsRoot)
	if err != nil {
		return fmt.Errorf("read Archive versions: %w", err)
	}
	targets := make([]string, 0, len(entries))
	foundKeep := false
	for _, entry := range entries {
		if err := context.Cause(ctx); err != nil {
			return err
		}
		name := entry.Name()
		if !archiveVersionName.MatchString(name) || entry.Type()&os.ModeSymlink != 0 || !entry.IsDir() {
			return fmt.Errorf("app: unsafe Archive version entry %q", name)
		}
		path := filepath.Join(versionsRoot, name)
		resolved, err := filepath.EvalSymlinks(path)
		if err != nil || resolved != path || filepath.Dir(resolved) != versionsRoot {
			return fmt.Errorf("app: unsafe Archive version path %q", name)
		}
		if name == keep {
			foundKeep = true
		} else {
			targets = append(targets, path)
		}
	}
	if !foundKeep {
		return errors.New("app: current Archive version is absent")
	}
	for _, target := range targets {
		if err := context.Cause(ctx); err != nil {
			return err
		}
		if err := os.RemoveAll(target); err != nil {
			return fmt.Errorf("remove old Archive version: %w", err)
		}
	}
	return nil
}

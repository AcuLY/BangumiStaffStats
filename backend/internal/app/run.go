// Package app assembles the backend process.
package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
)

const readinessQuery = "SELECT data_version FROM archive_meta WHERE singleton = 1"

var errReadinessProbe = errors.New("app: Archive readiness probe failed")

// Run listens on address and serves until ctx is cancelled or serving fails.
func Run(ctx context.Context, address, archiveRoot string) error {
	if ctx == nil {
		return fmt.Errorf("run: nil context")
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %q: %w", address, err)
	}
	defer listener.Close()

	return RunListener(ctx, listener, archiveRoot)
}

// RunListener loads one Archive and serves the approved runtime and image
// routes on a caller-supplied listener.
func RunListener(ctx context.Context, listener net.Listener, archiveRoot string) error {
	runtimeObservability, err := httpapi.NewRuntimeObservability(os.Stderr)
	if err != nil {
		return fmt.Errorf("create runtime observability: %w", err)
	}
	return runListener(ctx, listener, archiveRoot, runDependencies{
		archive: new(archive.State),
		runtime: runtimeObservability,
		server: func(handler http.Handler) servingRuntime {
			return httpapi.NewServer(handler)
		},
	})
}

type archiveRuntime interface {
	LoadCurrent(context.Context, string) error
	Current() (*archive.Store, bool)
	Close() error
}

type servingRuntime interface {
	Serve(context.Context, net.Listener) error
}

type runDependencies struct {
	archive archiveRuntime
	runtime *httpapi.RuntimeObservability
	server  func(http.Handler) servingRuntime
}

func runListener(
	ctx context.Context,
	listener net.Listener,
	archiveRoot string,
	dependencies runDependencies,
) error {
	if ctx == nil {
		return fmt.Errorf("run listener: nil context")
	}
	if dependencies.archive == nil || dependencies.runtime == nil || dependencies.server == nil {
		return fmt.Errorf("run listener: incomplete dependencies")
	}

	loadErr := dependencies.archive.LoadCurrent(ctx, archiveRoot)
	if loadErr != nil {
		eventErr := dependencies.runtime.EmitArchiveLoadFailed(archiveEventCode(loadErr))
		if eventErr != nil {
			closeErr := dependencies.archive.Close()
			return errors.Join(
				wrapError("emit Archive load failure", eventErr),
				wrapError("close archive", closeErr),
			)
		}
		if ctx.Err() != nil {
			closeErr := dependencies.archive.Close()
			return cancellationResult(
				ctx.Err(),
				wrapError("close archive", closeErr),
			)
		}
		_ = dependencies.runtime.SetReadiness(false, "")
		return serveRuntime(ctx, listener, dependencies, nil)
	}

	store, ready := dependencies.archive.Current()
	if !ready || store == nil {
		eventErr := dependencies.runtime.EmitArchiveLoadFailed("INTERNAL_ERROR")
		if eventErr != nil {
			closeErr := dependencies.archive.Close()
			return errors.Join(
				wrapError("emit Archive load failure", eventErr),
				wrapError("close archive", closeErr),
			)
		}
		_ = dependencies.runtime.SetReadiness(false, "")
		return serveRuntime(ctx, listener, dependencies, nil)
	}

	probe := readinessProbe(dependencies.archive)
	probeContext, cancel := context.WithTimeout(ctx, time.Second)
	dataVersion, probeErr := probe(probeContext)
	cancel()
	if ctx.Err() != nil {
		closeErr := dependencies.archive.Close()
		return cancellationResult(ctx.Err(), wrapError("close archive", closeErr))
	}
	if probeErr != nil {
		_ = dependencies.runtime.SetReadiness(false, "")
		return serveRuntime(ctx, listener, dependencies, probe)
	}
	if err := dependencies.runtime.SetReadiness(true, dataVersion); err != nil {
		eventErr := dependencies.runtime.EmitArchiveLoadFailed("INTERNAL_ERROR")
		if eventErr != nil {
			closeErr := dependencies.archive.Close()
			return errors.Join(
				wrapError("emit Archive load failure", eventErr),
				wrapError("close archive", closeErr),
			)
		}
		_ = dependencies.runtime.SetReadiness(false, "")
		return serveRuntime(ctx, listener, dependencies, nil)
	}
	return serveRuntime(ctx, listener, dependencies, probe)
}

func serveRuntime(
	ctx context.Context,
	listener net.Listener,
	dependencies runDependencies,
	probe httpapi.ReadinessProbe,
) error {
	handler := dependencies.runtime.HandlerWithCatalog(
		probe,
		currentCatalogStore(dependencies.archive),
	)
	server := dependencies.server(handler)
	if server == nil {
		dependencies.runtime.SetLive(false)
		_ = dependencies.runtime.SetReadiness(false, "")
		closeErr := dependencies.archive.Close()
		return errors.Join(
			errors.New("serve api: nil server"),
			wrapError("close archive", closeErr),
		)
	}
	dependencies.runtime.SetLive(true)
	serveErr := server.Serve(ctx, listener)
	dependencies.runtime.SetLive(false)
	_ = dependencies.runtime.SetReadiness(false, "")
	closeErr := dependencies.archive.Close()

	if serveErr != nil {
		serveErr = fmt.Errorf("serve api: %w", serveErr)
	}
	if closeErr != nil {
		closeErr = fmt.Errorf("close archive: %w", closeErr)
	}
	return errors.Join(serveErr, closeErr)
}

func currentCatalogStore(state archiveRuntime) httpapi.CatalogStoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
}

func readinessProbe(state archiveRuntime) httpapi.ReadinessProbe {
	return func(ctx context.Context) (string, error) {
		store, ready := state.Current()
		if !ready || store == nil {
			return "", errReadinessProbe
		}
		identity := store.Identity()
		rows, err := store.QueryContext(ctx, readinessQuery)
		if err != nil {
			return "", errReadinessProbe
		}
		defer rows.Close()
		if !rows.Next() {
			return "", errReadinessProbe
		}
		var dataVersion string
		if err := rows.Scan(&dataVersion); err != nil {
			return "", errReadinessProbe
		}
		if rows.Next() {
			return "", errReadinessProbe
		}
		if err := rows.Err(); err != nil {
			return "", errReadinessProbe
		}
		if dataVersion != identity.DataVersion {
			return "", errReadinessProbe
		}
		if err := rows.Close(); err != nil {
			return "", errReadinessProbe
		}
		return dataVersion, nil
	}
}

func archiveEventCode(err error) string {
	if code, ok := archive.ErrorCode(err); ok {
		return string(code)
	}
	return "INTERNAL_ERROR"
}

func wrapError(operation string, err error) error {
	if err == nil {
		return nil
	}
	return fmt.Errorf("%s: %w", operation, err)
}

func cancellationResult(cancellation error, failures ...error) error {
	if failure := errors.Join(failures...); failure != nil {
		return failure
	}
	return cancellation
}

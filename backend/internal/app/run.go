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
	"github.com/AcuLY/BangumiStaffStats/backend/internal/candidates"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/costar"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/partners"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/persondetail"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/publiccollection"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/ranking"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

const readinessQuery = "SELECT data_version FROM archive_meta WHERE singleton = 1"

var errReadinessProbe = errors.New("app: Archive readiness probe failed")

// RunOptions contains explicit optional process inputs.
type RunOptions struct {
	UpdateStatusPath string
	ImageHTTPSProxy  *string
}

// Run listens on address and serves until ctx is cancelled or serving fails.
func Run(ctx context.Context, address, archiveRoot string) error {
	return RunWithOptions(ctx, address, archiveRoot, RunOptions{})
}

// RunWithOptions preserves Run semantics while admitting explicit optional
// process configuration.
func RunWithOptions(
	ctx context.Context,
	address string,
	archiveRoot string,
	options RunOptions,
) error {
	if ctx == nil {
		return fmt.Errorf("run: nil context")
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %q: %w", address, err)
	}
	defer listener.Close()

	return RunListenerWithOptions(ctx, listener, archiveRoot, options)
}

// RunListener loads one Archive and serves the approved runtime and image
// routes on a caller-supplied listener.
func RunListener(ctx context.Context, listener net.Listener, archiveRoot string) error {
	return RunListenerWithOptions(
		ctx,
		listener,
		archiveRoot,
		RunOptions{},
	)
}

// RunListenerWithOptions validates optional process configuration before
// loading the Archive or serving.
func RunListenerWithOptions(
	ctx context.Context,
	listener net.Listener,
	archiveRoot string,
	options RunOptions,
) error {
	runtimeObservability, err := httpapi.NewRuntimeObservabilityWithImageHTTPSProxy(
		os.Stderr,
		options.ImageHTTPSProxy,
	)
	if err != nil {
		return fmt.Errorf("create runtime observability: %w", err)
	}
	if options.UpdateStatusPath != "" {
		if err := runtimeObservability.SetUpdateStatusPath(
			options.UpdateStatusPath,
		); err != nil {
			return fmt.Errorf("configure update status: %w", err)
		}
	}
	collectionSource := publiccollection.New()
	return runListener(ctx, listener, archiveRoot, runDependencies{
		archive:     new(archive.State),
		collections: collectionSource,
		runtime:     runtimeObservability,
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

type collectionProvider interface {
	Fetch(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error)
}

type runDependencies struct {
	archive     archiveRuntime
	collections collectionProvider
	runtime     *httpapi.RuntimeObservability
	server      func(http.Handler) servingRuntime
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
	if dependencies.archive == nil ||
		dependencies.collections == nil ||
		dependencies.runtime == nil ||
		dependencies.server == nil {
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
	services, err := newQueryServices(
		dependencies.archive,
		dependencies.collections,
	)
	if err != nil {
		dependencies.runtime.SetLive(false)
		_ = dependencies.runtime.SetReadiness(false, "")
		closeErr := dependencies.archive.Close()
		return errors.Join(err, wrapError("close archive", closeErr))
	}
	if err := dependencies.runtime.SetRuntimeStatsProvider(
		queryRuntimeStatsProvider(services.runtime),
	); err != nil {
		dependencies.runtime.SetLive(false)
		_ = dependencies.runtime.SetReadiness(false, "")
		closeErr := dependencies.archive.Close()
		return errors.Join(
			fmt.Errorf("configure query runtime stats: %w", err),
			wrapError("close archive", closeErr),
		)
	}
	handler := dependencies.runtime.HandlerWithCoStarDependencies(
		probe,
		currentCatalogStore(dependencies.archive),
		services.rankings,
		services.candidates,
		services.personDetail,
		services.partners,
		services.coStar,
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

type queryServices struct {
	runtime      *runtimecache.QueryRuntime
	rankings     *ranking.Service
	candidates   *candidates.Service
	personDetail *persondetail.Service
	partners     *partners.Service
	coStar       *costar.Service
}

func newQueryServices(
	archiveState archiveRuntime,
	collections collectionProvider,
) (queryServices, error) {
	if archiveState == nil || collections == nil {
		return queryServices{}, errors.New("create query services: incomplete dependencies")
	}
	bindings, err := queryResultBindings()
	if err != nil {
		return queryServices{}, err
	}
	queryRuntime, err := runtimecache.NewQueryRuntime(
		runtimecache.DefaultQueryRuntimeConfig(),
		bindings...,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create process query runtime: %w", err)
	}
	rankings, err := ranking.NewServiceWithRuntime(
		currentRankingStore(archiveState),
		collections,
		queryRuntime,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create rankings service: %w", err)
	}
	candidateService, err := candidates.NewServiceWithRuntime(
		currentCandidatesStore(archiveState),
		collections,
		queryRuntime,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create candidates service: %w", err)
	}
	personDetailService, err := persondetail.NewServiceWithRuntime(
		currentPersonDetailStore(archiveState),
		collections,
		queryRuntime,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create person detail service: %w", err)
	}
	partnersService, err := partners.NewServiceWithRuntime(
		currentPartnersStore(archiveState),
		collections,
		queryRuntime,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create partners service: %w", err)
	}
	coStarService, err := costar.NewServiceWithRuntime(
		currentCoStarStore(archiveState),
		collections,
		queryRuntime,
	)
	if err != nil {
		return queryServices{}, fmt.Errorf("create co-star service: %w", err)
	}
	return queryServices{
		runtime:      queryRuntime,
		rankings:     rankings,
		candidates:   candidateService,
		personDetail: personDetailService,
		partners:     partnersService,
		coStar:       coStarService,
	}, nil
}

func queryRuntimeStatsProvider(
	queryRuntime *runtimecache.QueryRuntime,
) observability.RuntimeStatsProvider {
	return func() (observability.RuntimeStats, error) {
		stats := queryRuntime.Stats()
		return observability.RuntimeStats{
			Executor: observability.ExecutorStats{
				Running:  stats.Executor.Running,
				Queued:   stats.Executor.Queued,
				Started:  stats.Executor.Started,
				Rejected: stats.Executor.Rejected,
			},
			CollectionPositive: mapCacheStats(
				stats.CollectionPositive,
			),
			CollectionNegative: mapCacheStats(
				stats.CollectionNegative,
			),
			Result: mapCacheStats(stats.Result),
		}, nil
	}
}

func mapCacheStats(stats runtimecache.LRUStats) observability.CacheStats {
	return observability.CacheStats{
		Hits:         stats.Hits,
		Misses:       stats.Misses,
		Publications: stats.Publications,
		Replacements: stats.Replacements,
		Evictions:    stats.Evictions,
		Oversize:     stats.Oversize,
		Deletes:      stats.Deletes,
		Items:        int64(stats.Items),
		Bytes:        stats.Cost,
	}
}

func queryResultBindings() ([]runtimecache.ResultBinding, error) {
	factories := []struct {
		name  string
		build func() (runtimecache.ResultBinding, error)
	}{
		{name: "rankings", build: ranking.ResultBinding},
		{name: "candidates", build: candidates.ResultBinding},
		{name: "person detail", build: persondetail.ResultBinding},
		{name: "partners", build: partners.ResultBinding},
		{name: "co-star", build: costar.ResultBinding},
	}
	bindings := make([]runtimecache.ResultBinding, 0, len(factories))
	for _, factory := range factories {
		binding, err := factory.build()
		if err != nil {
			return nil, fmt.Errorf("create %s result binding: %w", factory.name, err)
		}
		bindings = append(bindings, binding)
	}
	return bindings, nil
}

func currentRankingStore(state archiveRuntime) ranking.StoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
}

func currentCandidatesStore(state archiveRuntime) candidates.StoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
}

func currentPersonDetailStore(state archiveRuntime) persondetail.StoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
}

func currentPartnersStore(state archiveRuntime) partners.StoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
}

func currentCoStarStore(state archiveRuntime) costar.StoreProvider {
	return func() (*archive.Store, bool) {
		if state == nil {
			return nil, false
		}
		return state.Current()
	}
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

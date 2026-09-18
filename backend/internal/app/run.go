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
	ImageHTTPSProxy *string
	ArchiveUpdater  ArchiveUpdateRunner
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
	collectionSource := publiccollection.New()
	return runListener(ctx, listener, archiveRoot, runDependencies{
		archive:     new(archive.State),
		collections: collectionSource,
		runtime:     runtimeObservability,
		updater:     options.ArchiveUpdater,
		server: func(handler http.Handler) servingRuntime {
			return httpapi.NewServer(handler)
		},
	})
}

type archiveRuntime interface {
	OpenCurrent(context.Context, string) error
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
	warm        func(context.Context, *archive.Store) error
	archive     archiveRuntime
	collections collectionProvider
	runtime     *httpapi.RuntimeObservability
	updater     ArchiveUpdateRunner
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

	loadErr := dependencies.archive.OpenCurrent(ctx, archiveRoot)
	if loadErr != nil {
		if eventErr := dependencies.runtime.EmitArchiveLoadFailed(archiveEventCode(loadErr)); eventErr != nil {
			return errors.Join(wrapError("emit Archive load failure", eventErr), wrapError("close archive", dependencies.archive.Close()))
		}
		if ctx.Err() != nil {
			return cancellationResult(ctx.Err(), wrapError("close archive", dependencies.archive.Close()))
		}
		return serveRuntime(ctx, listener, dependencies, nil)
	}
	store, ready := dependencies.archive.Current()
	if !ready || store == nil {
		if err := dependencies.runtime.EmitArchiveLoadFailed("INTERNAL_ERROR"); err != nil {
			return errors.Join(wrapError("emit Archive load failure", err), wrapError("close archive", dependencies.archive.Close()))
		}
		store = nil
	}
	return serveRuntime(ctx, listener, dependencies, store)
}

func serveRuntime(ctx context.Context, listener net.Listener, dependencies runDependencies, startup *archive.Store) error {
	process, stop := context.WithCancel(ctx)
	defer stop()
	view := &preparedArchive{archiveRuntime: dependencies.archive}
	_ = dependencies.runtime.SetReadiness(false, "")
	closeArchive := func() error {
		current, _ := dependencies.archive.Current()
		retireArchive(current)
		return dependencies.archive.Close()
	}
	services, err := newQueryServices(view, dependencies.collections)
	if err != nil {
		return errors.Join(err, wrapError("close archive", closeArchive()))
	}
	if err := dependencies.runtime.SetRuntimeStatsProvider(queryRuntimeStatsProvider(services.runtime)); err != nil {
		return errors.Join(fmt.Errorf("configure query runtime stats: %w", err), wrapError("close archive", closeArchive()))
	}
	gate := &maintenanceGate{view: view, process: process, warm: dependencies.warm, runtime: dependencies.runtime}
	handler := dependencies.runtime.HandlerWithAdmission(readinessProbe(view), currentCatalogStore(view), services.rankings, services.candidates, services.personDetail, services.partners, services.coStar, gate.wrapRoutes)
	server := dependencies.server(handler)
	if server == nil {
		return errors.Join(errors.New("serve api: nil server"), wrapError("close archive", closeArchive()))
	}
	var state replaceableArchive
	if dependencies.updater != nil {
		var ok bool
		state, ok = dependencies.archive.(replaceableArchive)
		if !ok {
			return errors.Join(errors.New("serve api: archive runtime cannot replace Store"), wrapError("close archive", closeArchive()))
		}
	}
	dependencies.runtime.SetLive(true)
	serveDone := make(chan error, 1)
	go func() { serveDone <- server.Serve(process, listener) }()
	// This goroutine owns startup preparation followed by the scheduler. Joining
	// it on every exit prevents startup/update overlap and close-while-loading.
	lifecycleDone := make(chan error, 1)
	go func() {
		if startup != nil {
			if err := prepareArchive(process, startup, dependencies.warm); err != nil {
				lifecycleDone <- fmt.Errorf("prepare startup Archive: %w", err)
				return
			}
			if process.Err() != nil {
				lifecycleDone <- process.Err()
				return
			}
			gate.publishStartup(startup)
		}
		if dependencies.updater != nil && process.Err() == nil {
			scheduler := &archiveScheduler{runner: dependencies.updater, runtime: dependencies.runtime}
			scheduler.Run(process, func(update context.Context, request ArchiveActivation) error {
				return activateCandidate(update, gate, state, services.runtime.Idle, dependencies.runtime, request)
			})
		} else {
			<-process.Done()
		}
		lifecycleDone <- nil
	}()
	shutdown := func() {
		gate.terminate() // irreversible admission closure before cancellation or joins
		stop()
		gate.pause() // now cancellation-cooperative ready probes can finish
	}
	var serveErr, lifecycleErr error
	select {
	case serveErr = <-serveDone:
		shutdown()
		lifecycleErr = <-lifecycleDone
	case lifecycleErr = <-lifecycleDone:
		shutdown()
		serveErr = <-serveDone
	case <-ctx.Done():
		shutdown()
		serveErr = <-serveDone
		lifecycleErr = <-lifecycleDone
	}
	// A listener failure may return from Serve while admitted handlers remain.
	// Close admission and join them before checking detached work: a handler
	// still parsing its body may not have registered that work yet.
	gate.pause()
	view.publish(nil)
	dependencies.runtime.SetLive(false)
	_ = dependencies.runtime.SetReadiness(false, "")
	for {
		gate.mu.Lock()
		active := gate.active
		gate.mu.Unlock()
		if active == 0 && services.runtime.Idle() {
			break
		}
		time.Sleep(maintenancePollInterval)
	}
	closeErr := closeArchive()
	if process.Err() != nil && (errors.Is(lifecycleErr, context.Canceled)) {
		lifecycleErr = nil
	}
	return errors.Join(wrapError("serve api", serveErr), lifecycleErr, wrapError("close archive", closeErr))
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
		return probeArchiveStore(ctx, store)
	}
}

func probeArchiveStore(ctx context.Context, store *archive.Store) (string, error) {
	if store == nil {
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

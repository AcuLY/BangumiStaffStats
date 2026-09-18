package app

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const archivePreparationTimeout = 120 * time.Second

type publicDataLoaders struct {
	series func(context.Context, *archive.Store) error
	facts  func(context.Context, *archive.Store, string) error
}

func warmArchive(ctx context.Context, store *archive.Store) error {
	return warmPublicData(ctx, store, publicDataLoaders{
		series: func(ctx context.Context, s *archive.Store) error {
			_, err := statistics.LoadSeriesIndex(ctx, s)
			return err
		},
		facts: func(ctx context.Context, s *archive.Store, typ string) error {
			_, err := query.LoadFactSet(ctx, s, typ)
			return err
		},
	})
}

func warmPublicData(ctx context.Context, store *archive.Store, loaders publicDataLoaders) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if err := loaders.series(ctx, store); err != nil {
		return fmt.Errorf("prepare series: %w", err)
	}
	for _, typ := range []string{"anime", "book", "music", "game", "real"} {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := loaders.facts(ctx, store, typ); err != nil {
			return fmt.Errorf("prepare %s facts: %w", typ, err)
		}
	}
	return ctx.Err()
}

// One attempt budget includes every serial loader and the fixed readiness read.
func prepareArchive(ctx context.Context, store *archive.Store, warm func(context.Context, *archive.Store) error) error {
	attempt, cancel := context.WithTimeout(ctx, archivePreparationTimeout)
	defer cancel()
	if warm == nil {
		warm = warmArchive
	}
	if err := warm(attempt, store); err != nil {
		return err
	}
	if err := attempt.Err(); err != nil {
		return err
	}
	probe, cancelProbe := context.WithTimeout(attempt, time.Second)
	defer cancelProbe()
	_, err := probeArchiveStore(probe, store)
	return err
}

// retireArchive requires joined HTTP, detached work and preparation. It never
// closes a handle or mutates values that were returned to a reader.
func retireArchive(store *archive.Store) {
	if store == nil {
		return
	}
	query.RetireFactSets(store)
	statistics.RetireSeriesIndex(store)
}

// preparedArchive is the sole public Store view. The raw State retains handle
// ownership; merely publishing a raw Store can never admit a cold generation.
type preparedArchive struct {
	archiveRuntime
	mu       sync.RWMutex
	blocked  bool
	prepared *archive.Store
}

func (view *preparedArchive) Current() (*archive.Store, bool) {
	view.mu.RLock()
	defer view.mu.RUnlock()
	if view.blocked || view.prepared == nil {
		return nil, false
	}
	current, ok := view.archiveRuntime.Current()
	if !ok || current != view.prepared {
		return nil, false
	}
	return current, true
}
func (view *preparedArchive) admission(open bool) {
	view.mu.Lock()
	view.blocked = !open
	view.mu.Unlock()
}
func (view *preparedArchive) publish(store *archive.Store) {
	view.mu.Lock()
	view.prepared = store
	view.mu.Unlock()
}

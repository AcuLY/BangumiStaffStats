package archive

import (
	"context"
	"sync"
	"sync/atomic"
)

// State owns the single runtime-published Archive snapshot. The atomic pointer
// is also the readiness signal.
type State struct {
	current atomic.Pointer[Store]

	mu       sync.Mutex
	closed   bool
	closeErr error
}

// LoadCurrent reads current.json once, validates the selected candidate, and
// publishes it only after every gate succeeds.
func (s *State) LoadCurrent(ctx context.Context, rootPath string) error {
	candidate, err := loadCurrentCandidate(ctx, rootPath, loadHooks{})
	if err != nil {
		return err
	}
	return s.publishCurrent(ctx, candidate)
}

func (s *State) publishCurrent(ctx context.Context, candidate *Store) error {
	return s.publishCandidate(ctx, candidate)
}

func (s *State) publish(candidate *Store) error {
	return s.publishCandidate(context.Background(), candidate)
}

func (s *State) publishCandidate(ctx context.Context, candidate *Store) error {
	if candidate == nil {
		return outcome(CodeArchiveFileInvalid)
	}

	s.mu.Lock()
	err := contextOutcome(ctx)
	if err == nil && (s.closed || !s.current.CompareAndSwap(nil, candidate)) {
		err = outcome(CodeArchiveAlreadyPublished)
	}
	s.mu.Unlock()

	if err != nil {
		_ = candidate.Close()
	}
	return err
}

// Current returns the complete published snapshot, if ready.
func (s *State) Current() (*Store, bool) {
	if s == nil {
		return nil, false
	}
	store := s.current.Load()
	return store, store != nil
}

// Ready reports whether a complete snapshot is published.
func (s *State) Ready() bool {
	_, ready := s.Current()
	return ready
}

// Close first clears readiness, then closes the published store exactly once.
func (s *State) Close() error {
	if s == nil {
		return nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed {
		return s.closeErr
	}
	s.closed = true
	store := s.current.Swap(nil)
	if store != nil {
		s.closeErr = store.Close()
	}
	return s.closeErr
}

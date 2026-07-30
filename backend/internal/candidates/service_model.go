package candidates

import (
	"context"
	"encoding/json"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

// StoreProvider exposes only the currently published immutable Archive.
type StoreProvider func() (*archive.Store, bool)

// CollectionProvider is the admitted anonymous public-collection boundary.
type CollectionProvider interface {
	Fetch(
		context.Context,
		string,
		string,
		[]string,
	) (runtimecache.CollectionSnapshot, error)
}

// CollectionProviderFunc adapts a function into CollectionProvider.
type CollectionProviderFunc func(
	context.Context,
	string,
	string,
	[]string,
) (runtimecache.CollectionSnapshot, error)

// Fetch implements CollectionProvider.
func (function CollectionProviderFunc) Fetch(
	ctx context.Context,
	uid string,
	subjectType string,
	statuses []string,
) (runtimecache.CollectionSnapshot, error) {
	return function(ctx, uid, subjectType, statuses)
}

// Request retains exact endpoint documents until the candidate authority
// validates them against the current Archive and normalized query.
type Request struct {
	Query             json.RawMessage
	Input             json.RawMessage
	View              json.RawMessage
	RefreshCollection bool
}

// Config contains only bounded cache and admission policy.
type Config struct {
	Executor   runtimecache.ExecutorConfig
	Collection runtimecache.CollectionConfig
	Result     runtimecache.ResultConfig
}

// DefaultConfig returns the approved in-process production policy.
func DefaultConfig() Config {
	return Config{
		Executor:   runtimecache.DefaultExecutorConfig(),
		Collection: runtimecache.DefaultCollectionConfig(),
		Result:     runtimecache.DefaultResultConfig(),
	}
}

// CollectionFreshness is emitted only for personal scope.
type CollectionFreshness struct {
	FetchedAt    time.Time `json:"fetchedAt"`
	Stale        bool      `json:"stale"`
	WarningCodes []string  `json:"warningCodes"`
}

// Pagination reports searched population size before pagination.
type Pagination struct {
	Page     int64 `json:"page"`
	PageSize int   `json:"pageSize"`
	Total    int   `json:"total"`
}

// Projection is one immutable scope-aware candidates page.
type Projection struct {
	scope       string
	dataVersion string
	page        Page
	collection  *CollectionFreshness
}

// Scope returns global or personal.
func (projection Projection) Scope() string { return projection.scope }

// DataVersion returns the Archive identity used by the complete core.
func (projection Projection) DataVersion() string { return projection.dataVersion }

// Pagination returns copied searched-page metadata.
func (projection Projection) Pagination() Pagination {
	return Pagination{
		Page:     projection.page.Page,
		PageSize: projection.page.PageSize,
		Total:    projection.page.Total,
	}
}

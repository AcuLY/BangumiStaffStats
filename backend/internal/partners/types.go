package partners

import (
	"context"
	"encoding/json"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const maxJSONSafeInteger int64 = 9_007_199_254_740_991

// StoreProvider exposes only the currently published immutable Archive.
type StoreProvider func() (*archive.Store, bool)

// CollectionProvider is the admitted anonymous public-collection boundary.
type CollectionProvider interface {
	Fetch(context.Context, string, string, []string) (runtimecache.CollectionSnapshot, error)
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

// Request retains exact endpoint documents until the operation authority has
// normalized the query and can validate opaque position identities.
type Request struct {
	Query json.RawMessage
	Input json.RawMessage
	View  json.RawMessage
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

// SourceInput preserves the requested identity order.
type SourceInput struct {
	PersonID     int64
	PositionKeys []string
}

// Input selects one source and optionally narrows candidate identities.
type Input struct {
	Source               SourceInput
	CandidatePositionKey *string
}

// Sort is a partner view primary metric.
type Sort string

const (
	SortCount      Sort = "count"
	SortAverage    Sort = "average"
	SortOverall    Sort = "overall"
	SortPreference Sort = "preference"
)

// View is a fully defaulted, validated projection request.
type View struct {
	Search   string
	Sort     Sort
	Order    statistics.Direction
	Page     int64
	PageSize int
}

// Operation is a normalized endpoint-specific request.
type Operation struct {
	Input Input
	View  View
}

// PersonReference is the complete wire-safe identity.
type PersonReference struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

// SourceMetrics deliberately excludes overall.
type SourceMetrics struct {
	WorkCount      int    `json:"workCount"`
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
}

// Metrics is the complete partner rating aggregate.
type Metrics struct {
	WorkCount      int    `json:"workCount"`
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
	Overall        *int64 `json:"overall"`
}

// Preference retains exact accepted personal evidence.
type Preference struct {
	ComparableCount       int                  `json:"comparableCount"`
	ComparableSeriesCount int                  `json:"comparableSeriesCount"`
	EffectiveEvidence     int                  `json:"effectiveEvidence"`
	Mean                  *statistics.Rational `json:"mean"`
	EvidenceWeight        statistics.Rational  `json:"evidenceWeight"`
	Score                 *statistics.Rational `json:"score"`
}

// SourceCore is the complete immutable source projection.
type SourceCore struct {
	Person       PersonReference
	PositionKeys []string
	Metrics      SourceMetrics
}

// PartnerCore is one immutable complete-set partner.
type PartnerCore struct {
	Person       PersonReference
	PositionKeys []string
	Metrics      Metrics
	Preference   *Preference
}

// Core is one expensive result before search, sorting, and pagination.
type Core struct {
	DataVersion string
	QueryDigest string
	Scope       string
	WorkUnit    statistics.UnitKind
	Source      SourceCore
	Partners    []PartnerCore
}

// BuildRequest consumes already-evaluated query membership and immutable
// accepted facts. Query filters and collection acquisition have already run.
type BuildRequest struct {
	DataVersion     string
	Query           query.Result
	Facts           query.FactSet
	PersonalEntries []query.CollectionEntry
	Series          *statistics.SeriesIndex
	Input           Input
	People          []PersonReference
}

// Leader is always present for its metric; Item is nil without usable
// evidence for that metric.
type Leader struct {
	Metric Sort         `json:"metric"`
	Item   *PartnerCore `json:"item"`
}

// Item retains rank assigned over the complete selected partner population.
type Item struct {
	Rank int `json:"rank"`
	PartnerCore
}

// Summary is invariant under ordinary view changes.
type Summary struct {
	PartnerCount int      `json:"partnerCount"`
	Leaders      []Leader `json:"leaders"`
}

// Page is one independent partner view.
type Page struct {
	WorkUnit statistics.UnitKind
	Source   SourceCore
	Summary  Summary
	Items    []Item
	Page     int64
	PageSize int
	Total    int
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

// Projection is one immutable scope-aware success value.
type Projection struct {
	scope       string
	dataVersion string
	page        Page
	collection  *CollectionFreshness
}

// Scope reports global or personal.
func (projection Projection) Scope() string { return projection.scope }

// DataVersion returns the immutable Archive identity used by this result.
func (projection Projection) DataVersion() string { return projection.dataVersion }

// Pagination returns copied searched-page metadata.
func (projection Projection) Pagination() Pagination {
	return Pagination{
		Page:     projection.page.Page,
		PageSize: projection.page.PageSize,
		Total:    projection.page.Total,
	}
}

// Builder describes the cache-facing build operation.
type Builder func(context.Context) (Core, error)

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func cloneInt64(value *int64) *int64 {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

func clonePerson(value PersonReference) PersonReference {
	value.NameCN = cloneString(value.NameCN)
	return value
}

func clonePreference(value *Preference) *Preference {
	if value == nil {
		return nil
	}
	copy := *value
	if value.Mean != nil {
		mean := *value.Mean
		copy.Mean = &mean
	}
	if value.Score != nil {
		score := *value.Score
		copy.Score = &score
	}
	return &copy
}

func clonePartner(value PartnerCore) PartnerCore {
	value.Person = clonePerson(value.Person)
	value.PositionKeys = append([]string{}, value.PositionKeys...)
	value.Metrics.Average = cloneInt64(value.Metrics.Average)
	value.Metrics.Overall = cloneInt64(value.Metrics.Overall)
	value.Preference = clonePreference(value.Preference)
	return value
}

func cloneSource(value SourceCore) SourceCore {
	value.Person = clonePerson(value.Person)
	value.PositionKeys = append([]string{}, value.PositionKeys...)
	value.Metrics.Average = cloneInt64(value.Metrics.Average)
	return value
}

// CloneCore transfers deep ownership across cache/request boundaries.
func CloneCore(value Core) Core {
	value.Source = cloneSource(value.Source)
	value.Partners = append([]PartnerCore{}, value.Partners...)
	for index := range value.Partners {
		value.Partners[index] = clonePartner(value.Partners[index])
	}
	return value
}

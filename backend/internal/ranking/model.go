// Package ranking owns the immutable rankings core and its view projection.
package ranking

import (
	"context"
	"encoding/json"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

const (
	maxJSONSafeInteger = int64(9_007_199_254_740_991)
	maxSearchRunes     = 256
)

// StoreProvider exposes only the currently published immutable Archive.
type StoreProvider func() (*archive.Store, bool)

// CollectionProvider is the explicit admitted public-collection boundary.
// Implementations return a complete anonymous snapshot for exactly the
// requested UID, subject type, and canonical status set.
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

// Request contains exact preserved operation documents. Query is normalized by
// the accepted query authority; View is decoded by the rankings projection.
type Request struct {
	Query             json.RawMessage
	View              json.RawMessage
	RefreshCollection bool
}

// View is the closed normalized projection input.
type View struct {
	Search   string
	Sort     string
	Order    statistics.Direction
	Page     int64
	PageSize int
}

// PersonReference is the complete person shape permitted in a ranking row.
type PersonReference struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

// Preference retains exact evidence without presentation conversion.
type Preference struct {
	ComparableCount       int                 `json:"comparableCount"`
	ComparableSeriesCount int                 `json:"comparableSeriesCount"`
	EffectiveEvidence     int                 `json:"effectiveEvidence"`
	Mean                  statistics.Rational `json:"mean"`
	EvidenceWeight        statistics.Rational `json:"evidenceWeight"`
	Score                 statistics.Rational `json:"score"`
}

type rowCore struct {
	Person            PersonReference
	WorkCount         int
	RatedUnitCount    int
	Average           *int64
	Overall           *int64
	Preference        *Preference
	SearchName        string
	SearchNameCN      string
	EffectiveEvidence int
}

// Summary is computed from the complete unsearched population.
type Summary struct {
	PersonCount    int                 `json:"personCount"`
	WorkUnit       statistics.UnitKind `json:"workUnit"`
	WorkCount      int                 `json:"workCount"`
	CharacterCount *int                `json:"characterCount,omitempty"`
}

type core struct {
	DataVersion string
	Scope       string
	Summary     Summary
	Rows        []rowCore
}

// MetricScale describes the selected primary metric over the complete
// pre-search population. Max is nil, int64, or statistics.Rational.
type MetricScale struct {
	Metric string `json:"metric"`
	Kind   string `json:"kind"`
	Max    any    `json:"max"`
}

// GlobalItem deliberately has no preference field.
type GlobalItem struct {
	Rank      int             `json:"rank"`
	Person    PersonReference `json:"person"`
	WorkCount int             `json:"workCount"`
	Average   *int64          `json:"average"`
	Overall   *int64          `json:"overall"`
}

// PersonalItem carries the personal-only preference field.
type PersonalItem struct {
	Rank       int             `json:"rank"`
	Person     PersonReference `json:"person"`
	WorkCount  int             `json:"workCount"`
	Average    *int64          `json:"average"`
	Overall    *int64          `json:"overall"`
	Preference *Preference     `json:"preference"`
}

// Pagination reports searched population size before pagination.
type Pagination struct {
	Page     int64 `json:"page"`
	PageSize int   `json:"pageSize"`
	Total    int   `json:"total"`
}

// CollectionFreshness is emitted only for personal scope.
type CollectionFreshness struct {
	FetchedAt    time.Time `json:"fetchedAt"`
	Stale        bool      `json:"stale"`
	WarningCodes []string  `json:"warningCodes"`
}

type globalData struct {
	Summary     Summary      `json:"summary"`
	MetricScale MetricScale  `json:"metricScale"`
	Items       []GlobalItem `json:"items"`
}

type personalData struct {
	Summary     Summary        `json:"summary"`
	MetricScale MetricScale    `json:"metricScale"`
	Items       []PersonalItem `json:"items"`
}

type globalMeta struct {
	RequestID   string     `json:"requestId"`
	DataVersion string     `json:"dataVersion"`
	Pagination  Pagination `json:"pagination"`
}

type personalMeta struct {
	RequestID   string              `json:"requestId"`
	DataVersion string              `json:"dataVersion"`
	Pagination  Pagination          `json:"pagination"`
	Collection  CollectionFreshness `json:"collection"`
}

type globalEnvelope struct {
	Data globalData `json:"data"`
	Meta globalMeta `json:"meta"`
}

type personalEnvelope struct {
	Data personalData `json:"data"`
	Meta personalMeta `json:"meta"`
}

// Projection is an immutable scope-aware rankings page.
type Projection struct {
	scope         string
	dataVersion   string
	summary       Summary
	metricScale   MetricScale
	globalItems   []GlobalItem
	personalItems []PersonalItem
	pagination    Pagination
	collection    *CollectionFreshness
}

// Scope returns global or personal.
func (projection Projection) Scope() string { return projection.scope }

// DataVersion returns the Archive identity used by the complete core.
func (projection Projection) DataVersion() string { return projection.dataVersion }

// Pagination returns the copied projection metadata.
func (projection Projection) Pagination() Pagination { return projection.pagination }

// MarshalEnvelope creates deterministic scope-specific JSON with omission by
// construction.
func (projection Projection) MarshalEnvelope(requestID string) ([]byte, error) {
	if projection.scope == "personal" {
		if projection.collection == nil {
			return nil, fail(CodeInternal, "rankings is unavailable", "", "", true, nil)
		}
		return json.Marshal(personalEnvelope{
			Data: personalData{
				Summary:     cloneSummary(projection.summary),
				MetricScale: cloneMetricScale(projection.metricScale),
				Items:       clonePersonalItems(projection.personalItems),
			},
			Meta: personalMeta{
				RequestID:   requestID,
				DataVersion: projection.dataVersion,
				Pagination:  projection.pagination,
				Collection:  cloneCollectionFreshness(*projection.collection),
			},
		})
	}
	return json.Marshal(globalEnvelope{
		Data: globalData{
			Summary:     cloneSummary(projection.summary),
			MetricScale: cloneMetricScale(projection.metricScale),
			Items:       cloneGlobalItems(projection.globalItems),
		},
		Meta: globalMeta{
			RequestID:   requestID,
			DataVersion: projection.dataVersion,
			Pagination:  projection.pagination,
		},
	})
}

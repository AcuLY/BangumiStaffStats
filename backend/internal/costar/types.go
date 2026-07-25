package costar

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
// normalized the query and validated opaque position identities.
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

// ParticipantInput preserves participant and identity order.
type ParticipantInput struct {
	PersonID     int64    `json:"personId"`
	PositionKeys []string `json:"positionKeys"`
}

// Input is the closed pair/group selection.
type Input struct {
	Participants []ParticipantInput `json:"participants"`
}

// Sort is a common-work view primary metric.
type Sort string

const (
	SortGlobalScore         Sort = "globalScore"
	SortPersonalScore       Sort = "personalScore"
	SortCollectionUpdatedAt Sort = "collectionUpdatedAt"
	SortSeriesSize          Sort = "seriesSize"
)

// Order changes only the requested primary metric.
type Order string

const (
	OrderAscending  Order = "asc"
	OrderDescending Order = "desc"
)

// View is a fully defaulted and validated common-work projection.
type View struct {
	Search   string
	Sort     Sort
	Order    Order
	Page     int64
	PageSize int
}

// Operation is one normalized endpoint-specific request.
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

// SubjectReference is the bounded raw Subject identity.
type SubjectReference struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
	Date   *string `json:"date"`
}

// CharacterReference is exact cast evidence.
type CharacterReference struct {
	Key    string  `json:"key"`
	ID     *int64  `json:"id,omitempty"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

// Metrics is one scope-selected aggregate.
type Metrics struct {
	WorkCount      int    `json:"workCount"`
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
}

// ParticipantCore is one input-ordered immutable participant.
type ParticipantCore struct {
	Person       PersonReference `json:"person"`
	PositionKeys []string        `json:"positionKeys"`
	Metrics      Metrics         `json:"metrics"`
}

// Summary retains complete common-set evidence. Personal-only members are nil
// in global scope and structurally omitted by the transport projection.
type Summary struct {
	UnionWorkCount       int    `json:"unionWorkCount"`
	CommonWorkCount      int    `json:"commonWorkCount"`
	RatedWorkCount       int    `json:"ratedWorkCount"`
	Average              *int64 `json:"average"`
	GlobalRatedWorkCount *int   `json:"globalRatedWorkCount,omitempty"`
	GlobalAverage        *int64 `json:"globalAverage,omitempty"`
	Highest              *int64 `json:"highest,omitempty"`
	Lowest               *int64 `json:"lowest,omitempty"`
}

// TagCount is one bounded normalized complete-set evidence item.
type TagCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Tags keeps scope-separated evidence.
type Tags struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
	Personal  []TagCount `json:"personal,omitempty"`
}

// RatingExample is a compact statistical-unit reference.
type RatingExample struct {
	Kind   statistics.UnitKind `json:"kind"`
	Key    string              `json:"key"`
	ID     int64               `json:"id"`
	Name   string              `json:"name"`
	NameCN *string             `json:"nameCN"`
}

type RatingBucket struct {
	Score       int             `json:"score"`
	Count       int             `json:"count"`
	Examples    []RatingExample `json:"examples"`
	HiddenCount int             `json:"hiddenCount"`
}

type RatingTimelinePoint struct {
	Year    int   `json:"year"`
	Quarter int   `json:"quarter"`
	Average int64 `json:"average"`
	Count   int   `json:"count"`
}

type RatingDistribution struct {
	ValidCount int                   `json:"validCount"`
	Average    *int64                `json:"average"`
	Buckets    []RatingBucket        `json:"buckets"`
	Timeline   []RatingTimelinePoint `json:"timeline"`
}

// RatingDataset is common-first and then participant input order.
type RatingDataset struct {
	Kind     string
	PersonID *int64
	Global   RatingDistribution
	Personal *RatingDistribution
}

// Preference retains exact accepted personal evidence.
type Preference struct {
	ComparableCount       int                  `json:"comparableCount"`
	ComparableSeriesCount int                  `json:"comparableSeriesCount"`
	EffectiveEvidence     int                  `json:"effectiveEvidence"`
	Mean                  *statistics.Rational `json:"mean"`
	EvidenceWeight        statistics.Rational  `json:"evidenceWeight"`
	Score                 *statistics.Rational `json:"score"`
	Preferred             []PreferenceItem     `json:"preferred"`
	Conservative          []PreferenceItem     `json:"conservative"`
}

type PreferenceItem struct {
	Unit                 RatingExample `json:"unit"`
	PersonalScore        int64         `json:"personalScore"`
	GlobalScore          int64         `json:"globalScore"`
	DifferenceHundredths int64         `json:"differenceHundredths"`
}

// MatrixPair is one input-ordered upper-triangle pair.
type MatrixPair struct {
	LeftPersonID  int64   `json:"leftPersonId"`
	RightPersonID int64   `json:"rightPersonId"`
	Metrics       Metrics `json:"metrics"`
}

// CollectionEvidence belongs only to personal work projections.
type CollectionEvidence struct {
	Score     *int64  `json:"score"`
	UpdatedAt *string `json:"updatedAt"`
}

// Contribution is a closed staff/cast exact-provenance union.
type Contribution struct {
	Kind  string
	Staff *StaffContribution
	Cast  *CastContribution
}

type StaffContribution struct {
	PositionKey      string
	ExactPositionKey string
	Provenance       string
	WorkCount        *int
}

type CastContribution struct {
	PositionKey string
	Character   CharacterReference
	RoleType    int64
	RoleLabel   string
	Provenance  string
	WorkCount   *int
}

// WorkParticipant contains one participant's actual matching contributions.
type WorkParticipant struct {
	PersonID  int64
	WorkCount *int
	Credits   []Contribution
}

type SubjectWork struct {
	Key          string
	Subject      SubjectReference
	MetaTags     []string
	GlobalScore  *int64
	Personal     *CollectionEvidence
	Participants []WorkParticipant
}

type SeriesMember struct {
	SubjectReference
	Matched bool
}

type SeriesWork struct {
	Key                       string
	SeriesID                  int64
	Representative            SubjectReference
	MatchedWorkCount          int
	MemberCount               int
	Members                   []SeriesMember
	GlobalScore               *int64
	PersonalScore             *int64
	LatestCollectionUpdatedAt *string
	Participants              []WorkParticipant
}

// WorkItem is a closed subject/series union.
type WorkItem struct {
	Kind    string
	Subject *SubjectWork
	Series  *SeriesWork
}

// Core is one complete immutable result before ordinary work view projection.
type Core struct {
	DataVersion  string
	QueryDigest  string
	Scope        string
	Kind         string
	WorkUnit     statistics.UnitKind
	Participants []ParticipantCore
	Summary      Summary
	Tags         Tags
	Ratings      []RatingDataset
	Preference   *Preference
	Matrix       []MatrixPair
	Works        []WorkItem
}

// Pagination reports searched population before pagination.
type Pagination struct {
	Page     int64 `json:"page"`
	PageSize int   `json:"pageSize"`
	Total    int   `json:"total"`
}

// Projection retains invariant evidence and exactly one independently-owned
// common-work page.
type Projection struct {
	Core       Core
	Items      []WorkItem
	Pagination Pagination
	Collection *CollectionFreshness
}

// CollectionFreshness is emitted only for personal scope.
type CollectionFreshness struct {
	FetchedAt    time.Time `json:"fetchedAt"`
	Stale        bool      `json:"stale"`
	WarningCodes []string  `json:"warningCodes"`
}

// ArchiveEvidence is the bounded reference supplement required by the current
// participant unions and common work projection.
type ArchiveEvidence struct {
	People     []PersonReference
	Subjects   []SubjectReference
	Characters []CharacterReference
}

// BuildRequest consumes already accepted query/statistics authorities.
type BuildRequest struct {
	DataVersion     string
	Query           query.Result
	Facts           query.FactSet
	PersonalEntries []query.CollectionEntry
	Series          *statistics.SeriesIndex
	Input           Input
	Evidence        ArchiveEvidence
}

// Builder describes the cache-facing complete-core build operation.
type Builder func(context.Context) (Core, error)

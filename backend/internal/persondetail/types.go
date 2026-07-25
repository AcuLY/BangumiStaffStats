package persondetail

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

func (function CollectionProviderFunc) Fetch(
	ctx context.Context,
	uid string,
	subjectType string,
	statuses []string,
) (runtimecache.CollectionSnapshot, error) {
	return function(ctx, uid, subjectType, statuses)
}

// Request contains preserved operation documents. Person detail never accepts
// refreshCollection.
type Request struct {
	Query json.RawMessage
	Input json.RawMessage
	View  json.RawMessage
}

// Input is the closed semantic input.
type Input struct {
	PersonID int64 `json:"personId"`
}

// ViewInput represents optional request members before defaults.
type ViewInput struct {
	Section  *Section `json:"section,omitempty"`
	Search   *string  `json:"search,omitempty"`
	Sort     *Sort    `json:"sort,omitempty"`
	Order    *Order   `json:"order,omitempty"`
	Page     *int64   `json:"page,omitempty"`
	PageSize *int     `json:"pageSize,omitempty"`
}

type Section string

const (
	SectionWorks      Section = "works"
	SectionCharacters Section = "characters"
)

type Sort string

const (
	SortGlobalScore         Sort = "globalScore"
	SortPersonalScore       Sort = "personalScore"
	SortCollectionUpdatedAt Sort = "collectionUpdatedAt"
	SortSeriesSize          Sort = "seriesSize"
	SortRole                Sort = "role"
	SortWorkCount           Sort = "workCount"
	SortName                Sort = "name"
)

type Order string

const (
	OrderAscending  Order = "asc"
	OrderDescending Order = "desc"
)

// View is a fully defaulted and validated projection.
type View struct {
	Section  Section
	Search   string
	Sort     Sort
	Order    Order
	Page     int64
	PageSize int
}

// PersonReference is the stable minimal person identity.
type PersonReference struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

// PersonProfile is the bounded Archive profile allowed in detail.
type PersonProfile struct {
	PersonReference
	Careers []string `json:"careers"`
	Summary *string  `json:"summary,omitempty"`
}

// SubjectReference is the stable bounded raw Subject identity.
type SubjectReference struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
	Date   *string `json:"date"`
}

// CharacterReference is a stable Archive character identity. ID remains
// optional so the wire contract can represent future source-owned anonymous
// characters without conflating them across Subjects.
type CharacterReference struct {
	Key    string  `json:"key"`
	ID     *int64  `json:"id,omitempty"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

// Summary remains invariant across every view projection.
type Summary struct {
	WorkUnit       statistics.UnitKind `json:"workUnit"`
	WorkCount      int                 `json:"workCount"`
	CharacterCount *int                `json:"characterCount,omitempty"`
}

// Metrics uses exact hundredths and explicit nil for missing evidence.
// Personal-only comparison fields are omitted by the transport projection.
type Metrics struct {
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
	Overall        *int64 `json:"overall"`
	GlobalAverage  *int64 `json:"globalAverage,omitempty"`
	Highest        *int64 `json:"highest,omitempty"`
	Lowest         *int64 `json:"lowest,omitempty"`
}

// TagCount is one bounded normalized evidence item.
type TagCount struct {
	Name  string `json:"name"`
	Count int    `json:"count"`
}

// Tags keeps scope-separated evidence. Personal is nil in global scope.
type Tags struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
	Personal  []TagCount `json:"personal,omitempty"`
}

// RatingExample is deliberately a compact statistical-unit reference.
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

// Ratings exposes both public and, only in personal scope, caller evidence.
type Ratings struct {
	Global   RatingDistribution  `json:"global"`
	Personal *RatingDistribution `json:"personal,omitempty"`
}

// Preference contains accepted exact rational evidence plus bounded examples.
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

type CollectionEvidence struct {
	Score     *int64  `json:"score"`
	UpdatedAt *string `json:"updatedAt"`
}

// Contribution is a closed staff/cast union represented with mutually
// exclusive payload pointers.
type Contribution struct {
	Kind  string             `json:"kind"`
	Staff *StaffContribution `json:"staff,omitempty"`
	Cast  *CastContribution  `json:"cast,omitempty"`
}

type StaffContribution struct {
	PositionKey      string `json:"positionKey"`
	ExactPositionKey string `json:"exactPositionKey"`
	Provenance       string `json:"provenance"`
	WorkCount        *int   `json:"workCount,omitempty"`
}

type CastContribution struct {
	PositionKey string             `json:"positionKey"`
	Character   CharacterReference `json:"character"`
	RoleType    int64              `json:"roleType"`
	RoleLabel   string             `json:"roleLabel"`
	Provenance  string             `json:"provenance"`
	WorkCount   *int               `json:"workCount,omitempty"`
}

type SubjectWork struct {
	Key           string              `json:"key"`
	Subject       SubjectReference    `json:"subject"`
	MetaTags      []string            `json:"metaTags"`
	GlobalScore   *int64              `json:"globalScore"`
	Personal      *CollectionEvidence `json:"personal,omitempty"`
	Contributions []Contribution      `json:"contributions"`
}

type SeriesMember struct {
	SubjectReference
	Matched bool `json:"matched"`
}

type SeriesWork struct {
	Key                       string           `json:"key"`
	SeriesID                  int64            `json:"seriesId"`
	Representative            SubjectReference `json:"representative"`
	MatchedWorkCount          int              `json:"matchedWorkCount"`
	MemberCount               int              `json:"memberCount"`
	Members                   []SeriesMember   `json:"members"`
	GlobalScore               *int64           `json:"globalScore"`
	PersonalScore             *int64           `json:"personalScore,omitempty"`
	LatestCollectionUpdatedAt *string          `json:"latestCollectionUpdatedAt,omitempty"`
	Contributions             []Contribution   `json:"contributions"`
}

// WorkItem is a closed subject/series union.
type WorkItem struct {
	Kind    string       `json:"kind"`
	Subject *SubjectWork `json:"subject,omitempty"`
	Series  *SeriesWork  `json:"series,omitempty"`
}

type CharacterAppearance struct {
	Subject      SubjectReference `json:"subject"`
	RoleType     int64            `json:"roleType"`
	RoleLabel    string           `json:"roleLabel"`
	PositionKeys []string         `json:"positionKeys"`
}

type CharacterItem struct {
	Character   CharacterReference    `json:"character"`
	PrimaryRole int64                 `json:"primaryRole"`
	RoleLabel   string                `json:"roleLabel"`
	WorkCount   int                   `json:"workCount"`
	Appearances []CharacterAppearance `json:"appearances"`
}

// Core is the complete immutable semantic value shared by all views.
type Core struct {
	DataVersion    string
	QueryDigest    string
	Scope          string
	Person         PersonProfile
	Summary        Summary
	Metrics        Metrics
	Tags           Tags
	Ratings        Ratings
	Preference     *Preference
	Works          []WorkItem
	Characters     []CharacterItem
	CastApplicable bool
}

// Pagination reports searched total before page slicing.
type Pagination struct {
	Page     int64 `json:"page"`
	PageSize int   `json:"pageSize"`
	Total    int   `json:"total"`
}

// Projection retains complete evidence and exactly one selected page.
type Projection struct {
	Core       Core
	Section    Section
	Works      []WorkItem
	Characters []CharacterItem
	Pagination Pagination
	Collection *CollectionFreshness
}

type CollectionFreshness struct {
	FetchedAt    time.Time `json:"fetchedAt"`
	Stale        bool      `json:"stale"`
	WarningCodes []string  `json:"warningCodes"`
}

// ArchiveEvidence is a bounded immutable supplement to query/statistics facts.
type ArchiveEvidence struct {
	Person     PersonProfile
	Subjects   []SubjectReference
	Characters []CharacterReference
}

// BuildRequest consumes already accepted query and statistics authorities.
type BuildRequest struct {
	DataVersion     string
	PersonID        int64
	Query           query.Result
	Facts           query.FactSet
	Evaluation      statistics.Evaluation
	PersonalEntries []query.CollectionEntry
	Series          *statistics.SeriesIndex
	Evidence        ArchiveEvidence
}

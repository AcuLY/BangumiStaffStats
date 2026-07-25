package candidates

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// PersonReference is the complete candidate person wire-safe identity.
type PersonReference struct {
	ID     int64
	Name   string
	NameCN *string
}

// PositionCount is one complete unsearched unique-person count.
type PositionCount struct {
	PositionKey string
	Count       int
}

// Row is one immutable pre-view candidate.
type Row struct {
	Person             PersonReference
	WorkCount          int
	GlobalAverage      *int64
	GlobalRatedCount   int
	PersonalAverage    *int64
	PersonalRatedCount int
}

// Core is one current-position expensive result plus complete ordered counts.
type Core struct {
	DataVersion    string
	QueryDigest    string
	Scope          string
	PositionKey    string
	WorkUnit       statistics.UnitKind
	PositionCounts []PositionCount
	Rows           []Row
}

// BuildRequest consumes already-evaluated query membership and immutable
// accepted facts. Query filters and collection acquisition have already run.
type BuildRequest struct {
	DataVersion     string
	Query           query.Result
	Facts           query.FactSet
	PersonalEntries []query.CollectionEntry
	Series          *statistics.SeriesIndex
	PositionKey     string
	People          []PersonReference
}

// Sort is a candidate view primary metric.
type Sort string

const (
	SortCount         Sort = "count"
	SortAverage       Sort = "average"
	SortGlobalAverage Sort = "globalAverage"
)

// Order is a view direction.
type Order string

const (
	OrderAscending  Order = "asc"
	OrderDescending Order = "desc"
)

// ViewInput represents optional request members before defaults.
type ViewInput struct {
	Search   *string
	Sort     *Sort
	Order    *Order
	Page     *int64
	PageSize *int
}

// View is a fully defaulted and validated view.
type View struct {
	Search   string
	Sort     Sort
	Order    Order
	Page     int64
	PageSize int
}

// Item is one projected row retaining its complete-set rank.
type Item struct {
	Rank      int
	Person    PersonReference
	WorkCount int
}

// Page is one independent candidate view.
type Page struct {
	PositionCounts []PositionCount
	PositionKey    string
	WorkUnit       statistics.UnitKind
	Items          []Item
	Page           int64
	PageSize       int
	Total          int
}

// Builder describes the cache-facing build operation.
type Builder func(context.Context) (Core, error)

func clonePerson(value PersonReference) PersonReference {
	if value.NameCN != nil {
		name := *value.NameCN
		value.NameCN = &name
	}
	return value
}

// CloneCore transfers ownership across cache and request boundaries.
func CloneCore(value Core) Core {
	value.PositionCounts = append([]PositionCount(nil), value.PositionCounts...)
	value.Rows = append([]Row(nil), value.Rows...)
	for index := range value.Rows {
		value.Rows[index].Person = clonePerson(value.Rows[index].Person)
		value.Rows[index].GlobalAverage = cloneInt64(value.Rows[index].GlobalAverage)
		value.Rows[index].PersonalAverage = cloneInt64(value.Rows[index].PersonalAverage)
	}
	return value
}

func cloneInt64(value *int64) *int64 {
	if value == nil {
		return nil
	}
	result := *value
	return &result
}

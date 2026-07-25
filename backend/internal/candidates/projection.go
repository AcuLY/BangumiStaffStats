package candidates

import (
	"encoding/json"
	"errors"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

type candidatesSummary struct {
	PositionCounts []PositionCount `json:"positionCounts"`
}

type candidatesData struct {
	Summary     candidatesSummary `json:"summary"`
	PositionKey string            `json:"positionKey"`
	WorkUnit    string            `json:"workUnit"`
	Items       []candidateItem   `json:"items"`
}

type candidatePerson struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	NameCN *string `json:"nameCN"`
}

type candidateItem struct {
	Rank      int             `json:"rank"`
	Person    candidatePerson `json:"person"`
	WorkCount int             `json:"workCount"`
}

type globalCandidatesMeta struct {
	RequestID   string     `json:"requestId"`
	DataVersion string     `json:"dataVersion"`
	Pagination  Pagination `json:"pagination"`
}

type personalCandidatesMeta struct {
	RequestID   string              `json:"requestId"`
	DataVersion string              `json:"dataVersion"`
	Pagination  Pagination          `json:"pagination"`
	Collection  CollectionFreshness `json:"collection"`
}

type globalCandidatesEnvelope struct {
	Data candidatesData       `json:"data"`
	Meta globalCandidatesMeta `json:"meta"`
}

type personalCandidatesEnvelope struct {
	Data candidatesData         `json:"data"`
	Meta personalCandidatesMeta `json:"meta"`
}

func projectEnvelope(
	page Page,
	dataVersion string,
	scope string,
	collection *runtimecache.CollectionAccess,
) (Projection, error) {
	var freshness *CollectionFreshness
	if scope == "personal" {
		if collection == nil {
			return Projection{}, errors.New("candidates: missing collection freshness")
		}
		freshness = &CollectionFreshness{
			FetchedAt:    collection.FetchedAt.UTC(),
			Stale:        collection.Stale,
			WarningCodes: append([]string{}, collection.WarningCodes...),
		}
	}
	return NewProjection(page, dataVersion, scope, freshness)
}

// NewProjection constructs one ownership-safe success projection. It is the
// single boundary used by the service and by transport adapters.
func NewProjection(
	page Page,
	dataVersion string,
	scope string,
	collection *CollectionFreshness,
) (Projection, error) {
	if dataVersion == "" || page.PositionKey == "" ||
		page.Page < 1 || page.PageSize < 1 ||
		(scope != "global" && scope != "personal") ||
		(scope == "global" && collection != nil) ||
		(scope == "personal" && collection == nil) {
		return Projection{}, errors.New("candidates: invalid projection")
	}
	result := Projection{
		scope:       scope,
		dataVersion: dataVersion,
		page:        clonePage(page),
	}
	if collection != nil {
		result.collection = &CollectionFreshness{
			FetchedAt:    collection.FetchedAt.UTC(),
			Stale:        collection.Stale,
			WarningCodes: append([]string{}, collection.WarningCodes...),
		}
	}
	return result, nil
}

// MarshalEnvelope creates deterministic scope-specific JSON with collection
// omission by construction.
func (projection Projection) MarshalEnvelope(requestID string) ([]byte, error) {
	data := candidatesData{
		Summary: candidatesSummary{
			PositionCounts: append([]PositionCount{}, projection.page.PositionCounts...),
		},
		PositionKey: projection.page.PositionKey,
		WorkUnit:    string(projection.page.WorkUnit),
		Items:       make([]candidateItem, 0, len(projection.page.Items)),
	}
	for _, item := range projection.page.Items {
		data.Items = append(data.Items, candidateItem{
			Rank: item.Rank,
			Person: candidatePerson{
				ID:     item.Person.ID,
				Name:   item.Person.Name,
				NameCN: cloneString(item.Person.NameCN),
			},
			WorkCount: item.WorkCount,
		})
	}
	pagination := projection.Pagination()
	if projection.scope == "global" {
		return json.Marshal(globalCandidatesEnvelope{
			Data: data,
			Meta: globalCandidatesMeta{
				RequestID:   requestID,
				DataVersion: projection.dataVersion,
				Pagination:  pagination,
			},
		})
	}
	if projection.scope != "personal" || projection.collection == nil {
		return nil, errors.New("candidates: invalid projection")
	}
	return json.Marshal(personalCandidatesEnvelope{
		Data: data,
		Meta: personalCandidatesMeta{
			RequestID:   requestID,
			DataVersion: projection.dataVersion,
			Pagination:  pagination,
			Collection: CollectionFreshness{
				FetchedAt:    projection.collection.FetchedAt,
				Stale:        projection.collection.Stale,
				WarningCodes: append([]string{}, projection.collection.WarningCodes...),
			},
		},
	})
}

func clonePage(value Page) Page {
	value.PositionCounts = append([]PositionCount{}, value.PositionCounts...)
	value.Items = append([]Item{}, value.Items...)
	for index := range value.Items {
		value.Items[index].Person = clonePerson(value.Items[index].Person)
	}
	return value
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	copy := *value
	return &copy
}

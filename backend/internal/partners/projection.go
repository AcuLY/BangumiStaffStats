package partners

import (
	"encoding/json"
	"errors"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

type sourceWire struct {
	Person       PersonReference `json:"person"`
	PositionKeys []string        `json:"positionKeys"`
	Metrics      SourceMetrics   `json:"metrics"`
}

type globalPartnerWire struct {
	Person       PersonReference `json:"person"`
	PositionKeys []string        `json:"positionKeys"`
	Metrics      Metrics         `json:"metrics"`
}

type personalPartnerWire struct {
	Person       PersonReference `json:"person"`
	PositionKeys []string        `json:"positionKeys"`
	Metrics      Metrics         `json:"metrics"`
	Preference   Preference      `json:"preference"`
}

type globalItemWire struct {
	Rank int `json:"rank"`
	globalPartnerWire
}

type personalItemWire struct {
	Rank int `json:"rank"`
	personalPartnerWire
}

type globalLeaderWire struct {
	Metric Sort               `json:"metric"`
	Item   *globalPartnerWire `json:"item"`
}

type personalLeaderWire struct {
	Metric Sort                 `json:"metric"`
	Item   *personalPartnerWire `json:"item"`
}

type globalSummaryWire struct {
	PartnerCount int                `json:"partnerCount"`
	Leaders      []globalLeaderWire `json:"leaders"`
}

type personalSummaryWire struct {
	PartnerCount int                  `json:"partnerCount"`
	Leaders      []personalLeaderWire `json:"leaders"`
}

type globalDataWire struct {
	WorkUnit string            `json:"workUnit"`
	Source   sourceWire        `json:"source"`
	Summary  globalSummaryWire `json:"summary"`
	Items    []globalItemWire  `json:"items"`
}

type personalDataWire struct {
	WorkUnit string              `json:"workUnit"`
	Source   sourceWire          `json:"source"`
	Summary  personalSummaryWire `json:"summary"`
	Items    []personalItemWire  `json:"items"`
}

type globalMetaWire struct {
	RequestID   string     `json:"requestId"`
	DataVersion string     `json:"dataVersion"`
	Pagination  Pagination `json:"pagination"`
}

type personalMetaWire struct {
	RequestID   string              `json:"requestId"`
	DataVersion string              `json:"dataVersion"`
	Pagination  Pagination          `json:"pagination"`
	Collection  CollectionFreshness `json:"collection"`
}

type globalEnvelopeWire struct {
	Data globalDataWire `json:"data"`
	Meta globalMetaWire `json:"meta"`
}

type personalEnvelopeWire struct {
	Data personalDataWire `json:"data"`
	Meta personalMetaWire `json:"meta"`
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
			return Projection{}, errors.New("partners: missing collection freshness")
		}
		freshness = &CollectionFreshness{
			FetchedAt:    collection.FetchedAt.UTC(),
			Stale:        collection.Stale,
			WarningCodes: append([]string{}, collection.WarningCodes...),
		}
	}
	return NewProjection(page, dataVersion, scope, freshness)
}

// NewProjection constructs one ownership-safe success value.
func NewProjection(
	page Page,
	dataVersion string,
	scope string,
	collection *CollectionFreshness,
) (Projection, error) {
	if dataVersion == "" || page.Page < 1 || page.PageSize < 1 ||
		(scope != "global" && scope != "personal") ||
		(scope == "global" && collection != nil) ||
		(scope == "personal" && collection == nil) {
		return Projection{}, errors.New("partners: invalid projection")
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

// MarshalEnvelope creates deterministic scope-specific JSON. Global
// preference and collection omission is guaranteed by distinct wire types.
func (projection Projection) MarshalEnvelope(requestID string) ([]byte, error) {
	source := sourceWire{
		Person:       clonePerson(projection.page.Source.Person),
		PositionKeys: append([]string{}, projection.page.Source.PositionKeys...),
		Metrics: SourceMetrics{
			WorkCount:      projection.page.Source.Metrics.WorkCount,
			RatedWorkCount: projection.page.Source.Metrics.RatedWorkCount,
			Average:        cloneInt64(projection.page.Source.Metrics.Average),
		},
	}
	pagination := projection.Pagination()
	if projection.scope == "global" {
		data, err := globalData(projection.page, source)
		if err != nil {
			return nil, err
		}
		return json.Marshal(globalEnvelopeWire{
			Data: data,
			Meta: globalMetaWire{
				RequestID:   requestID,
				DataVersion: projection.dataVersion,
				Pagination:  pagination,
			},
		})
	}
	if projection.scope != "personal" || projection.collection == nil {
		return nil, errors.New("partners: invalid projection")
	}
	data, err := personalData(projection.page, source)
	if err != nil {
		return nil, err
	}
	return json.Marshal(personalEnvelopeWire{
		Data: data,
		Meta: personalMetaWire{
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

func globalData(page Page, source sourceWire) (globalDataWire, error) {
	leaders := make([]globalLeaderWire, 0, len(page.Summary.Leaders))
	for _, leader := range page.Summary.Leaders {
		if leader.Metric == SortPreference {
			return globalDataWire{}, errors.New("partners: global preference leader")
		}
		wire := globalLeaderWire{Metric: leader.Metric}
		if leader.Item != nil {
			item := toGlobalPartner(*leader.Item)
			wire.Item = &item
		}
		leaders = append(leaders, wire)
	}
	items := make([]globalItemWire, 0, len(page.Items))
	for _, item := range page.Items {
		items = append(items, globalItemWire{
			Rank:              item.Rank,
			globalPartnerWire: toGlobalPartner(item.PartnerCore),
		})
	}
	return globalDataWire{
		WorkUnit: string(page.WorkUnit),
		Source:   source,
		Summary: globalSummaryWire{
			PartnerCount: page.Summary.PartnerCount,
			Leaders:      leaders,
		},
		Items: items,
	}, nil
}

func personalData(page Page, source sourceWire) (personalDataWire, error) {
	leaders := make([]personalLeaderWire, 0, len(page.Summary.Leaders))
	for _, leader := range page.Summary.Leaders {
		wire := personalLeaderWire{Metric: leader.Metric}
		if leader.Item != nil {
			item, err := toPersonalPartner(*leader.Item)
			if err != nil {
				return personalDataWire{}, err
			}
			wire.Item = &item
		}
		leaders = append(leaders, wire)
	}
	items := make([]personalItemWire, 0, len(page.Items))
	for _, item := range page.Items {
		core, err := toPersonalPartner(item.PartnerCore)
		if err != nil {
			return personalDataWire{}, err
		}
		items = append(items, personalItemWire{
			Rank:                item.Rank,
			personalPartnerWire: core,
		})
	}
	return personalDataWire{
		WorkUnit: string(page.WorkUnit),
		Source:   source,
		Summary: personalSummaryWire{
			PartnerCount: page.Summary.PartnerCount,
			Leaders:      leaders,
		},
		Items: items,
	}, nil
}

func toGlobalPartner(value PartnerCore) globalPartnerWire {
	return globalPartnerWire{
		Person:       clonePerson(value.Person),
		PositionKeys: append([]string{}, value.PositionKeys...),
		Metrics:      cloneMetrics(value.Metrics),
	}
}

func toPersonalPartner(value PartnerCore) (personalPartnerWire, error) {
	if value.Preference == nil {
		return personalPartnerWire{}, errors.New("partners: personal preference missing")
	}
	return personalPartnerWire{
		Person:       clonePerson(value.Person),
		PositionKeys: append([]string{}, value.PositionKeys...),
		Metrics:      cloneMetrics(value.Metrics),
		Preference:   *clonePreference(value.Preference),
	}, nil
}

func cloneMetrics(value Metrics) Metrics {
	value.Average = cloneInt64(value.Average)
	value.Overall = cloneInt64(value.Overall)
	return value
}

func clonePage(value Page) Page {
	value.Source = cloneSource(value.Source)
	value.Summary.Leaders = cloneLeaders(value.Summary.Leaders)
	value.Items = append([]Item{}, value.Items...)
	for index := range value.Items {
		value.Items[index].PartnerCore = clonePartner(value.Items[index].PartnerCore)
	}
	return value
}

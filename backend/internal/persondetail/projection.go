package persondetail

import (
	"encoding/json"
	"errors"
)

type globalDetailMetrics struct {
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
	Overall        *int64 `json:"overall"`
}

type personalDetailMetrics struct {
	RatedWorkCount int    `json:"ratedWorkCount"`
	Average        *int64 `json:"average"`
	Overall        *int64 `json:"overall"`
	GlobalAverage  *int64 `json:"globalAverage"`
	Highest        *int64 `json:"highest"`
	Lowest         *int64 `json:"lowest"`
}

type globalDetailTags struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
}

type personalDetailTags struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
	Personal  []TagCount `json:"personal"`
}

type globalDetailRatings struct {
	Global RatingDistribution `json:"global"`
}

type personalDetailRatings struct {
	Global   RatingDistribution `json:"global"`
	Personal RatingDistribution `json:"personal"`
}

type detailData struct {
	Person     PersonProfile `json:"person"`
	Summary    Summary       `json:"summary"`
	Metrics    any           `json:"metrics"`
	Tags       any           `json:"tags"`
	Ratings    any           `json:"ratings"`
	Preference *Preference   `json:"preference,omitempty"`
	Section    Section       `json:"section"`
	Items      any           `json:"items"`
}

type globalDetailMeta struct {
	RequestID   string     `json:"requestId"`
	DataVersion string     `json:"dataVersion"`
	Pagination  Pagination `json:"pagination"`
}

type personalDetailMeta struct {
	RequestID   string              `json:"requestId"`
	DataVersion string              `json:"dataVersion"`
	Pagination  Pagination          `json:"pagination"`
	Collection  CollectionFreshness `json:"collection"`
}

type globalDetailEnvelope struct {
	Data detailData       `json:"data"`
	Meta globalDetailMeta `json:"meta"`
}

type personalDetailEnvelope struct {
	Data detailData         `json:"data"`
	Meta personalDetailMeta `json:"meta"`
}

type subjectWorkEnvelope struct {
	Kind          string              `json:"kind"`
	Key           string              `json:"key"`
	Subject       SubjectReference    `json:"subject"`
	MetaTags      []string            `json:"metaTags"`
	GlobalScore   *int64              `json:"globalScore"`
	Personal      *CollectionEvidence `json:"personal,omitempty"`
	Contributions []any               `json:"contributions"`
}

type globalSeriesWorkEnvelope struct {
	Kind             string           `json:"kind"`
	Key              string           `json:"key"`
	SeriesID         int64            `json:"seriesId"`
	Representative   SubjectReference `json:"representative"`
	MatchedWorkCount int              `json:"matchedWorkCount"`
	MemberCount      int              `json:"memberCount"`
	Members          []SeriesMember   `json:"members"`
	GlobalScore      *int64           `json:"globalScore"`
	Contributions    []any            `json:"contributions"`
}

type personalSeriesWorkEnvelope struct {
	Kind                      string           `json:"kind"`
	Key                       string           `json:"key"`
	SeriesID                  int64            `json:"seriesId"`
	Representative            SubjectReference `json:"representative"`
	MatchedWorkCount          int              `json:"matchedWorkCount"`
	MemberCount               int              `json:"memberCount"`
	Members                   []SeriesMember   `json:"members"`
	GlobalScore               *int64           `json:"globalScore"`
	PersonalScore             *int64           `json:"personalScore"`
	LatestCollectionUpdatedAt *string          `json:"latestCollectionUpdatedAt"`
	Contributions             []any            `json:"contributions"`
}

type staffContributionEnvelope struct {
	Kind             string `json:"kind"`
	PositionKey      string `json:"positionKey"`
	ExactPositionKey string `json:"exactPositionKey"`
	Provenance       string `json:"provenance"`
	WorkCount        *int   `json:"workCount,omitempty"`
}

type castContributionEnvelope struct {
	Kind        string             `json:"kind"`
	PositionKey string             `json:"positionKey"`
	Character   CharacterReference `json:"character"`
	RoleType    int64              `json:"roleType"`
	RoleLabel   string             `json:"roleLabel"`
	Provenance  string             `json:"provenance"`
	WorkCount   *int               `json:"workCount,omitempty"`
}

// MarshalEnvelope creates deterministic scope-specific JSON. Global output
// cannot represent collection or personal evidence by construction.
func (projection Projection) MarshalEnvelope(requestID string) ([]byte, error) {
	if requestID == "" ||
		!dataVersionPattern.MatchString(projection.Core.DataVersion) ||
		projection.Pagination.Page < 1 ||
		projection.Pagination.PageSize < 1 {
		return nil, errors.New("persondetail: invalid projection")
	}
	items, err := projectionItems(projection)
	if err != nil {
		return nil, err
	}
	core := projection.Core
	data := detailData{
		Person:  clonePersonProfile(core.Person),
		Summary: core.Summary,
		Section: projection.Section,
		Items:   items,
	}
	data.Summary.CharacterCount = cloneInt(core.Summary.CharacterCount)
	switch core.Scope {
	case "global":
		if projection.Collection != nil {
			return nil, errors.New("persondetail: global projection has collection")
		}
		data.Metrics = globalDetailMetrics{
			RatedWorkCount: core.Metrics.RatedWorkCount,
			Average:        cloneInt64(core.Metrics.Average),
			Overall:        cloneInt64(core.Metrics.Overall),
		}
		data.Tags = globalDetailTags{
			Meta:      cloneSlice(core.Tags.Meta),
			Community: cloneSlice(core.Tags.Community),
		}
		data.Ratings = globalDetailRatings{
			Global: cloneRatingDistribution(core.Ratings.Global),
		}
		return json.Marshal(globalDetailEnvelope{
			Data: data,
			Meta: globalDetailMeta{
				RequestID:   requestID,
				DataVersion: core.DataVersion,
				Pagination:  projection.Pagination,
			},
		})
	case "personal":
		if projection.Collection == nil ||
			core.Tags.Personal == nil ||
			core.Ratings.Personal == nil ||
			core.Preference == nil {
			return nil, errors.New("persondetail: incomplete personal projection")
		}
		data.Metrics = personalDetailMetrics{
			RatedWorkCount: core.Metrics.RatedWorkCount,
			Average:        cloneInt64(core.Metrics.Average),
			Overall:        cloneInt64(core.Metrics.Overall),
			GlobalAverage:  cloneInt64(core.Metrics.GlobalAverage),
			Highest:        cloneInt64(core.Metrics.Highest),
			Lowest:         cloneInt64(core.Metrics.Lowest),
		}
		data.Tags = personalDetailTags{
			Meta:      cloneSlice(core.Tags.Meta),
			Community: cloneSlice(core.Tags.Community),
			Personal:  cloneSlice(core.Tags.Personal),
		}
		data.Ratings = personalDetailRatings{
			Global:   cloneRatingDistribution(core.Ratings.Global),
			Personal: cloneRatingDistribution(*core.Ratings.Personal),
		}
		data.Preference = clonePreference(core.Preference)
		return json.Marshal(personalDetailEnvelope{
			Data: data,
			Meta: personalDetailMeta{
				RequestID:   requestID,
				DataVersion: core.DataVersion,
				Pagination:  projection.Pagination,
				Collection: CollectionFreshness{
					FetchedAt:    projection.Collection.FetchedAt.UTC(),
					Stale:        projection.Collection.Stale,
					WarningCodes: cloneSlice(projection.Collection.WarningCodes),
				},
			},
		})
	default:
		return nil, errors.New("persondetail: invalid projection scope")
	}
}

func projectionItems(projection Projection) (any, error) {
	switch projection.Section {
	case SectionWorks:
		if projection.Characters != nil {
			return nil, errors.New("persondetail: works projection contains characters")
		}
		return projectWorkEnvelopes(projection.Works, projection.Core.Scope)
	case SectionCharacters:
		if projection.Works != nil {
			return nil, errors.New("persondetail: character projection contains works")
		}
		return cloneCharacters(projection.Characters), nil
	default:
		return nil, errors.New("persondetail: invalid projection section")
	}
}

func projectWorkEnvelopes(values []WorkItem, scope string) ([]any, error) {
	result := make([]any, 0, len(values))
	for _, value := range values {
		switch {
		case value.Kind == "subject" && value.Subject != nil && value.Series == nil:
			subject := value.Subject
			if scope == "personal" && subject.Personal == nil ||
				scope == "global" && subject.Personal != nil {
				return nil, errors.New("persondetail: subject scope evidence mismatch")
			}
			contributions, err := contributionEnvelopes(subject.Contributions)
			if err != nil {
				return nil, err
			}
			result = append(result, subjectWorkEnvelope{
				Kind:          "subject",
				Key:           subject.Key,
				Subject:       cloneSubjectReference(subject.Subject),
				MetaTags:      cloneSlice(subject.MetaTags),
				GlobalScore:   cloneInt64(subject.GlobalScore),
				Personal:      cloneCollectionEvidence(subject.Personal),
				Contributions: contributions,
			})
		case value.Kind == "series" && value.Series != nil && value.Subject == nil:
			series := value.Series
			contributions, err := contributionEnvelopes(series.Contributions)
			if err != nil {
				return nil, err
			}
			members := cloneSlice(series.Members)
			for index := range members {
				members[index].SubjectReference = cloneSubjectReference(
					members[index].SubjectReference,
				)
			}
			if scope == "global" {
				if series.PersonalScore != nil ||
					series.LatestCollectionUpdatedAt != nil {
					return nil, errors.New("persondetail: global series has personal evidence")
				}
				result = append(result, globalSeriesWorkEnvelope{
					Kind:             "series",
					Key:              series.Key,
					SeriesID:         series.SeriesID,
					Representative:   cloneSubjectReference(series.Representative),
					MatchedWorkCount: series.MatchedWorkCount,
					MemberCount:      series.MemberCount,
					Members:          members,
					GlobalScore:      cloneInt64(series.GlobalScore),
					Contributions:    contributions,
				})
			} else if scope == "personal" {
				result = append(result, personalSeriesWorkEnvelope{
					Kind:                      "series",
					Key:                       series.Key,
					SeriesID:                  series.SeriesID,
					Representative:            cloneSubjectReference(series.Representative),
					MatchedWorkCount:          series.MatchedWorkCount,
					MemberCount:               series.MemberCount,
					Members:                   members,
					GlobalScore:               cloneInt64(series.GlobalScore),
					PersonalScore:             cloneInt64(series.PersonalScore),
					LatestCollectionUpdatedAt: cloneString(series.LatestCollectionUpdatedAt),
					Contributions:             contributions,
				})
			} else {
				return nil, errors.New("persondetail: invalid work scope")
			}
		default:
			return nil, errors.New("persondetail: invalid work union")
		}
	}
	return result, nil
}

func contributionEnvelopes(values []Contribution) ([]any, error) {
	result := make([]any, 0, len(values))
	for _, value := range values {
		switch {
		case value.Kind == "staff" && value.Staff != nil && value.Cast == nil:
			result = append(result, staffContributionEnvelope{
				Kind:             "staff",
				PositionKey:      value.Staff.PositionKey,
				ExactPositionKey: value.Staff.ExactPositionKey,
				Provenance:       value.Staff.Provenance,
				WorkCount:        cloneInt(value.Staff.WorkCount),
			})
		case value.Kind == "cast" && value.Cast != nil && value.Staff == nil:
			result = append(result, castContributionEnvelope{
				Kind:        "cast",
				PositionKey: value.Cast.PositionKey,
				Character:   cloneCharacterReference(value.Cast.Character),
				RoleType:    value.Cast.RoleType,
				RoleLabel:   value.Cast.RoleLabel,
				Provenance:  value.Cast.Provenance,
				WorkCount:   cloneInt(value.Cast.WorkCount),
			})
		default:
			return nil, errors.New("persondetail: invalid contribution union")
		}
	}
	return result, nil
}

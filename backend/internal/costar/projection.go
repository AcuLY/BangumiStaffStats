package costar

import (
	"encoding/json"
	"errors"
)

type globalSummaryWire struct {
	UnionWorkCount  int    `json:"unionWorkCount"`
	CommonWorkCount int    `json:"commonWorkCount"`
	RatedWorkCount  int    `json:"ratedWorkCount"`
	Average         *int64 `json:"average"`
}

type personalSummaryWire struct {
	UnionWorkCount       int    `json:"unionWorkCount"`
	CommonWorkCount      int    `json:"commonWorkCount"`
	RatedWorkCount       int    `json:"ratedWorkCount"`
	Average              *int64 `json:"average"`
	GlobalRatedWorkCount int    `json:"globalRatedWorkCount"`
	GlobalAverage        *int64 `json:"globalAverage"`
	Highest              *int64 `json:"highest"`
	Lowest               *int64 `json:"lowest"`
}

type globalTagsWire struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
}

type personalTagsWire struct {
	Meta      []TagCount `json:"meta"`
	Community []TagCount `json:"community"`
	Personal  []TagCount `json:"personal"`
}

type globalRatingDatasetWire struct {
	Kind     string             `json:"kind"`
	PersonID *int64             `json:"personId,omitempty"`
	Global   RatingDistribution `json:"global"`
}

type personalRatingDatasetWire struct {
	Kind     string             `json:"kind"`
	PersonID *int64             `json:"personId,omitempty"`
	Personal RatingDistribution `json:"personal"`
	Global   RatingDistribution `json:"global"`
}

type globalRatingsWire struct {
	Datasets []globalRatingDatasetWire `json:"datasets"`
}

type personalRatingsWire struct {
	Datasets []personalRatingDatasetWire `json:"datasets"`
}

type matrixWire struct {
	Pairs []MatrixPair `json:"pairs"`
}

type globalDataWire struct {
	Kind         string            `json:"kind"`
	WorkUnit     string            `json:"workUnit"`
	Participants []ParticipantCore `json:"participants"`
	Summary      globalSummaryWire `json:"summary"`
	Tags         globalTagsWire    `json:"tags"`
	Ratings      globalRatingsWire `json:"ratings"`
	Matrix       *matrixWire       `json:"matrix,omitempty"`
	Items        []any             `json:"items"`
}

type personalDataWire struct {
	Kind         string              `json:"kind"`
	WorkUnit     string              `json:"workUnit"`
	Participants []ParticipantCore   `json:"participants"`
	Summary      personalSummaryWire `json:"summary"`
	Tags         personalTagsWire    `json:"tags"`
	Ratings      personalRatingsWire `json:"ratings"`
	Preference   Preference          `json:"preference"`
	Matrix       *matrixWire         `json:"matrix,omitempty"`
	Items        []any               `json:"items"`
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

type globalSubjectWorkWire struct {
	Kind         string                   `json:"kind"`
	Key          string                   `json:"key"`
	Subject      SubjectReference         `json:"subject"`
	MetaTags     []string                 `json:"metaTags"`
	GlobalScore  *int64                   `json:"globalScore"`
	Participants []subjectParticipantWire `json:"participants"`
}

type personalSubjectWorkWire struct {
	Kind         string                   `json:"kind"`
	Key          string                   `json:"key"`
	Subject      SubjectReference         `json:"subject"`
	MetaTags     []string                 `json:"metaTags"`
	GlobalScore  *int64                   `json:"globalScore"`
	Personal     CollectionEvidence       `json:"personal"`
	Participants []subjectParticipantWire `json:"participants"`
}

type seriesMemberWire struct {
	ID      int64   `json:"id"`
	Name    string  `json:"name"`
	NameCN  *string `json:"nameCN"`
	Date    *string `json:"date"`
	Matched bool    `json:"matched"`
}

type globalSeriesWorkWire struct {
	Kind             string                  `json:"kind"`
	Key              string                  `json:"key"`
	SeriesID         int64                   `json:"seriesId"`
	Representative   SubjectReference        `json:"representative"`
	MatchedWorkCount int                     `json:"matchedWorkCount"`
	MemberCount      int                     `json:"memberCount"`
	Members          []seriesMemberWire      `json:"members"`
	GlobalScore      *int64                  `json:"globalScore"`
	Participants     []seriesParticipantWire `json:"participants"`
}

type personalSeriesWorkWire struct {
	Kind                      string                  `json:"kind"`
	Key                       string                  `json:"key"`
	SeriesID                  int64                   `json:"seriesId"`
	Representative            SubjectReference        `json:"representative"`
	MatchedWorkCount          int                     `json:"matchedWorkCount"`
	MemberCount               int                     `json:"memberCount"`
	Members                   []seriesMemberWire      `json:"members"`
	GlobalScore               *int64                  `json:"globalScore"`
	PersonalScore             *int64                  `json:"personalScore"`
	LatestCollectionUpdatedAt *string                 `json:"latestCollectionUpdatedAt"`
	Participants              []seriesParticipantWire `json:"participants"`
}

type subjectParticipantWire struct {
	PersonID int64 `json:"personId"`
	Credits  []any `json:"credits"`
}

type seriesParticipantWire struct {
	PersonID  int64 `json:"personId"`
	WorkCount int   `json:"workCount"`
	Credits   []any `json:"credits"`
}

type staffCreditWire struct {
	Kind             string `json:"kind"`
	PositionKey      string `json:"positionKey"`
	ExactPositionKey string `json:"exactPositionKey"`
	Provenance       string `json:"provenance"`
	WorkCount        *int   `json:"workCount,omitempty"`
}

type castCreditWire struct {
	Kind        string             `json:"kind"`
	PositionKey string             `json:"positionKey"`
	Character   CharacterReference `json:"character"`
	RoleType    int64              `json:"roleType"`
	RoleLabel   string             `json:"roleLabel"`
	Provenance  string             `json:"provenance"`
	WorkCount   *int               `json:"workCount,omitempty"`
}

// Scope reports global or personal.
func (projection Projection) Scope() string { return projection.Core.Scope }

// DataVersion returns the immutable Archive identity used by this result.
func (projection Projection) DataVersion() string {
	return projection.Core.DataVersion
}

// PageMetadata returns an independent pagination copy.
func (projection Projection) PageMetadata() Pagination {
	return projection.Pagination
}

// MarshalEnvelope creates deterministic scope- and topology-specific JSON.
// Global output cannot represent personal evidence, and pair output cannot
// represent a group matrix, by construction.
func (projection Projection) MarshalEnvelope(requestID string) ([]byte, error) {
	if requestID == "" ||
		!dataVersionPattern.MatchString(projection.Core.DataVersion) ||
		projection.Pagination.Page < 1 ||
		projection.Pagination.PageSize < 1 {
		return nil, errors.New("costar: invalid projection")
	}
	if err := validateCore(projection.Core); err != nil {
		return nil, err
	}
	items, err := projectWorkWires(projection.Items, projection.Core.Scope)
	if err != nil {
		return nil, err
	}
	participants := cloneSlice(projection.Core.Participants)
	for index := range participants {
		participants[index] = cloneParticipant(participants[index])
	}
	var matrix *matrixWire
	if projection.Core.Kind == "group" {
		matrix = &matrixWire{Pairs: cloneSlice(projection.Core.Matrix)}
		for index := range matrix.Pairs {
			matrix.Pairs[index].Metrics = cloneMetrics(matrix.Pairs[index].Metrics)
		}
	}
	switch projection.Core.Scope {
	case "global":
		if projection.Collection != nil {
			return nil, errors.New("costar: global projection has collection")
		}
		datasets, err := globalDatasetWires(projection.Core.Ratings)
		if err != nil {
			return nil, err
		}
		return json.Marshal(globalEnvelopeWire{
			Data: globalDataWire{
				Kind:         projection.Core.Kind,
				WorkUnit:     string(projection.Core.WorkUnit),
				Participants: participants,
				Summary: globalSummaryWire{
					UnionWorkCount:  projection.Core.Summary.UnionWorkCount,
					CommonWorkCount: projection.Core.Summary.CommonWorkCount,
					RatedWorkCount:  projection.Core.Summary.RatedWorkCount,
					Average:         cloneInt64(projection.Core.Summary.Average),
				},
				Tags: globalTagsWire{
					Meta:      cloneSlice(projection.Core.Tags.Meta),
					Community: cloneSlice(projection.Core.Tags.Community),
				},
				Ratings: globalRatingsWire{Datasets: datasets},
				Matrix:  matrix,
				Items:   items,
			},
			Meta: globalMetaWire{
				RequestID:   requestID,
				DataVersion: projection.Core.DataVersion,
				Pagination:  projection.Pagination,
			},
		})
	case "personal":
		if projection.Collection == nil ||
			projection.Core.Summary.GlobalRatedWorkCount == nil ||
			projection.Core.Tags.Personal == nil ||
			projection.Core.Preference == nil {
			return nil, errors.New("costar: incomplete personal projection")
		}
		datasets, err := personalDatasetWires(projection.Core.Ratings)
		if err != nil {
			return nil, err
		}
		return json.Marshal(personalEnvelopeWire{
			Data: personalDataWire{
				Kind:         projection.Core.Kind,
				WorkUnit:     string(projection.Core.WorkUnit),
				Participants: participants,
				Summary: personalSummaryWire{
					UnionWorkCount:       projection.Core.Summary.UnionWorkCount,
					CommonWorkCount:      projection.Core.Summary.CommonWorkCount,
					RatedWorkCount:       projection.Core.Summary.RatedWorkCount,
					Average:              cloneInt64(projection.Core.Summary.Average),
					GlobalRatedWorkCount: *projection.Core.Summary.GlobalRatedWorkCount,
					GlobalAverage:        cloneInt64(projection.Core.Summary.GlobalAverage),
					Highest:              cloneInt64(projection.Core.Summary.Highest),
					Lowest:               cloneInt64(projection.Core.Summary.Lowest),
				},
				Tags: personalTagsWire{
					Meta:      cloneSlice(projection.Core.Tags.Meta),
					Community: cloneSlice(projection.Core.Tags.Community),
					Personal:  cloneSlice(projection.Core.Tags.Personal),
				},
				Ratings:    personalRatingsWire{Datasets: datasets},
				Preference: *clonePreference(projection.Core.Preference),
				Matrix:     matrix,
				Items:      items,
			},
			Meta: personalMetaWire{
				RequestID:   requestID,
				DataVersion: projection.Core.DataVersion,
				Pagination:  projection.Pagination,
				Collection: CollectionFreshness{
					FetchedAt:    projection.Collection.FetchedAt.UTC(),
					Stale:        projection.Collection.Stale,
					WarningCodes: cloneSlice(projection.Collection.WarningCodes),
				},
			},
		})
	default:
		return nil, errors.New("costar: invalid projection scope")
	}
}

func globalDatasetWires(
	values []RatingDataset,
) ([]globalRatingDatasetWire, error) {
	result := make([]globalRatingDatasetWire, 0, len(values))
	for _, value := range values {
		if value.Personal != nil ||
			(value.Kind == "common" && value.PersonID != nil) ||
			(value.Kind == "participant" && value.PersonID == nil) {
			return nil, errors.New("costar: invalid global rating dataset")
		}
		result = append(result, globalRatingDatasetWire{
			Kind:     value.Kind,
			PersonID: cloneInt64(value.PersonID),
			Global:   cloneRatingDistribution(value.Global),
		})
	}
	return result, nil
}

func personalDatasetWires(
	values []RatingDataset,
) ([]personalRatingDatasetWire, error) {
	result := make([]personalRatingDatasetWire, 0, len(values))
	for _, value := range values {
		if value.Personal == nil ||
			(value.Kind == "common" && value.PersonID != nil) ||
			(value.Kind == "participant" && value.PersonID == nil) {
			return nil, errors.New("costar: invalid personal rating dataset")
		}
		result = append(result, personalRatingDatasetWire{
			Kind:     value.Kind,
			PersonID: cloneInt64(value.PersonID),
			Personal: cloneRatingDistribution(*value.Personal),
			Global:   cloneRatingDistribution(value.Global),
		})
	}
	return result, nil
}

func projectWorkWires(values []WorkItem, scope string) ([]any, error) {
	result := make([]any, 0, len(values))
	for _, value := range values {
		switch {
		case value.Kind == "subject" && value.Subject != nil && value.Series == nil:
			participants, err := subjectParticipantWires(value.Subject.Participants)
			if err != nil {
				return nil, err
			}
			if scope == "global" {
				if value.Subject.Personal != nil {
					return nil, errors.New("costar: global subject has personal evidence")
				}
				result = append(result, globalSubjectWorkWire{
					Kind:         "subject",
					Key:          value.Subject.Key,
					Subject:      cloneSubject(value.Subject.Subject),
					MetaTags:     cloneSlice(value.Subject.MetaTags),
					GlobalScore:  cloneInt64(value.Subject.GlobalScore),
					Participants: participants,
				})
			} else if scope == "personal" {
				if value.Subject.Personal == nil {
					return nil, errors.New("costar: personal subject lacks collection evidence")
				}
				result = append(result, personalSubjectWorkWire{
					Kind:         "subject",
					Key:          value.Subject.Key,
					Subject:      cloneSubject(value.Subject.Subject),
					MetaTags:     cloneSlice(value.Subject.MetaTags),
					GlobalScore:  cloneInt64(value.Subject.GlobalScore),
					Personal:     *cloneCollectionEvidence(value.Subject.Personal),
					Participants: participants,
				})
			} else {
				return nil, errors.New("costar: invalid work scope")
			}
		case value.Kind == "series" && value.Series != nil && value.Subject == nil:
			participants, err := seriesParticipantWires(value.Series.Participants)
			if err != nil {
				return nil, err
			}
			members := make([]seriesMemberWire, len(value.Series.Members))
			for index, member := range value.Series.Members {
				members[index] = seriesMemberWire{
					ID:      member.ID,
					Name:    member.Name,
					NameCN:  cloneString(member.NameCN),
					Date:    cloneString(member.Date),
					Matched: member.Matched,
				}
			}
			if scope == "global" {
				if value.Series.PersonalScore != nil ||
					value.Series.LatestCollectionUpdatedAt != nil {
					return nil, errors.New("costar: global series has personal evidence")
				}
				result = append(result, globalSeriesWorkWire{
					Kind:             "series",
					Key:              value.Series.Key,
					SeriesID:         value.Series.SeriesID,
					Representative:   cloneSubject(value.Series.Representative),
					MatchedWorkCount: value.Series.MatchedWorkCount,
					MemberCount:      value.Series.MemberCount,
					Members:          members,
					GlobalScore:      cloneInt64(value.Series.GlobalScore),
					Participants:     participants,
				})
			} else if scope == "personal" {
				result = append(result, personalSeriesWorkWire{
					Kind:                      "series",
					Key:                       value.Series.Key,
					SeriesID:                  value.Series.SeriesID,
					Representative:            cloneSubject(value.Series.Representative),
					MatchedWorkCount:          value.Series.MatchedWorkCount,
					MemberCount:               value.Series.MemberCount,
					Members:                   members,
					GlobalScore:               cloneInt64(value.Series.GlobalScore),
					PersonalScore:             cloneInt64(value.Series.PersonalScore),
					LatestCollectionUpdatedAt: cloneString(value.Series.LatestCollectionUpdatedAt),
					Participants:              participants,
				})
			} else {
				return nil, errors.New("costar: invalid work scope")
			}
		default:
			return nil, errors.New("costar: invalid work union")
		}
	}
	return result, nil
}

func subjectParticipantWires(
	values []WorkParticipant,
) ([]subjectParticipantWire, error) {
	result := make([]subjectParticipantWire, 0, len(values))
	for _, value := range values {
		if value.WorkCount != nil {
			return nil, errors.New("costar: subject participant has work count")
		}
		credits, err := creditWires(value.Credits, false)
		if err != nil {
			return nil, err
		}
		result = append(result, subjectParticipantWire{
			PersonID: value.PersonID,
			Credits:  credits,
		})
	}
	return result, nil
}

func seriesParticipantWires(
	values []WorkParticipant,
) ([]seriesParticipantWire, error) {
	result := make([]seriesParticipantWire, 0, len(values))
	for _, value := range values {
		if value.WorkCount == nil || *value.WorkCount < 1 {
			return nil, errors.New("costar: series participant lacks work count")
		}
		credits, err := creditWires(value.Credits, true)
		if err != nil {
			return nil, err
		}
		result = append(result, seriesParticipantWire{
			PersonID:  value.PersonID,
			WorkCount: *value.WorkCount,
			Credits:   credits,
		})
	}
	return result, nil
}

func creditWires(values []Contribution, series bool) ([]any, error) {
	result := make([]any, 0, len(values))
	for _, value := range values {
		switch {
		case value.Kind == "staff" && value.Staff != nil && value.Cast == nil:
			if (series && value.Staff.WorkCount == nil) ||
				(!series && value.Staff.WorkCount != nil) {
				return nil, errors.New("costar: staff credit work count mismatch")
			}
			result = append(result, staffCreditWire{
				Kind:             "staff",
				PositionKey:      value.Staff.PositionKey,
				ExactPositionKey: value.Staff.ExactPositionKey,
				Provenance:       value.Staff.Provenance,
				WorkCount:        cloneInt(value.Staff.WorkCount),
			})
		case value.Kind == "cast" && value.Cast != nil && value.Staff == nil:
			if (series && value.Cast.WorkCount == nil) ||
				(!series && value.Cast.WorkCount != nil) {
				return nil, errors.New("costar: cast credit work count mismatch")
			}
			result = append(result, castCreditWire{
				Kind:        "cast",
				PositionKey: value.Cast.PositionKey,
				Character:   cloneCharacter(value.Cast.Character),
				RoleType:    value.Cast.RoleType,
				RoleLabel:   value.Cast.RoleLabel,
				Provenance:  value.Cast.Provenance,
				WorkCount:   cloneInt(value.Cast.WorkCount),
			})
		default:
			return nil, errors.New("costar: invalid credit union")
		}
	}
	return result, nil
}

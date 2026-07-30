package statistics

import (
	"encoding/json"
	"fmt"
	"math/big"
	"strconv"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// UnitKind identifies the statistical observation boundary.
type UnitKind string

const (
	UnitSubject UnitKind = "subject"
	UnitSeries  UnitKind = "series"
)

// Direction changes only a sort profile's primary key.
type Direction string

const (
	Ascending  Direction = "asc"
	Descending Direction = "desc"
)

// Rational is a reduced exact rational using canonical base-10 integer
// strings. The representation remains exact beyond int64 and JavaScript's
// safe-integer range. Denominator is always positive and zero is 0/1.
type Rational struct {
	Numerator   string `json:"numerator"`
	Denominator string `json:"denominator"`
}

func newRational(numerator, denominator *big.Int) (Rational, error) {
	if denominator.Sign() == 0 {
		return Rational{}, outcome(CodeInputInvalid)
	}
	value := new(big.Rat).SetFrac(numerator, denominator)
	return Rational{
		Numerator:   value.Num().String(),
		Denominator: value.Denom().String(),
	}, nil
}

func (r Rational) rat() (*big.Rat, error) {
	numerator, numeratorOK := new(big.Int).SetString(r.Numerator, 10)
	denominator, denominatorOK := new(big.Int).SetString(r.Denominator, 10)
	if !numeratorOK || !denominatorOK ||
		!canonicalIntegerString(r.Numerator, true) ||
		!canonicalIntegerString(r.Denominator, false) ||
		denominator.Sign() <= 0 {
		return nil, outcome(CodeInputInvalid)
	}
	value := new(big.Rat).SetFrac(numerator, denominator)
	if value.Num().String() != r.Numerator ||
		value.Denom().String() != r.Denominator {
		return nil, outcome(CodeInputInvalid)
	}
	return value, nil
}

// Compare returns -1, 0, or 1 using overflow-safe exact comparison.
func (r Rational) Compare(other Rational) (int, error) {
	left, err := r.rat()
	if err != nil {
		return 0, err
	}
	right, err := other.rat()
	if err != nil {
		return 0, err
	}
	return left.Cmp(right), nil
}

// MarshalJSON keeps exact rational evidence language-neutral.
func (r Rational) MarshalJSON() ([]byte, error) {
	if _, err := r.rat(); err != nil {
		return nil, err
	}
	return json.Marshal(struct {
		Numerator   string `json:"numerator"`
		Denominator string `json:"denominator"`
	}{
		Numerator:   r.Numerator,
		Denominator: r.Denominator,
	})
}

// UnmarshalJSON accepts canonical integer strings and the corpus's existing
// safe integer tokens. In-memory and emitted JSON always use strings.
func (r *Rational) UnmarshalJSON(data []byte) error {
	if r == nil {
		return outcome(CodeInputInvalid)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(data, &fields); err != nil || len(fields) != 2 {
		return outcome(CodeInputInvalid)
	}
	numeratorRaw, numeratorExists := fields["numerator"]
	denominatorRaw, denominatorExists := fields["denominator"]
	if !numeratorExists || !denominatorExists {
		return outcome(CodeInputInvalid)
	}
	numerator, err := exactIntegerJSONText(numeratorRaw, true)
	if err != nil {
		return err
	}
	denominator, err := exactIntegerJSONText(denominatorRaw, false)
	if err != nil {
		return err
	}
	candidate := Rational{Numerator: numerator, Denominator: denominator}
	if _, err := candidate.rat(); err != nil {
		return err
	}
	*r = candidate
	return nil
}

func exactIntegerJSONText(data []byte, signed bool) (string, error) {
	var value string
	if len(data) >= 2 && data[0] == '"' {
		if err := json.Unmarshal(data, &value); err != nil {
			return "", outcome(CodeInputInvalid)
		}
	} else {
		value = string(data)
	}
	if !canonicalIntegerString(value, signed) {
		return "", outcome(CodeInputInvalid)
	}
	return value, nil
}

func canonicalIntegerString(value string, signed bool) bool {
	if value == "0" {
		return true
	}
	start := 0
	if signed && len(value) > 1 && value[0] == '-' {
		start = 1
	}
	if start >= len(value) || value[start] == '0' {
		return false
	}
	for index := start; index < len(value); index++ {
		if value[index] < '0' || value[index] > '9' {
			return false
		}
	}
	return true
}

// RatingInput is one subject or already-normalized series observation.
// Nil and exact zero Score are unrated.
type RatingInput struct {
	UnitID int64
	Score  *float64
	Date   *string
}

// TimelinePoint is one exact subject-mode quarter.
type TimelinePoint struct {
	Year              int   `json:"year"`
	Quarter           int   `json:"quarter"`
	RatedUnitCount    int   `json:"ratedUnitCount"`
	AverageHundredths int64 `json:"averageHundredths"`
}

// RatingSummary is a complete rating aggregate. Nil numeric pointers mean
// there is no valid rated evidence.
type RatingSummary struct {
	UnitCount         int             `json:"unitCount"`
	RatedUnitCount    int             `json:"ratedUnitCount"`
	AverageHundredths *int64          `json:"averageHundredths"`
	OverallHundredths *int64          `json:"overallHundredths"`
	RatingCount       int64           `json:"ratingCount"`
	Distribution      [10]int         `json:"distribution"`
	Timeline          []TimelinePoint `json:"timeline"`
	ValidRatedUnitIDs []int64         `json:"validRatedUnitIds"`
}

// SubjectFact is the validated statistical view of one Archive/query Subject.
type SubjectFact struct {
	SubjectID        int64
	SubjectType      string
	AirDate          *string
	AirDatePrecision *int64
	GlobalScore      *float64
	RatingBuckets    []query.RatingBucket
}

// PersonalFact is one admitted immutable personal rating/update fact.
type PersonalFact struct {
	SubjectID     int64
	PersonalScore *float64
	UpdatedAt     string
}

// Relation is one directed Archive relation.
type Relation struct {
	SourceID   int64
	SourceType string
	TargetID   int64
	TargetType string
	RelationID int64
}

// Component is one immutable versioned series component.
type Component struct {
	SeriesID         int64   `json:"seriesId"`
	MemberIDs        []int64 `json:"memberIds"`
	RepresentativeID int64   `json:"representativeId"`
}

// Unit is one canonical subject or series statistical unit.
type Unit struct {
	Kind              UnitKind
	UnitID            int64
	CompleteMemberIDs []int64
	MatchedMemberIDs  []int64
	GlobalScore       *float64
	PersonalScore     *float64
	AirDate           *string
	LatestUpdatedAt   string
	Contributions     []query.Contribution
}

// PreferenceSummary retains all exact personal evidence.
type PreferenceSummary struct {
	ComparableCount       int              `json:"comparableCount"`
	ComparableSeriesCount int              `json:"comparableSeriesCount"`
	EffectiveEvidence     int              `json:"effectiveEvidence"`
	Mean                  *Rational        `json:"mean"`
	EvidenceWeight        Rational         `json:"evidenceWeight"`
	Score                 *Rational        `json:"score"`
	SourceSubjectIDs      []int64          `json:"sourceSubjectIds"`
	UnitIDs               []int64          `json:"unitIds"`
	UnitMeans             []PreferenceUnit `json:"unitMeans,omitempty"`
}

// PreferenceUnit explains one series' inner preference mean.
type PreferenceUnit struct {
	SeriesID int64    `json:"seriesId"`
	Mean     Rational `json:"mean"`
}

// Summary is a de-duplicated complete-core summary.
type Summary struct {
	PersonCount        int                  `json:"personCount"`
	UnitKind           UnitKind             `json:"unitKind"`
	WorkCount          int                  `json:"workCount"`
	SeriesCount        *int                 `json:"seriesCount"`
	CharacterCount     *int                 `json:"characterCount"`
	UnitIDs            []int64              `json:"unitIds"`
	MatchedSubjectIDs  []int64              `json:"matchedSubjectIds,omitempty"`
	CompleteSubjectIDs []int64              `json:"completeSubjectIds,omitempty"`
	CharacterIDs       []int64              `json:"characterIds,omitempty"`
	Attributions       []query.Contribution `json:"attributions,omitempty"`
}

func cloneInt64(values []int64) []int64 {
	return append([]int64(nil), values...)
}

func cloneContributions(values []query.Contribution) []query.Contribution {
	result := append([]query.Contribution(nil), values...)
	for index := range result {
		if result[index].SortOrder != nil {
			value := *result[index].SortOrder
			result[index].SortOrder = &value
		}
	}
	return result
}

func validUnitKind(kind UnitKind) bool {
	return kind == UnitSubject || kind == UnitSeries
}

func canonicalDate(value *string) (string, int, error) {
	if value == nil {
		return "", 0, nil
	}
	date := *value
	switch len(date) {
	case 4:
		if _, err := strconv.Atoi(date); err != nil {
			return "", 0, outcome(CodeInputInvalid)
		}
		return date, 1, nil
	case 7:
		var year, month int
		if _, err := fmt.Sscanf(date, "%4d-%2d", &year, &month); err != nil ||
			year < 1 || month < 1 || month > 12 {
			return "", 0, outcome(CodeInputInvalid)
		}
		return date, 2, nil
	case 10:
		var year, month, day int
		if _, err := fmt.Sscanf(date, "%4d-%2d-%2d", &year, &month, &day); err != nil ||
			year < 1 || month < 1 || month > 12 || day < 1 || day > 31 {
			return "", 0, outcome(CodeInputInvalid)
		}
		return date, 3, nil
	default:
		return "", 0, outcome(CodeInputInvalid)
	}
}

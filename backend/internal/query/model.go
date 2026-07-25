// Package query owns SharedQuery normalization and the deterministic,
// pre-statistics result set produced from one immutable Archive snapshot.
package query

import "context"

// SelectionPlan is the typed, catalog-owned meaning of one opaque PositionKey.
// PositionID is used by exactStaff, RoleTypes by exactCast, and
// MemberPositionKeys by staffSetUnion.
type SelectionPlan struct {
	PositionKey        string   `json:"positionKey"`
	RuleKind           string   `json:"ruleKind"`
	PositionID         int64    `json:"positionId,omitempty"`
	RoleTypes          []int64  `json:"roleTypes,omitempty"`
	MemberPositionKeys []string `json:"memberPositionKeys,omitempty"`
}

// Subject is the corrected Archive subject fact used by query filtering.
type Subject struct {
	SubjectID        int64          `json:"subjectId"`
	SubjectType      string         `json:"subjectType"`
	NSFW             bool           `json:"nsfw"`
	AirDate          *string        `json:"airDate"`
	AirDatePrecision *int64         `json:"airDatePrecision"`
	GlobalScore      *float64       `json:"globalScore"`
	RatingBuckets    []RatingBucket `json:"ratingBuckets"`
	Tags             []SubjectTag   `json:"tags"`
}

// RatingBucket is one exact 1..10 Archive rating-count bucket.
type RatingBucket struct {
	Rating int64 `json:"rating"`
	Count  int64 `json:"count"`
}

// SubjectTag is one public or meta Archive tag.
type SubjectTag struct {
	Scope string `json:"scope"`
	Name  string `json:"name"`
}

// StaffCredit is exact subject/person/position evidence from Archive.
type StaffCredit struct {
	SubjectID  int64 `json:"subjectId"`
	PersonID   int64 `json:"personId"`
	PositionID int64 `json:"positionId"`
}

// CastCredit is exact eligible subject/person/character/role evidence.
type CastCredit struct {
	SubjectID   int64 `json:"subjectId"`
	PersonID    int64 `json:"personId"`
	CharacterID int64 `json:"characterId"`
	RoleType    int64 `json:"roleType"`
	SortOrder   int64 `json:"sortOrder"`
}

// FactSet is a complete immutable input snapshot for one subject type.
type FactSet struct {
	Subjects     []Subject       `json:"subjects"`
	StaffCredits []StaffCredit   `json:"staffCredits"`
	CastCredits  []CastCredit    `json:"castCredits"`
	Plans        []SelectionPlan `json:"catalogPlans"`
}

// CollectionEntry is the caller-supplied personal overlay for one subject.
type CollectionEntry struct {
	SubjectID     int64    `json:"subjectId"`
	Status        string   `json:"status"`
	PersonalScore *float64 `json:"personalScore"`
	UpdatedAt     string   `json:"updatedAt"`
	Tags          []string `json:"tags"`
}

// CollectionSnapshot is an immutable, UID-bound personal overlay.
type CollectionSnapshot struct {
	UID     string            `json:"uid"`
	Entries []CollectionEntry `json:"entries"`
}

// CollectionSource supplies an already admitted immutable overlay. Evaluate
// never calls it for global scope and calls it exactly once for personal scope.
type CollectionSource interface {
	Snapshot(context.Context, string) (CollectionSnapshot, error)
}

// CollectionSourceFunc adapts a function into CollectionSource.
type CollectionSourceFunc func(context.Context, string) (CollectionSnapshot, error)

// Snapshot implements CollectionSource.
func (f CollectionSourceFunc) Snapshot(ctx context.Context, uid string) (CollectionSnapshot, error) {
	return f(ctx, uid)
}

// ParticipantRequest asks for raw-subject overlap among one or more people.
type ParticipantRequest struct {
	RequestID string              `json:"requestId"`
	People    []ParticipantPerson `json:"people"`
}

// ParticipantPerson unions the requested exact identities for one person.
type ParticipantPerson struct {
	PersonID     int64    `json:"personId"`
	PositionKeys []string `json:"positionKeys"`
}

// Contribution preserves the exact evidence behind one position result.
type Contribution struct {
	PositionKey       string `json:"positionKey"`
	MemberPositionKey string `json:"memberPositionKey,omitempty"`
	Kind              string `json:"kind"`
	SubjectID         int64  `json:"subjectId"`
	PersonID          int64  `json:"personId"`
	PositionID        int64  `json:"positionId,omitempty"`
	CharacterID       int64  `json:"characterId,omitempty"`
	RoleType          int64  `json:"roleType,omitempty"`
	SortOrder         *int64 `json:"sortOrder,omitempty"`
}

// PositionResult is the complete candidate set for one Effective Query
// position, in Effective Query order.
type PositionResult struct {
	PositionKey         string         `json:"positionKey"`
	CandidatePersonIDs  []int64        `json:"candidatePersonIds"`
	CandidateSubjectIDs []int64        `json:"candidateSubjectIds"`
	Contributions       []Contribution `json:"contributions"`
}

// PersonSubjects is one ranking-eligible person and the union of their raw
// subjects across every requested identity.
type PersonSubjects struct {
	PersonID   int64   `json:"personId"`
	SubjectIDs []int64 `json:"subjectIds"`
}

// ParticipantSet is the raw-subject intersection requested by a helper.
type ParticipantSet struct {
	RequestID  string  `json:"requestId"`
	SubjectIDs []int64 `json:"subjectIds"`
}

// Result is the deterministic pre-statistics query authority.
type Result struct {
	EffectiveQuery          EffectiveQuery   `json:"effectiveQuery"`
	QueryDigest             string           `json:"queryDigest"`
	CollectionAccessCount   int              `json:"collectionAccessCount"`
	EligibleSubjectIDs      []int64          `json:"eligibleSubjectIds"`
	PositionResults         []PositionResult `json:"positionResults"`
	RankingPeople           []PersonSubjects `json:"rankingPeople"`
	ParticipatingSubjectIDs []int64          `json:"participatingSubjectIds"`
	ParticipantSets         []ParticipantSet `json:"participantSets"`
}

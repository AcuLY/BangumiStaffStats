package persondetail

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Store owns the person-detail immutable result-cache integration.
type Store struct {
	values *runtimecache.ResultStore[Core]
}

// ResultBinding returns the opaque canonical cache policy for person detail.
func ResultBinding() (runtimecache.ResultBinding, error) {
	return runtimecache.NewResultBinding(
		runtimecache.OperationPersonDetailV1,
		CloneCore,
		coreCost,
	)
}

// NewStore constructs one typed person-detail cache.
func NewStore(
	config runtimecache.ResultConfig,
	executor *runtimecache.Executor,
) (*Store, error) {
	values, err := runtimecache.NewResultStore(
		config,
		executor,
		CloneCore,
		coreCost,
	)
	if err != nil {
		return nil, err
	}
	return &Store{values: values}, nil
}

// NewSharedStore constructs a typed person-detail facade over one process
// result pool and executor.
func NewSharedStore(queryRuntime *runtimecache.QueryRuntime) (*Store, error) {
	values, err := runtimecache.NewSharedResultStore[Core](
		queryRuntime,
		runtimecache.OperationPersonDetailV1,
	)
	if err != nil {
		return nil, err
	}
	return &Store{values: values}, nil
}

// InputDigest returns the versioned canonical digest for exactly personId.
func InputDigest(personID int64) (string, error) {
	if personID <= 0 || personID > maxJSONSafeInteger {
		return "", fieldError("/input/personId")
	}
	canonical, err := json.Marshal(Input{PersonID: personID})
	if err != nil {
		return "", fieldError("/input/personId")
	}
	return runtimecache.DigestInput(canonical), nil
}

// ResultKey excludes every view field by construction.
func ResultKey(
	scope string,
	dataVersion string,
	queryDigest string,
	personID int64,
	collectionDigest string,
) (runtimecache.ResultKey, error) {
	inputDigest, err := InputDigest(personID)
	if err != nil {
		return runtimecache.ResultKey{}, err
	}
	switch scope {
	case "global":
		if collectionDigest != "" {
			return runtimecache.ResultKey{}, fieldError("/query/scope")
		}
		return runtimecache.NewGlobalResultKey(
			runtimecache.OperationPersonDetailV1,
			dataVersion,
			queryDigest,
			inputDigest,
		)
	case "personal":
		return runtimecache.NewPersonalResultKey(
			runtimecache.OperationPersonDetailV1,
			dataVersion,
			queryDigest,
			inputDigest,
			collectionDigest,
		)
	default:
		return runtimecache.ResultKey{}, fieldError("/query/scope")
	}
}

// GetOrBuild returns one ownership-safe complete core.
func (store *Store) GetOrBuild(
	ctx context.Context,
	key runtimecache.ResultKey,
	build func(context.Context) (Core, error),
) (Core, error) {
	if store == nil || build == nil {
		return Core{}, fieldError("")
	}
	return store.values.GetOrCompute(ctx, key, build)
}

func (store *Store) Stats() runtimecache.LRUStats {
	if store == nil {
		return runtimecache.LRUStats{}
	}
	return store.values.Stats()
}

func coreCost(value Core) int64 {
	cost := int64(
		1024 +
			stringCost(value.DataVersion) +
			stringCost(value.QueryDigest) +
			stringCost(value.Scope),
	)
	cost += personProfileCost(value.Person)
	cost += 64 + stringCost(string(value.Summary.WorkUnit))
	cost += optionalScalarCost(value.Summary.CharacterCount != nil)
	cost += metricsCost(value.Metrics)
	for _, tag := range value.Tags.Meta {
		cost += tagCost(tag)
	}
	for _, tag := range value.Tags.Community {
		cost += tagCost(tag)
	}
	for _, tag := range value.Tags.Personal {
		cost += tagCost(tag)
	}
	cost += ratingDistributionCost(value.Ratings.Global)
	if value.Ratings.Personal != nil {
		cost += 32 + ratingDistributionCost(*value.Ratings.Personal)
	}
	cost += preferenceCost(value.Preference)
	for _, work := range value.Works {
		cost += workCost(work)
	}
	for _, character := range value.Characters {
		cost += 128 + characterReferenceCost(character.Character)
		cost += stringCost(character.RoleLabel)
		for _, appearance := range character.Appearances {
			cost += 128 + subjectReferenceCost(appearance.Subject)
			cost += stringCost(appearance.RoleLabel)
			for _, key := range appearance.PositionKeys {
				cost += stringCost(key)
			}
		}
	}
	return cost
}

func workCost(value WorkItem) int64 {
	cost := int64(96) + stringCost(value.Kind)
	if value.Subject != nil {
		cost += 160 + stringCost(value.Subject.Key)
		cost += subjectReferenceCost(value.Subject.Subject)
		cost += optionalScalarCost(value.Subject.GlobalScore != nil)
		for _, tag := range value.Subject.MetaTags {
			cost += stringCost(tag)
		}
		if value.Subject.Personal != nil {
			cost += 64
			cost += optionalScalarCost(value.Subject.Personal.Score != nil)
			cost += optionalStringCost(value.Subject.Personal.UpdatedAt)
		}
		cost += contributionCost(value.Subject.Contributions)
	}
	if value.Series != nil {
		cost += 192 + stringCost(value.Series.Key)
		cost += subjectReferenceCost(value.Series.Representative)
		cost += optionalScalarCost(value.Series.GlobalScore != nil)
		cost += optionalScalarCost(value.Series.PersonalScore != nil)
		cost += optionalStringCost(value.Series.LatestCollectionUpdatedAt)
		for _, member := range value.Series.Members {
			cost += 64 + subjectReferenceCost(member.SubjectReference)
		}
		cost += contributionCost(value.Series.Contributions)
	}
	return cost
}

func contributionCost(values []Contribution) int64 {
	cost := int64(0)
	for _, value := range values {
		cost += 96 + stringCost(value.Kind)
		if value.Staff != nil {
			cost += 96 +
				stringCost(value.Staff.PositionKey) +
				stringCost(value.Staff.ExactPositionKey) +
				stringCost(value.Staff.Provenance) +
				optionalScalarCost(value.Staff.WorkCount != nil)
		}
		if value.Cast != nil {
			cost += 128 +
				stringCost(value.Cast.PositionKey) +
				characterReferenceCost(value.Cast.Character) +
				stringCost(value.Cast.RoleLabel) +
				stringCost(value.Cast.Provenance) +
				optionalScalarCost(value.Cast.WorkCount != nil)
		}
	}
	return cost
}

func personProfileCost(value PersonProfile) int64 {
	cost := int64(128) +
		stringCost(value.Name) +
		optionalStringCost(value.NameCN) +
		optionalStringCost(value.Summary)
	for _, career := range value.Careers {
		cost += stringCost(career)
	}
	return cost
}

func metricsCost(value Metrics) int64 {
	return 128 +
		optionalScalarCost(value.Average != nil) +
		optionalScalarCost(value.Overall != nil) +
		optionalScalarCost(value.GlobalAverage != nil) +
		optionalScalarCost(value.Highest != nil) +
		optionalScalarCost(value.Lowest != nil)
}

func tagCost(value TagCount) int64 {
	return 48 + stringCost(value.Name)
}

func ratingDistributionCost(value RatingDistribution) int64 {
	cost := int64(128) + optionalScalarCost(value.Average != nil)
	for _, bucket := range value.Buckets {
		cost += 64
		for _, example := range bucket.Examples {
			cost += ratingExampleCost(example)
		}
	}
	cost += int64(len(value.Timeline)) * 48
	return cost
}

func preferenceCost(value *Preference) int64 {
	if value == nil {
		return 0
	}
	cost := int64(224) +
		optionalRationalCost(value.Mean) +
		rationalCost(value.EvidenceWeight) +
		optionalRationalCost(value.Score)
	for _, item := range value.Preferred {
		cost += preferenceItemCost(item)
	}
	for _, item := range value.Conservative {
		cost += preferenceItemCost(item)
	}
	return cost
}

func preferenceItemCost(value PreferenceItem) int64 {
	return 96 + ratingExampleCost(value.Unit)
}

func rationalCost(value statistics.Rational) int64 {
	return 64 + stringCost(value.Numerator) + stringCost(value.Denominator)
}

func optionalRationalCost(value *statistics.Rational) int64 {
	if value == nil {
		return 0
	}
	return 24 + rationalCost(*value)
}

func ratingExampleCost(value RatingExample) int64 {
	return 96 +
		stringCost(string(value.Kind)) +
		stringCost(value.Key) +
		stringCost(value.Name) +
		optionalStringCost(value.NameCN)
}

func subjectReferenceCost(value SubjectReference) int64 {
	return 96 +
		stringCost(value.Name) +
		optionalStringCost(value.NameCN) +
		optionalStringCost(value.Date)
}

func characterReferenceCost(value CharacterReference) int64 {
	return 96 +
		stringCost(value.Key) +
		stringCost(value.Name) +
		optionalStringCost(value.NameCN) +
		optionalScalarCost(value.ID != nil)
}

func stringCost(value string) int64 {
	return int64(16 + len(value))
}

func optionalStringCost(value *string) int64 {
	if value == nil {
		return 0
	}
	return 24 + stringCost(*value)
}

func optionalScalarCost(present bool) int64 {
	if !present {
		return 0
	}
	return 24
}

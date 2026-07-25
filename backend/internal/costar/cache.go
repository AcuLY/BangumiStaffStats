package costar

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Store is the co-star-owned immutable result-cache integration.
type Store struct {
	values *runtimecache.ResultStore[Core]
}

// NewStore constructs one typed complete-core cache.
func NewStore(
	config runtimecache.ResultConfig,
	executor *runtimecache.Executor,
) (*Store, error) {
	values, err := runtimecache.NewResultStore(config, executor, CloneCore, coreCost)
	if err != nil {
		return nil, err
	}
	return &Store{values: values}, nil
}

// ResultKey builds a semantic key. Ordinary work view state cannot enter this
// API; participant and identity order deliberately remain significant.
func ResultKey(
	scope string,
	dataVersion string,
	queryDigest string,
	input Input,
	collectionDigest string,
) (runtimecache.ResultKey, error) {
	if len(input.Participants) < 2 || len(input.Participants) > 10 {
		return runtimecache.ResultKey{}, fieldError("/input/participants")
	}
	canonicalInput := Input{
		Participants: make([]ParticipantInput, len(input.Participants)),
	}
	for index, participant := range input.Participants {
		if participant.PersonID <= 0 || len(participant.PositionKeys) == 0 {
			return runtimecache.ResultKey{}, fieldError(
				"/input/participants",
			)
		}
		canonicalInput.Participants[index] = ParticipantInput{
			PersonID:     participant.PersonID,
			PositionKeys: cloneSlice(participant.PositionKeys),
		}
	}
	canonical, err := json.Marshal(canonicalInput)
	if err != nil {
		return runtimecache.ResultKey{}, fieldError("/input")
	}
	inputDigest := runtimecache.DigestInput(canonical)
	switch scope {
	case "global":
		if collectionDigest != "" {
			return runtimecache.ResultKey{}, fieldError("/query/scope")
		}
		return runtimecache.NewGlobalResultKey(
			runtimecache.OperationCoStarV1,
			dataVersion,
			queryDigest,
			inputDigest,
		)
	case "personal":
		return runtimecache.NewPersonalResultKey(
			runtimecache.OperationCoStarV1,
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
	build Builder,
) (Core, error) {
	if store == nil || build == nil {
		return Core{}, fieldError("")
	}
	return store.values.GetOrCompute(ctx, key, build)
}

// Stats returns cache behavior without exposing semantic key content.
func (store *Store) Stats() runtimecache.LRUStats {
	if store == nil {
		return runtimecache.LRUStats{}
	}
	return store.values.Stats()
}

func coreCost(value Core) int64 {
	cost := int64(1024)
	addRetainedCost(
		&cost,
		stringRetainedCost(value.DataVersion),
		stringRetainedCost(value.QueryDigest),
		stringRetainedCost(value.Scope),
		stringRetainedCost(value.Kind),
		stringRetainedCost(string(value.WorkUnit)),
	)
	for _, participant := range value.Participants {
		addRetainedCost(
			&cost,
			192,
			personReferenceRetainedCost(participant.Person),
			metricsRetainedCost(participant.Metrics),
		)
		for _, key := range participant.PositionKeys {
			addRetainedCost(&cost, stringRetainedCost(key))
		}
	}
	addRetainedCost(&cost, summaryRetainedCost(value.Summary))
	for _, tag := range value.Tags.Meta {
		addRetainedCost(&cost, tagRetainedCost(tag))
	}
	for _, tag := range value.Tags.Community {
		addRetainedCost(&cost, tagRetainedCost(tag))
	}
	for _, tag := range value.Tags.Personal {
		addRetainedCost(&cost, tagRetainedCost(tag))
	}
	for _, dataset := range value.Ratings {
		addRetainedCost(
			&cost,
			128,
			stringRetainedCost(dataset.Kind),
			optionalScalarRetainedCost(dataset.PersonID != nil),
			ratingDistributionRetainedCost(dataset.Global),
		)
		if dataset.Personal != nil {
			addRetainedCost(
				&cost,
				24,
				ratingDistributionRetainedCost(*dataset.Personal),
			)
		}
	}
	addRetainedCost(&cost, preferenceRetainedCost(value.Preference))
	for _, pair := range value.Matrix {
		addRetainedCost(&cost, 96, metricsRetainedCost(pair.Metrics))
	}
	for _, work := range value.Works {
		addRetainedCost(&cost, workCost(work))
	}
	return cost
}

func workCost(value WorkItem) int64 {
	cost := int64(96)
	addRetainedCost(&cost, stringRetainedCost(value.Kind))
	if value.Subject != nil {
		addRetainedCost(
			&cost,
			160,
			stringRetainedCost(value.Subject.Key),
			subjectReferenceRetainedCost(value.Subject.Subject),
			optionalScalarRetainedCost(value.Subject.GlobalScore != nil),
			collectionEvidenceRetainedCost(value.Subject.Personal),
		)
		for _, tag := range value.Subject.MetaTags {
			addRetainedCost(&cost, stringRetainedCost(tag))
		}
		for _, participant := range value.Subject.Participants {
			addRetainedCost(
				&cost,
				workParticipantRetainedCost(participant),
			)
		}
	}
	if value.Series != nil {
		addRetainedCost(
			&cost,
			192,
			stringRetainedCost(value.Series.Key),
			subjectReferenceRetainedCost(value.Series.Representative),
			optionalScalarRetainedCost(value.Series.GlobalScore != nil),
			optionalScalarRetainedCost(value.Series.PersonalScore != nil),
			optionalStringRetainedCost(
				value.Series.LatestCollectionUpdatedAt,
			),
		)
		for _, member := range value.Series.Members {
			addRetainedCost(
				&cost,
				64,
				subjectReferenceRetainedCost(member.SubjectReference),
			)
		}
		for _, participant := range value.Series.Participants {
			addRetainedCost(
				&cost,
				workParticipantRetainedCost(participant),
			)
		}
	}
	return cost
}

const maxRetainedCost int64 = 1<<63 - 1

func addRetainedCost(total *int64, values ...int64) {
	for _, value := range values {
		*total = saturatingRetainedAdd(*total, value)
	}
}

func saturatingRetainedAdd(left, right int64) int64 {
	if left < 0 || right < 0 || left > maxRetainedCost-right {
		return maxRetainedCost
	}
	return left + right
}

func saturatingRetainedMul(count int, each int64) int64 {
	if count <= 0 {
		return 0
	}
	if each < 0 || each > maxRetainedCost/int64(count) {
		return maxRetainedCost
	}
	return int64(count) * each
}

func summaryRetainedCost(value Summary) int64 {
	cost := int64(128)
	addRetainedCost(
		&cost,
		optionalScalarRetainedCost(value.Average != nil),
		optionalScalarRetainedCost(value.GlobalRatedWorkCount != nil),
		optionalScalarRetainedCost(value.GlobalAverage != nil),
		optionalScalarRetainedCost(value.Highest != nil),
		optionalScalarRetainedCost(value.Lowest != nil),
	)
	return cost
}

func metricsRetainedCost(value Metrics) int64 {
	return saturatingRetainedAdd(
		64,
		optionalScalarRetainedCost(value.Average != nil),
	)
}

func tagRetainedCost(value TagCount) int64 {
	return saturatingRetainedAdd(48, stringRetainedCost(value.Name))
}

func ratingDistributionRetainedCost(value RatingDistribution) int64 {
	cost := int64(128)
	addRetainedCost(
		&cost,
		optionalScalarRetainedCost(value.Average != nil),
	)
	for _, bucket := range value.Buckets {
		addRetainedCost(&cost, 64)
		for _, example := range bucket.Examples {
			addRetainedCost(
				&cost,
				ratingExampleRetainedCost(example),
			)
		}
	}
	addRetainedCost(
		&cost,
		saturatingRetainedMul(len(value.Timeline), 48),
	)
	return cost
}

func preferenceRetainedCost(value *Preference) int64 {
	if value == nil {
		return 0
	}
	cost := int64(224)
	addRetainedCost(
		&cost,
		optionalRationalRetainedCost(value.Mean),
		rationalRetainedCost(value.EvidenceWeight),
		optionalRationalRetainedCost(value.Score),
	)
	for _, item := range value.Preferred {
		addRetainedCost(&cost, preferenceItemRetainedCost(item))
	}
	for _, item := range value.Conservative {
		addRetainedCost(&cost, preferenceItemRetainedCost(item))
	}
	return cost
}

func preferenceItemRetainedCost(value PreferenceItem) int64 {
	return saturatingRetainedAdd(
		96,
		ratingExampleRetainedCost(value.Unit),
	)
}

func rationalRetainedCost(value statistics.Rational) int64 {
	cost := int64(64)
	addRetainedCost(
		&cost,
		stringRetainedCost(value.Numerator),
		stringRetainedCost(value.Denominator),
	)
	return cost
}

func optionalRationalRetainedCost(value *statistics.Rational) int64 {
	if value == nil {
		return 0
	}
	return saturatingRetainedAdd(24, rationalRetainedCost(*value))
}

func ratingExampleRetainedCost(value RatingExample) int64 {
	cost := int64(96)
	addRetainedCost(
		&cost,
		stringRetainedCost(string(value.Kind)),
		stringRetainedCost(value.Key),
		stringRetainedCost(value.Name),
		optionalStringRetainedCost(value.NameCN),
	)
	return cost
}

func workParticipantRetainedCost(value WorkParticipant) int64 {
	cost := int64(64)
	addRetainedCost(
		&cost,
		optionalScalarRetainedCost(value.WorkCount != nil),
	)
	for _, credit := range value.Credits {
		addRetainedCost(&cost, contributionRetainedCost(credit))
	}
	return cost
}

func contributionRetainedCost(value Contribution) int64 {
	cost := int64(96)
	addRetainedCost(&cost, stringRetainedCost(value.Kind))
	if value.Staff != nil {
		addRetainedCost(
			&cost,
			96,
			stringRetainedCost(value.Staff.PositionKey),
			stringRetainedCost(value.Staff.ExactPositionKey),
			stringRetainedCost(value.Staff.Provenance),
			optionalScalarRetainedCost(value.Staff.WorkCount != nil),
		)
	}
	if value.Cast != nil {
		addRetainedCost(
			&cost,
			128,
			stringRetainedCost(value.Cast.PositionKey),
			characterReferenceRetainedCost(value.Cast.Character),
			stringRetainedCost(value.Cast.RoleLabel),
			stringRetainedCost(value.Cast.Provenance),
			optionalScalarRetainedCost(value.Cast.WorkCount != nil),
		)
	}
	return cost
}

func collectionEvidenceRetainedCost(value *CollectionEvidence) int64 {
	if value == nil {
		return 0
	}
	cost := int64(64)
	addRetainedCost(
		&cost,
		optionalScalarRetainedCost(value.Score != nil),
		optionalStringRetainedCost(value.UpdatedAt),
	)
	return cost
}

func personReferenceRetainedCost(value PersonReference) int64 {
	cost := int64(96)
	addRetainedCost(
		&cost,
		stringRetainedCost(value.Name),
		optionalStringRetainedCost(value.NameCN),
	)
	return cost
}

func subjectReferenceRetainedCost(value SubjectReference) int64 {
	cost := int64(96)
	addRetainedCost(
		&cost,
		stringRetainedCost(value.Name),
		optionalStringRetainedCost(value.NameCN),
		optionalStringRetainedCost(value.Date),
	)
	return cost
}

func characterReferenceRetainedCost(value CharacterReference) int64 {
	cost := int64(96)
	addRetainedCost(
		&cost,
		stringRetainedCost(value.Key),
		stringRetainedCost(value.Name),
		optionalStringRetainedCost(value.NameCN),
		optionalScalarRetainedCost(value.ID != nil),
	)
	return cost
}

func stringRetainedCost(value string) int64 {
	return saturatingRetainedAdd(16, int64(len(value)))
}

func optionalStringRetainedCost(value *string) int64 {
	if value == nil {
		return 0
	}
	return saturatingRetainedAdd(24, stringRetainedCost(*value))
}

func optionalScalarRetainedCost(present bool) int64 {
	if !present {
		return 0
	}
	return 24
}

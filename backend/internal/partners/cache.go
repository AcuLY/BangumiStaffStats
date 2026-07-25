package partners

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Store is the partner-owned immutable result-cache integration.
type Store struct {
	values *runtimecache.ResultStore[Core]
}

// ResultBinding returns the opaque canonical cache policy for partners.
func ResultBinding() (runtimecache.ResultBinding, error) {
	return runtimecache.NewResultBinding(
		runtimecache.OperationPartnersV1,
		CloneCore,
		coreCost,
	)
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

// NewSharedStore constructs a typed partner facade over one process result
// pool and executor.
func NewSharedStore(queryRuntime *runtimecache.QueryRuntime) (*Store, error) {
	values, err := runtimecache.NewSharedResultStore[Core](
		queryRuntime,
		runtimecache.OperationPartnersV1,
	)
	if err != nil {
		return nil, err
	}
	return &Store{values: values}, nil
}

// ResultKey builds a semantic key. View state cannot enter this API.
func ResultKey(
	scope string,
	dataVersion string,
	queryDigest string,
	input Input,
	collectionDigest string,
) (runtimecache.ResultKey, error) {
	if input.Source.PersonID <= 0 || len(input.Source.PositionKeys) == 0 {
		return runtimecache.ResultKey{}, fieldError("/input/source")
	}
	canonical, err := json.Marshal(struct {
		Source struct {
			PersonID     int64    `json:"personId"`
			PositionKeys []string `json:"positionKeys"`
		} `json:"source"`
		CandidatePositionKey *string `json:"candidatePositionKey,omitempty"`
	}{
		Source: struct {
			PersonID     int64    `json:"personId"`
			PositionKeys []string `json:"positionKeys"`
		}{
			PersonID:     input.Source.PersonID,
			PositionKeys: append([]string{}, input.Source.PositionKeys...),
		},
		CandidatePositionKey: cloneString(input.CandidatePositionKey),
	})
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
			runtimecache.OperationPartnersV1,
			dataVersion,
			queryDigest,
			inputDigest,
		)
	case "personal":
		return runtimecache.NewPersonalResultKey(
			runtimecache.OperationPartnersV1,
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
	cost := int64(
		256 + len(value.DataVersion) + len(value.QueryDigest) + len(value.Scope) +
			len(value.Source.Person.Name),
	)
	if value.Source.Person.NameCN != nil {
		cost += int64(len(*value.Source.Person.NameCN))
	}
	for _, key := range value.Source.PositionKeys {
		cost += int64(len(key) + 16)
	}
	for _, partner := range value.Partners {
		cost += int64(192 + len(partner.Person.Name))
		if partner.Person.NameCN != nil {
			cost += int64(len(*partner.Person.NameCN))
		}
		for _, key := range partner.PositionKeys {
			cost += int64(len(key) + 16)
		}
		if partner.Preference != nil {
			cost += rationalPointerCost(partner.Preference.Mean)
			cost += rationalPointerCost(partner.Preference.Score)
			cost += int64(
				len(partner.Preference.EvidenceWeight.Numerator) +
					len(partner.Preference.EvidenceWeight.Denominator) +
					64,
			)
		}
	}
	return cost
}

func rationalPointerCost(value *statistics.Rational) int64 {
	if value == nil {
		return 0
	}
	return int64(len(value.Numerator) + len(value.Denominator) + 32)
}

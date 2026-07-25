package candidates

import (
	"context"
	"encoding/json"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
)

// Store is the candidate-owned immutable result-cache integration.
type Store struct {
	values *runtimecache.ResultStore[Core]
}

// NewStore constructs one typed candidate core cache.
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

// ResultKey builds a candidate semantic key. View state cannot enter this API.
func ResultKey(
	scope string,
	dataVersion string,
	queryDigest string,
	positionKey string,
	collectionDigest string,
) (runtimecache.ResultKey, error) {
	if positionKey == "" {
		return runtimecache.ResultKey{}, fieldError("/input/positionKey")
	}
	canonical, err := json.Marshal(struct {
		PositionKey string `json:"positionKey"`
	}{PositionKey: positionKey})
	if err != nil {
		return runtimecache.ResultKey{}, fieldError("/input/positionKey")
	}
	inputDigest := runtimecache.DigestInput(canonical)
	switch scope {
	case "global":
		if collectionDigest != "" {
			return runtimecache.ResultKey{}, fieldError("/query/scope")
		}
		return runtimecache.NewGlobalResultKey(
			runtimecache.OperationCandidatesV1,
			dataVersion,
			queryDigest,
			inputDigest,
		)
	case "personal":
		return runtimecache.NewPersonalResultKey(
			runtimecache.OperationCandidatesV1,
			dataVersion,
			queryDigest,
			inputDigest,
			collectionDigest,
		)
	default:
		return runtimecache.ResultKey{}, fieldError("/query/scope")
	}
}

// GetOrBuild returns one ownership-safe core.
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
		len(value.DataVersion) +
			len(value.QueryDigest) +
			len(value.Scope) +
			len(value.PositionKey) +
			64,
	)
	for _, count := range value.PositionCounts {
		cost += int64(len(count.PositionKey) + 24)
	}
	for _, row := range value.Rows {
		cost += int64(len(row.Person.Name) + 80)
		if row.Person.NameCN != nil {
			cost += int64(len(*row.Person.NameCN))
		}
	}
	return cost
}

package store

import (
	"context"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/bits-and-blooms/bloom/v3"
)

func Init() error {
	var ids []int
	sql := "SELECT subject_id from subjects"

	ids, err := DBRaw[int](context.Background(), sql)
	if err != nil {
		return err
	}

	n := uint(len(ids))
	fp := 0.001
	subjectFilter = bloom.NewWithEstimates(n, fp)

	for _, id := range ids {
		subjectFilter.Add(fmt.Append(nil, id))
	}

	return nil
}

type Object[T any] interface {
	*T
	comparable
	Key() string
	TTL() time.Duration
}

func ReadThrough[T Object[U], U any](ctx context.Context, objs *[]T, fetch func(context.Context, *[]T) error) error {
	if len(*objs) == 0 {
		return nil
	}

	missed, cached, err := CacheLoadMany(ctx, *objs)
	if err != nil {
		return err
	}

	if len(missed) > 0 {
		if err := fetch(ctx, &missed); err != nil {
			return err
		}
		CacheSaveMany(ctx, missed)
	}

	res := append(cached, missed...)
	idToRes := model.ToKeyMap(res)
	for _, obj := range *objs {
		*obj = *idToRes[obj.Key()]
	}

	return nil
}

func DBReadThrough[T Object[U], U any](ctx context.Context, objs *[]T, sql string, condFunc func([]T) []any) error {
	fetch := func(ctx context.Context, missed *[]T) error {
		conditions := condFunc(*missed)
		result, err := DBRaw[T](ctx, sql, conditions...)
		if err != nil {
			return err
		}

		idToObj := model.ToKeyMap(result)
		for _, obj := range *missed {
			if fullObj, ok := idToObj[obj.Key()]; ok {
				*obj = *fullObj
			}
		}

		return nil
	}

	return ReadThrough(ctx, objs, fetch)
}

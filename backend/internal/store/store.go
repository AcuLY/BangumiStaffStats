package store

import (
	"context"
	"fmt"

	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
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

func ReadThrough[T m.Object[U], U any](ctx context.Context, objs *[]T, fetch func(context.Context, *[]T) error) error {
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

	results := append(cached, missed...)
	keyToRes := m.ToKeyMap(results)
	for _, obj := range *objs {
		*obj = *keyToRes[obj.Key()]
	}

	return nil
}

func dbFetchAndMerge[T m.Object[U], U any](ctx context.Context, missed *[]T, sql string, conds []any) error {
	if len(*missed) == 0 {
		return nil
	}

	results, err := DBRaw[T](ctx, sql, conds...)
	if err != nil {
		return err
	}
	if len(results) == 0 {
		return nil
	}

	keyToRes := m.ToKeyMap(results)
	for _, obj := range *missed {
		if obj == nil {
			continue
		}
		if result, ok := keyToRes[obj.Key()]; ok && result != nil {
			*obj = *result
		}
	}
	return nil
}

func DBReadThrough[T m.Object[U], U any](ctx context.Context, objs *[]T, sql string, condFunc func([]T) []any) error {
	fetch := func(ctx context.Context, missed *[]T) error {
		return dbFetchAndMerge(ctx, missed, sql, condFunc(*missed))
	}
	return ReadThrough(ctx, objs, fetch)
}

func DBReadThroughGenSQL[T m.Object[U], U any](ctx context.Context, objs *[]T, sqlFunc func([]T) string, condFunc func([]T) []any) error {
	fetch := func(ctx context.Context, missed *[]T) error {
		if len(*missed) == 0 {
			return nil
		}
		sql := sqlFunc(*missed)
		return dbFetchAndMerge(ctx, missed, sql, condFunc(*missed))
	}
	return ReadThrough(ctx, objs, fetch)
}

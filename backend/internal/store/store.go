package store

import (
	"context"
	"fmt"
	"reflect"
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

type keyable interface {
	Key() string
}

type Object[T any] interface {
	*T
	comparable
	keyable
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

func DBReadThroughMany[T Object[U], U any, E keyable](ctx context.Context, objs *[]T, sql string, condFunc func([]T) []any, fieldName string) error {
	fetch := func(ctx context.Context, missed *[]T) error {
		conditions := condFunc(*missed)
		results, err := DBRaw[E](ctx, sql, conditions...)
		if err != nil {
			return err
		}

		keyMap := model.ToKeyMap(*missed)
		for _, res := range results {
			resVal := reflect.ValueOf(res).Elem().FieldByName(fieldName)

			key := res.Key()
			obj := keyMap[key]

			pluralFieldName := fieldName + "s"
			originField := reflect.ValueOf(obj).Elem().FieldByName(pluralFieldName)
			if originField.Kind() != reflect.Slice {
				return fmt.Errorf("%s is not a slice", pluralFieldName)
			}


			newSlice := reflect.Append(originField, resVal)
			originField.Set(newSlice)
		}

		return nil
	}

	return ReadThrough(ctx, objs, fetch)
}

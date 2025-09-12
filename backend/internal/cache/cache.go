package cache

import (
	"context"
	"time"
	
	"github.com/goccy/go-json"
)



type CollectionID struct {
	UserID         int
	SubjectType    int
	CollectionType int
}

type PersonID int

type SubjectPositionsID struct {
	SubjectID   int
	PositionIDs []int
}

type StatisticID struct {
	UserID          int
	Position        string
	SubjectType     int
	CollectionTypes []int
	PositiveTags    []string
	NegativeTags    []string
	RateRange       []float32
	FavoriteRange   []int
	DateRange       []int
	IsGlobal        bool
	ShowNSFW        bool
}

type SubjectID int

type ObjectID interface {
	CharacterID | PersonSubjectID | CollectionID | SubjectPositionsID | PersonID | StatisticID | SubjectID
}

type KeyFunc func([]ObjectID) []string

func Save[T ObjectID](ctx context.Context, keys []string, ttl time.Duration, ids []*T) error {
	pipe := RDB.Pipeline()

	for i, obj := range objects {
		raw, err := json.Marshal(obj)
		if err != nil {
			return err
		}

		pipe.Set(ctx, keys[i], raw, ttl)
	}

	_, err := pipe.Exec(ctx)

	return err
}

func Load[T ObjectID](ctx context.Context, keys []string) ([]*T, error) {

	raws, err := RDB.MGet(ctx, keys...).Result()
	if err != nil {
		return []*T{}, err
	}
	
	objects := make([]*T, 0, len(keys))

	for i, raw := range raws {
		if raw == nil {
			continue
		}
		
		if err := json.Unmarshal([]byte(raw.(string)), subjects[i]); err != nil {
			return err
		}
	}

	return nil
}
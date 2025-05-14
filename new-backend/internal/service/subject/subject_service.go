package subject

import (
	"context"
	"math"
	"sort"
	"sync"

	repository "github.com/AcuLY/BangumiStaffStats/internal/repository/subject"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
	"golang.org/x/sync/errgroup"
)

func GetGlobalSubjects(ctx context.Context, subjectType int) ([]*model.Subject, error) {
	return repository.FindGlobalSubjectsByType(ctx, subjectType)
}

// LoadSubjects 加载给定条目的完整信息
func LoadSubjects(ctx context.Context, subjects []*model.Subject) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	g := new(errgroup.Group)

	for _, subject := range subjects {
		g.Go(func() error {
			if err := repository.FindSubject(ctx, subject); err != nil {
				return nil
			}

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return err
	}

	return nil
}

func getSeries(ctx context.Context, subjects []*model.Subject) (map[int][]*model.Subject, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	g := new(errgroup.Group)
	var mu sync.Mutex

	series := make(map[int][]*model.Subject)

	for _, s := range subjects {
		g.Go(func() error {
			so, err := repository.FindSequelOrder(ctx, s)
			if err != nil || so == nil {
				logger.Warn("Sequel order not found.", logger.Field("subject_id", s.ID))
				return nil
			}

			s.SeriesOrder = so.Order

			mu.Lock()
			series[so.SeriesID] = append(series[so.SeriesID], s)
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return series, nil
}

func calcSeriesRate(subjects []*model.Subject) float32 {
	var sum float32
	var validRateCount int

	for _, s := range subjects {
		if s.Rate() == 0 {
			continue
		}

		sum += s.Rate()
		validRateCount += 1
	}

	if validRateCount == 0 {
		return 0
	}

	avg := sum / float32(validRateCount)
	floored := float32(math.Floor(float64(avg*100))) / 100
	return floored
}

func MarkSequelOrders(ctx context.Context, subjects []*model.Subject) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	series, err := getSeries(ctx, subjects)
	if err != nil {
		return err
	}

	for _, subjects := range series {
		sort.Slice(subjects, func(i, j int) bool {
			return subjects[i].SeriesOrder < subjects[j].SeriesOrder
		})

		mainSubject := subjects[0]
		seriesRate := calcSeriesRate(subjects)

		for _, s := range subjects {
			s.SeriesMainSubject = mainSubject
			s.SeriesRate = seriesRate
		}
	}

	return nil
}

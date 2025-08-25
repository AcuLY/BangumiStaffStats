package series

import (
	"context"
	"math"
	"sort"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	repository "github.com/AcuLY/BangumiStaffStats/backend/internal/repository/series"
	"golang.org/x/sync/errgroup"
)

// collectSeries 根据条目创建一个系列号到该系列的条目列表的映射
func collectSeries(ctx context.Context, subjects []*model.Subject) (map[int][]*model.Subject, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	g := new(errgroup.Group)
	var mu sync.Mutex

	series := make(map[int][]*model.Subject)

	for _, s := range subjects {
		g.Go(func() error {
			so, err := repository.Find(ctx, s)
			if err != nil || so == nil {
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

// calcSeriesRate 计算一个系列的平均分
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

// MarkSequelOrders 标记条目对应的系列主条目和系列均分
func MarkSequelOrders(ctx context.Context, subjects []*model.Subject) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	series, err := collectSeries(ctx, subjects)
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

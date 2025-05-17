package subject

import (
	"context"
	"math"
	"sort"
	"sync"

	repository "github.com/AcuLY/BangumiStaffStats/backend/internal/repository/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
	"golang.org/x/sync/errgroup"
)

// GetGlobalSubjects 获取指定类型的所有条目
func GetGlobalSubjects(ctx context.Context, subjectType int, favoriteRange []int) ([]*model.Subject, error) {
	return repository.FindGlobalSubjectsByType(ctx, subjectType, favoriteRange)
}

// LoadSubjects 加载给定条目的完整信息
//
// 由于某些条目已被删除，需要传入切片指针以过滤被删除的条目
func LoadSubjects(ctx context.Context, subjects *[]*model.Subject) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	g := new(errgroup.Group)

	for _, subject := range *subjects {
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

	// 过滤掉已被删除的条目
	validCount := 0
	for _, s := range *subjects {
		if s.Name != "" {
			(*subjects)[validCount] = s
			validCount++
		}
	}
	*subjects = (*subjects)[:validCount]

	return nil
}

// getSeries 根据条目创建一个系列号到该系列的条目列表的映射
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

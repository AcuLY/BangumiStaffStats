package service

import (
	"context"
	"errors"
	"slices"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/statistic"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/constant"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/pkg/sorter"
	srv "github.com/AcuLY/BangumiStaffStats/backend/internal/service/statistic"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

var ErrNoResultFound error = errors.New("no result found")
var ErrInvalidPagination error = errors.New("invalid pagination")

func Statistics(ctx context.Context, r *model.Request) (*model.StatisticsResp, error) {
	full := new(model.Statistics)

	if err := cache.Find(ctx, r, full); err != nil {
		if err != redis.Nil {
			return nil, err
		}

		full, err = srv.GetFullStatistics(ctx, r)
		if err != nil {
			return nil, err
		}

		if err := cache.Save(ctx, r, full); err != nil {
			logger.Warn("Failed to set statistic cache: "+err.Error())
		}
	}

	summaries := full.PeopleSummary
	if len(summaries) == 0 {
		return nil, ErrNoResultFound
	}

	if r.StatisticType == constant.StatsTypeCharacter {
		sorter.SortByCharacterCount(summaries)
	} else {
		isSeries := r.StatisticType == constant.StatsTypeSeries
		switch r.SortBy {
		case constant.SortByCount:
			sorter.SortByCount(summaries, isSeries)
		case constant.SortByAverageRate:
			sorter.SortByAverage(summaries, isSeries)
		case constant.SortByOverallRate:
			sorter.SortByOverall(summaries, isSeries)
		}
	}

	if *r.Ascending {
		slices.Reverse(summaries)
	}

	begin := (r.Page - 1) * r.PageSize
	if begin >= len(summaries) {
		return nil, ErrInvalidPagination
	}
	end := min(begin+r.PageSize, len(summaries))

	curSummaries := make([]*model.PersonSummaryResp, min(r.PageSize, len(summaries)))
	for i := begin; i < end; i++ {
		curIdx := i - begin

		curSummaries[curIdx] = new(model.PersonSummaryResp)
		curSummaries[curIdx].PersonID = summaries[i].PersonID
		curSummaries[curIdx].PersonName = summaries[i].PersonName
		curSummaries[curIdx].PersonNameCN = summaries[i].PersonNameCN

		switch r.StatisticType {
		case "subject":
			curSummaries[curIdx].SubjectSummary = summaries[i].Subject
		case "series":
			curSummaries[curIdx].SubjectSummary = summaries[i].Series
		case "character":
			curSummaries[curIdx].CharacterSummary = summaries[i].Character
		}
	}

	resp := &model.StatisticsResp{
		PeopleSummaryResp: curSummaries,
		PersonCount:       full.PersonCount,
		SubjectCount:      full.SubjectCount,
		SeriesCount:       full.SeriesCount,
		CharacterCount:    full.CharacterCount,
	}
	return resp, nil
}

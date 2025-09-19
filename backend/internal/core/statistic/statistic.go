package statistic

import (
	"context"
	"errors"
	"fmt"
	"slices"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/constant"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/character"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/collection"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/person"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/position"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/sequel"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
)

var ErrNoResultFound error = errors.New("no result found")
var ErrInvalidPagination error = errors.New("invalid pagination")

const timeoutConst time.Duration = time.Second * 600

func timeElapse(begin *time.Time, msg string) {
	logger.Debug(msg, logger.Field("time cost", time.Since(*begin)))
	*begin = time.Now()
}

func Handle(ctx context.Context, r *model.Request) (*model.Response, error) {
	// 需要适配 store.ReadThrough 的接口，所以额外定义了一个切片
	entities := []*model.StatsEntity{{Request: r}}
	err := store.ReadThrough(ctx, &entities, fullStatistics)
	if err != nil {
		return nil, err
	}
	full := entities[0].Statistics

	sums := full.PeopleSummary
	if len(sums) == 0 {
		return nil, ErrNoResultFound
	}

	curPage, err := currentPage(r, sums)
	if err != nil {
		return nil, err
	}

	resp := &model.Response{
		Summaries:   curPage,
		ObjectCount: countByType(r, full),
	}
	return resp, nil
}

func currentPage(r *model.Request, sums []*model.PersonSummary) ([]*model.PersonSummaryByType, error) {
	sortByType(r, sums)

	if *r.Ascend {
		slices.Reverse(sums)
	}

	begin := (r.Page - 1) * r.PageSize
	if begin >= len(sums) {
		return nil, ErrInvalidPagination
	}
	end := min(begin+r.PageSize, len(sums))

	curPage := make([]*model.PersonSummaryByType, min(r.PageSize, len(sums)))
	for i := begin; i < end; i++ {
		curIdx := i - begin

		curPage[curIdx] = new(model.PersonSummaryByType)
		curPage[curIdx].Person = *sums[i].Person

		switch r.StatisticType {
		case constant.StatsTypeSubject:
			curPage[curIdx].SubjectSummary = sums[i].Subject
		case constant.StatsTypeSeries:
			curPage[curIdx].SubjectSummary = sums[i].Series
		case constant.StatsTypeCharacter:
			curPage[curIdx].CharacterSummary = sums[i].Character
		}
	}

	return curPage, nil
}

func sortByType(r *model.Request, sums []*model.PersonSummary) {
	if r.StatisticType == constant.StatsTypeCharacter {
		SortByCharaCount(sums)
	} else {
		isSeries := r.StatisticType == constant.StatsTypeSeries
		switch r.SortBy {
		case constant.SortByCount:
			SortByCount(sums, isSeries)
		case constant.SortByAverageRate:
			SortByAverage(sums, isSeries)
		case constant.SortByOverallRate:
			SortByOverall(sums, isSeries)
		}
	}
}

func countByType(r *model.Request, full *model.Statistics) int {
	switch r.StatisticType {
	case constant.StatsTypeSubject:
		return full.SubjectCount
	case constant.StatsTypeSeries:
		return full.SeriesCount
	case constant.StatsTypeCharacter:
		return full.CharacterCount
	default:
		return 0
	}
}

func fullStatistics(ctx context.Context, entities *[]*model.StatsEntity) error {
	e := (*entities)[0]
	r := e.Request

	ctx, cancel := context.WithTimeout(ctx, timeoutConst)
	defer cancel()

	begin := time.Now()

	var subjs []*model.Subject
	var err error

	if *r.IsGlobal {
		favRange := []int{*r.FavoriteRange[0], *r.FavoriteRange[1]} // 查全站时一定有 favorite range
		subjs, err = subject.Global(ctx, r.SubjectType, favRange)
		if err != nil {
			logger.Warn("Failed to get global: " + err.Error())
			return err
		}
	} else {
		colls, err := collection.Fetch(ctx, r.UserID, r.SubjectType, r.CollectionTypes)
		if err != nil {
			logger.Warn("Failed to get collection: " + err.Error())
			return err
		}

		timeElapse(&begin, "获取收藏")

		subjs, err = subject.Build(ctx, colls)
		if err != nil {
			logger.Warn("Failed to load subjects: " + err.Error())
			return err
		}
	}

	for _, s := range subjs {
		fmt.Printf("%s\n", s.NameCN)
	}
	timeElapse(&begin, "加载条目信息")

	if !*r.ShowNSFW {
		subjs = subject.Filter(subjs, subject.ByNSFW())
	}
	subjs = subject.Filter(subjs, subject.ByTags(r.PositiveTags, r.NegativeTags))
	subjs = subject.Filter(subjs, subject.ByDate(r.DateRange))
	subjs = subject.Filter(subjs, subject.ByFavorite(r.FavoriteRange))
	subjs = subject.Filter(subjs, subject.ByRate(r.RateRange))

	timeElapse(&begin, "过滤")

	posID := position.PositionID(r.SubjectType, r.Position)

	perToSubjs, err := person.Build(ctx, subjs, posID)
	if err != nil {
		logger.Error("Failed to create person subject map: " + err.Error())
		return err
	}

	for p, ss := range perToSubjs {
		fmt.Println(p.NameCN)
		for _, s := range ss {
			fmt.Printf("%s, ", s.NameCN)
		}
		fmt.Print("\n\n")
	}

	timeElapse(&begin, "人物 → 条目")

	perToMainSubjs, seriesCnt, err := sequel.ExtractMains(ctx, subjs, perToSubjs)
	if err != nil {
		logger.Error("Failed to get main subjects: " + err.Error())
		return err
	}

	timeElapse(&begin, "标注续作")

	// 创建人物到角色的映射
	var perToCharas map[*model.Person][]*character.Character
	var charaCnt int
	if strings.Contains(r.Position, "声优") {
		perToCharas, charaCnt, err = character.BuildCasts(ctx, perToSubjs, posID)
		if err != nil {
			logger.Error("Failed to create person character map: " + err.Error())
			return err
		}

		timeElapse(&begin, "人物 → 角色")
	}

	var summaries []*model.PersonSummary
	for per, subjs := range perToSubjs {
		mainSubjs := perToMainSubjs[per]
		charas := perToCharas[per]

		summaries = append(summaries, &model.PersonSummary{
			Person: per,
			Subject: &model.SubjectSummary{
				Subjects: subjs,
				Count:    len(subjs),
				Average:  subject.CalcAverage(subjs),
				Overall:  subject.CalcOverall(subjs),
			},
			Series: &model.SubjectSummary{
				Subjects: mainSubjs,
				Count:    len(mainSubjs),
				Average:  subject.CalcAverage(mainSubjs),
				Overall:  subject.CalcOverall(mainSubjs),
			},
			Character: &model.CharacterSummary{
				Characters: charas,
				Count:      len(charas),
			},
		})
	}
	// 按照作品数、平均分降序排序
	SortByCount(summaries, false)

	e.Statistics = &model.Statistics{
		PeopleSummary:  summaries,
		PersonCount:    len(summaries),
		SubjectCount:   len(subjs),
		SeriesCount:    seriesCnt,
		CharacterCount: charaCnt,
	}

	timeElapse(&begin, "提取总结")

	return nil
}

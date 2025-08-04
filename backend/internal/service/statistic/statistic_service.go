package statistic

import (
	"context"
	"math"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/constant"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/pkg/filter"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/pkg/sorter"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service/character"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service/collection"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service/person"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service/series"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
)

// 完整逻辑的超时时间
const timeoutConst time.Duration = time.Second * 600

func timeElapse(begin *time.Time, msg string) {
	logger.Debug(msg, logger.Field("time cost", time.Since(*begin)))
	*begin = time.Now()
}

func GetFullStatistics(ctx context.Context, r *model.Request) (*model.Statistics, error) {
	ctx, cancel := context.WithTimeout(ctx, timeoutConst)
	defer cancel()

	var subjects []*model.Subject
	var err error

	begin := time.Now()

	// 获取条目 ID 列表
	if r.UserID == "0" { // 查询全站数据
		subjects, err = subject.Global(ctx, r.SubjectType, r.FavoriteRange)
	} else { // 查询用户收藏
		subjects, err = collection.Fetch(ctx, r.UserID, r.SubjectType, r.CollectionTypes)
	}
	if err != nil {
		logger.Warn("Failed to get collection: " + err.Error())
		return nil, err
	}

	timeElapse(&begin, "获取全部条目")

	// 加载条目完整信息
	err = subject.LoadInfos(ctx, &subjects)
	if err != nil {
		logger.Error("Failed to load subject: " + err.Error())
		return nil, err
	}

	timeElapse(&begin, "加载条目信息")

	// 过滤 NSFW
	if !r.ShowNSFW {
		filter.FilterNSFW(&subjects)
	}

	// 根据标签筛选条目
	filter.FilterByTags(&subjects, r.PositiveTags, r.NegativeTags)

	// 根据分数范围筛选条目
	if len(r.RateRange) >= 2 {
		if err := filter.FilterByRates(&subjects, r.RateRange); err != nil {
			return nil, err
		}
	}

	// 根据人数范围筛选条目
	if len(r.FavoriteRange) >= 2 {
		if err := filter.FilterByPopularity(&subjects, r.FavoriteRange); err != nil {
			return nil, err
		}
	}

	// 根据日期范围筛选条目
	if len(r.DateRange) >= 2 {
		if err := filter.FilterByDate(&subjects, r.DateRange); err != nil {
			return nil, err
		}
	}

	timeElapse(&begin, "过滤")

	// 标注条目的续作信息
	err = series.MarkSequelOrders(ctx, subjects)
	if err != nil {
		logger.Error("Failed to mark sequel: " + err.Error())
		return nil, err
	}

	timeElapse(&begin, "标注续作")

	// 需要提前获取 positionIDs，以免 repository 层并发大量重复调用 PositionIDs 导致未知的并发读取 map 错误
	positionIDs, err := constant.PositionIDs(r.SubjectType, r.Position)
	if err != nil {
		logger.Error("Failed to get position IDs: " + err.Error())
		return nil, err
	}

	// 创建人物到条目的映射
	personSubjects, err := person.PersonSubjectsMap(ctx, subjects, positionIDs)
	if err != nil {
		logger.Error("Failed to create person subject map: " + err.Error())
		return nil, err
	}

	timeElapse(&begin, "人物 → 条目")

	// 加载人物名
	person.LoadInfos(ctx, personSubjects)

	timeElapse(&begin, "加载人物信息")

	// 创建人物到角色的映射
	var personCharacters map[*model.Person][]*model.Character
	if strings.Contains(r.Position, "声优") {
		personCharacters, err = character.PersonCharactersMap(ctx, personSubjects)
		if err != nil {
			logger.Error("Failed to create person character map: " + err.Error())
			return nil, err
		}

		timeElapse(&begin, "人物 → 角色")

		if err = character.LoadInfos(ctx, personCharacters); err != nil {
			logger.Error("Failed to load characters: " + err.Error())
			return nil, err
		}

		timeElapse(&begin, "加载角色信息")
	}

	// 提取总结
	summaries := createSummaries(personSubjects, personCharacters)
	// 按照作品数、平均分降序排序
	sorter.SortByCount(summaries, false)

	full := &model.Statistics{
		PeopleSummary:  summaries,
		PersonCount:    len(summaries),
		SubjectCount:   len(subjects),
		SeriesCount:    len(extractMainSubjects(subjects)),
		CharacterCount: countCharacters(personCharacters),
	}

	timeElapse(&begin, "提取总结")

	return full, nil
}

// createSummaries 创建最终的响应内容
func createSummaries(ps map[*model.Person][]*model.Subject, pc map[*model.Person][]*model.Character) []*model.PersonSummary {
	summaries := make([]*model.PersonSummary, 0, len(ps))

	for p, subjects := range ps {
		characters := pc[p]

		characterBelongingSubjects := extractBelongingSubjects(characters) // 每个角色属于的条目
		seriesSubjects := extractMainSubjects(subjects)                    // 每个系列的主条目

		averageRate := calcAverageRate(subjects, false)
		seriesAverageRate := calcAverageRate(seriesSubjects, true)

		scoredSubjectCount := 0
		for _, s := range subjects {
			if s.Rate() > 0 {
				scoredSubjectCount++
			}
		}
		scoredSeries := make(map[*model.Subject]struct{})
		for _, s := range seriesSubjects {
			if s.SeriesRate > 0 {
				scoredSeries[s] = struct{}{}
			}
		}
		scoredSeriesCount := len(scoredSeries)

		summary := &model.PersonSummary{
			PersonID:     p.ID,
			PersonName:   p.Name,
			PersonNameCN: p.NameCN,

			Subject: &model.SubjectSummary{
				IDs:     extractIDs(subjects),
				Names:   extractNames(subjects),
				NamesCN: extractNamesCN(subjects),
				Images:  extractImages(subjects),
				Rates:   extractRates(subjects, false),
				Average: averageRate,
				Overall: calcOverallRate(averageRate, scoredSubjectCount),
				Count:   len(subjects),
			},
			Series: &model.SubjectSummary{
				IDs:     extractIDs(seriesSubjects),
				Names:   extractNames(seriesSubjects),
				NamesCN: extractNamesCN(seriesSubjects),
				Images:  extractImages(seriesSubjects),
				Rates:   extractRates(seriesSubjects, true),
				Average: seriesAverageRate,
				Overall: calcOverallRate(seriesAverageRate, scoredSeriesCount),
				Count:   len(seriesSubjects),
			},
			Character: &model.CharacterSummary{
				IDs:            extractIDs(characters),
				Names:          extractNames(characters),
				NamesCN:        extractNamesCN(characters),
				Images:         extractImages(characters),
				SubjectNames:   extractNames(characterBelongingSubjects),
				SubjectNamesCN: extractNamesCN(characterBelongingSubjects),
				Count:          len(characters),
			},
		}

		summaries = append(summaries, summary)
	}

	return summaries
}

func extractIDs[T model.Item](items []T) []int {
	ids := make([]int, 0, len(items))
	for _, item := range items {
		ids = append(ids, item.GetID())
	}
	return ids
}

func extractNames[T model.Item](items []T) []string {
	names := make([]string, 0, len(items))
	for _, item := range items {
		names = append(names, item.GetName())
	}
	return names
}

func extractNamesCN[T model.Item](items []T) []string {
	namesCN := make([]string, 0, len(items))
	for _, item := range items {
		namesCN = append(namesCN, item.GetNameCN())
	}
	return namesCN
}

func extractImages[T model.Item](items []T) []string {
	images := make([]string, 0, len(items))
	for _, item := range items {
		images = append(images, item.GetImage())
	}
	return images
}

func extractRates(subjects []*model.Subject, isSeries bool) []float32 {
	rates := make([]float32, 0, len(subjects))
	for _, s := range subjects {
		if isSeries {
			rates = append(rates, s.SeriesRate)
		} else {
			rates = append(rates, s.Rate())
		}
	}
	return rates
}

// calcAverageRate 计算一个人物所有作品或系列的均分
func calcAverageRate(subjects []*model.Subject, isSeries bool) float32 {
	var sum float32
	var validRateCount int
	for _, s := range subjects {
		if isSeries {
			if s.SeriesRate == 0 {
				continue
			}
			sum += s.SeriesRate
		} else {
			if s.Rate() == 0 {
				continue
			}
			sum += s.Rate()
		}
		validRateCount += 1
	}
	if validRateCount == 0 {
		return 0
	}
	avg := sum / float32(validRateCount)
	return float32(math.Round(float64(avg)*100) / 100)
}

// calcOverallRate 计算综合加权分
func calcOverallRate(averageRate float32, number int) float32 {
	if averageRate == 0 {
		return 0
	}

	constant := 5.0
	middleRate := 5.0
	n := float64(number)
	ar := float64(averageRate)

	overallRate := (n/(n+constant))*ar + (constant/(n+constant))*middleRate
	return float32(math.Round(float64(overallRate)*100) / 100)
}

func extractBelongingSubjects(characters []*model.Character) []*model.Subject {
	subjects := make([]*model.Subject, 0, len(characters))
	for _, c := range characters {
		subjects = append(subjects, c.BelongingSubject)
	}
	return subjects
}

func extractMainSubjects(subjects []*model.Subject) []*model.Subject {
	addedSeries := make(map[*model.Subject]struct{})
	mainSubjects := make([]*model.Subject, 0, len(subjects))
	for _, s := range subjects {
		if _, ok := addedSeries[s.SeriesMainSubject]; !ok {
			mainSubjects = append(mainSubjects, s.SeriesMainSubject)
			addedSeries[s.SeriesMainSubject] = struct{}{}
		}
	}
	return mainSubjects
}

func countCharacters(pc map[*model.Person][]*model.Character) int {
	set := make(map[*model.Character]struct{})
	for _, characters := range pc {
		for _, c := range characters {
			set[c] = struct{}{}
		}
	}
	return len(set)
}

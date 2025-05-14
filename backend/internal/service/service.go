package service

import (
	"context"
	"math"
	"sort"
	"strings"
	"time"

	charactersvc "github.com/AcuLY/BangumiStaffStats/backend/internal/service/character"
	collectionsvc "github.com/AcuLY/BangumiStaffStats/backend/internal/service/collection"
	personsvc "github.com/AcuLY/BangumiStaffStats/backend/internal/service/person"
	subjectsvc "github.com/AcuLY/BangumiStaffStats/backend/internal/service/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/constants"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/tagutil"
)

// 完整逻辑的超时时间
var timeout time.Duration = time.Second * 60

func Statistics(ctx context.Context, r *model.Request) (*model.Response, error) {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	var subjects []*model.Subject
	var err error

	// 获取条目 ID 列表
	if r.UserID == "0" { // 查询全站数据
		subjects, err = subjectsvc.GetGlobalSubjects(ctx, r.SubjectType)
	} else { // 查询用户收藏
		subjects, err = collectionsvc.GetUserCollections(ctx, r.UserID, r.SubjectType, r.CollectionTypes)
	}
	if err != nil {
		logger.Warn("Failed to get collection: " + err.Error())
		return nil, err
	}

	// 加载条目完整信息
	err = subjectsvc.LoadSubjects(ctx, &subjects)
	if err != nil {
		logger.Error("Failed to load subject: " + err.Error())
		return nil, err
	}

	// 根据标签筛选条目
	tags := tagutil.ParseTags(r.Tags)
	tagutil.FilterSubjectsByTags(&subjects, tags)

	// 标注条目的续作信息
	err = subjectsvc.MarkSequelOrders(ctx, subjects)
	if err != nil {
		logger.Error("Failed to mark sequel: " + err.Error())
		return nil, err
	}

	// 需要提前获取 positionIDs，以免 repository 层并发大量重复调用 PositionIDs 导致未知的并发读取 map 错误
	positionIDs, err := constants.PositionIDs(r.SubjectType, r.Position)
	if err != nil {
		logger.Error("Failed to get position IDs: " + err.Error())
		return nil, err
	}

	// 创建人物到条目的映射
	personSubjects, err := personsvc.CreatePersonSubjectsMap(ctx, subjects, positionIDs)
	if err != nil {
		logger.Error("Failed to create person subject map: " + err.Error())
		return nil, err
	}

	// 加载人物名
	personsvc.LoadPeople(ctx, personSubjects)

	// 创建人物到角色的映射
	var personCharacters map[*model.Person][]*model.Character
	if strings.Contains(r.Position, "声优") {
		personCharacters, err = charactersvc.CreatePersonCharactersMap(ctx, personSubjects)
		if err != nil {
			logger.Error("Failed to create person character map: " + err.Error())
			return nil, err
		}

		if err = charactersvc.LoadCharacters(ctx, personCharacters); err != nil {
			logger.Error("Failed to load characters: " + err.Error())
			return nil, err
		}
	}

	// 提取总结
	summaries := createSummaries(personSubjects, personCharacters)
	// 按照作品数、平均分降序排序
	sort.Slice(summaries, func(i int, j int) bool {
		if summaries[i].SubjectsNumber == summaries[j].SubjectsNumber {
			return summaries[i].AverageRate >= summaries[j].AverageRate
		}
		return summaries[i].SubjectsNumber > summaries[j].SubjectsNumber
	})

	invalid := make([]*model.Subject, 0) // 无效条目，暂时不需要

	resp := &model.Response{
		PeopleSummary:   summaries,
		InvalidSubjects: invalid,
		SubjectCount:    len(subjects),
		SeriesCount:     len(extractSeriesSubjects(subjects)),
	}
	return resp, nil
}

// createSummaries 创建最终的响应内容
func createSummaries(ps map[*model.Person][]*model.Subject, pc map[*model.Person][]*model.Character) []*model.PersonSummary {
	summaries := make([]*model.PersonSummary, 0, len(ps))

	for p, subjects := range ps {
		characters := pc[p]

		characterBelongingSubjects := extractCharacterSubjects(characters) // 每个角色属于的条目
		seriesSubjects := extractSeriesSubjects(subjects)                  // 每个系列的主条目

		averageRate := calcAverageRate(subjects, false)
		seriesAverageRate := calcAverageRate(seriesSubjects, true)

		summary := &model.PersonSummary{
			PersonID:     p.ID,
			PersonName:   p.Name,
			PersonNameCN: p.NameCN,

			SubjectIDs:     extractIDs(subjects),
			SubjectNames:   extractNames(subjects),
			SubjectNamesCN: extractNamesCN(subjects),
			SubjectImages:  extractImages(subjects),
			Rates:          extractRates(subjects, false),
			AverageRate:    averageRate,
			OverallRate:    calcOverallRate(averageRate, len(subjects)),
			SubjectsNumber: len(subjects),

			CharacterIDs:            extractIDs(characters),
			CharacterNames:          extractNames(characters),
			CharacterNamesCN:        extractNamesCN(characters),
			CharacterImages:         extractImages(characters),
			CharacterSubjectNames:   extractNames(characterBelongingSubjects),
			CharacterSubjectNamesCN: extractNamesCN(characterBelongingSubjects),
			CharactersNumber:        len(characters),

			SeriesSubjectIDs:     extractIDs(seriesSubjects),
			SeriesSubjectNames:   extractNames(seriesSubjects),
			SeriesSubjectNamesCN: extractNamesCN(seriesSubjects),
			SeriesSubjectImages:  extractImages(seriesSubjects),
			SeriesRates:          extractRates(seriesSubjects, true),
			SeriesAverageRate:    seriesAverageRate,
			SeriesOverallRate:    calcOverallRate(seriesAverageRate, len(seriesSubjects)),
			SeriesSubjectsNumber: len(seriesSubjects),
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

func extractCharacterSubjects(characters []*model.Character) []*model.Subject {
	subjects := make([]*model.Subject, 0, len(characters))
	for _, c := range characters {
		subjects = append(subjects, c.BelongingSubject)
	}
	return subjects
}

func extractSeriesSubjects(subjects []*model.Subject) []*model.Subject {
	addedSeries := make(map[*model.Subject]struct{})
	seriesSubjects := make([]*model.Subject, 0, len(subjects))
	for _, s := range subjects {
		if _, ok := addedSeries[s.SeriesMainSubject]; !ok {
			seriesSubjects = append(seriesSubjects, s.SeriesMainSubject)
			addedSeries[s.SeriesMainSubject] = struct{}{}
		}
	}
	return seriesSubjects
}

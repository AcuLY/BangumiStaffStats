package filter

import (
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// parseTags 解析输入的标签。
//
// 例：[原创/漫画改, 百合] 将被解析为 [[原创, 漫画改], [百合]]。
func parseTags(tags []string, isPositive bool) [][]string {
	parsedTags := make([][]string, 0)

	for _, tag := range tags {
		if isPositive {
			parsedTags = append(parsedTags, strings.Split(tag, "/"))
		} else {
			parsedTags = append(parsedTags, strings.Split(tag, "+"))
		}
	}

	return parsedTags
}

// matchPositiveTags 根据总合取范式判断条目是否符合正向标签要求。
//
//   - [[2022, 2023, 2024], [原创, 漫画改], [百合]] 表示该条目应该为
//     2022 至 2024 年播出的 原创或漫画改的 百合作品。
func matchPositiveTags(s *model.Subject, conjunctionTags [][]string) bool {
	if len(conjunctionTags) == 0 {
		return true
	}

	subjectTags := make(map[string]struct{}, len(s.Tags))
	for _, tag := range s.Tags {
		subjectTags[tag] = struct{}{}
	}

	for _, disjunction := range conjunctionTags {
		match := false

		for _, tag := range disjunction {
			if _, exists := subjectTags[tag]; exists {
				match = true
				break
			}
		}

		if !match {
			return false
		}
	}

	return true
}

// matchNegativeTags 根据总析取范式判断条目是否符合反向标签要求。
func matchNegativeTags(s *model.Subject, disjunctionTags [][]string) bool {
	if len(disjunctionTags) == 0 {
		return false
	}

	subjectTags := make(map[string]struct{}, len(s.Tags))
	for _, tag := range s.Tags {
		subjectTags[tag] = struct{}{}
	}

	for _, conjunction := range disjunctionTags {
		allMatch := true

		for _, tag := range conjunction {
			if _, exists := subjectTags[tag]; !exists {
				allMatch = false
				break
			}
		}

		if allMatch {
			return true
		}
	}

	return false
}

// FilterByTags 根据标签过滤条目。
//
//   - 若 tags 为 [[原创, 漫画改], [百合]]，
//     则目标条目应该为原创或漫画改的百合作品。
func FilterByTags(subjects *[]*model.Subject, PositiveTags []string, Negativetags []string) {
	parsedPositiveTags := parseTags(PositiveTags, true)
	parsedNegativeTags := parseTags(Negativetags, false)

	subjectsSlice := *subjects
	count := 0

	for _, s := range subjectsSlice {
		if matchPositiveTags(s, parsedPositiveTags) && !matchNegativeTags(s, parsedNegativeTags) {
			subjectsSlice[count] = s
			count++
		}
	}

	*subjects = subjectsSlice[:count]
}

// FilterNSFW 过滤 nsfw 条目
func FilterNSFW(subjects *[]*model.Subject) {
	count := 0

	for _, s := range *subjects {
		if !s.NSFW {
			(*subjects)[count] = s
			count++
		}
	}

	*subjects = (*subjects)[:count]
}

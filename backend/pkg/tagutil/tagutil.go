package tagutil

import (
	"strconv"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/pkg/model"
)

// ParseTags 解析输入的标签。
//
// 例：[2022-2024, 原创/漫画改, 百合] 将被解析为 [[2022, 2023, 2024], [原创, 漫画改], [百合]]。
func ParseTags(tags []string) [][]string {
	conjunction := make([][]string, 0)
	for _, tag := range tags {
		conjunction = append(conjunction, strings.Split(tag, "/"))
	}

	for i, disjunction := range conjunction {
		newDisjunction := make([]string, 0, len(disjunction))

		for _, tag := range disjunction {
			if !strings.Contains(tag, "-") {
				newDisjunction = append(newDisjunction, tag)
				continue
			}

			beginAndEnd := strings.Split(tag, "-")
			if len(beginAndEnd) > 2 {
				newDisjunction = append(newDisjunction, tag)
				continue
			}

			begin, err1 := strconv.Atoi(beginAndEnd[0])
			end, err2 := strconv.Atoi(beginAndEnd[1])
			if err1 != nil || err2 != nil {
				newDisjunction = append(newDisjunction, tag)
				continue
			}

			for year := begin; year <= end; year++ {
				newDisjunction = append(newDisjunction, strconv.Itoa(year))
			}

		}

		conjunction[i] = newDisjunction
	}

	return conjunction
}

// matchTags 根据判断条目是否符合标签要求。
//
// - [[2022, 2023, 2024], [原创, 漫画改], [百合]] 表示该条目应该为
//   2022 至 2024 年播出的 原创或漫画改的 百合作品。
func matchTags(s *model.Subject, conjunctionTags [][]string) bool {
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

// FilterSubjectsByTags 根据标签过滤条目。
//
// - 若 tags 为 [[2022, 2023, 2024], [原创, 漫画改], [百合]]，
//   则目标条目应该为 2022 至 2024 年播出的原创或漫画改的百合作品。
func FilterSubjectsByTags(subjects *[]*model.Subject, tags [][]string) {
	subjectsSlice := *subjects
	count := 0
	
	for _, s := range subjectsSlice {
		if matchTags(s, tags) {
			subjectsSlice[count] = s
			count++
		}
	}
	*subjects = subjectsSlice[:count]
}
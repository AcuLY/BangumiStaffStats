package subject

import (
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

func Filter(subjects []*model.Subject, pass func(*model.Subject) bool) []*model.Subject {
	filtered := make([]*model.Subject, 0, len(subjects))

	for _, s := range subjects {
		if pass(s) {
			filtered = append(filtered, s)
		}
	}

	return filtered
}

func ByDate(dateRange []*int) func(*model.Subject) bool {
	return func(s *model.Subject) bool {
		if len(dateRange) < 2 {
			return true
		}

		if dateRange[0] != nil && s.Date.Before(timestampToTime(*dateRange[0])) {
			return false
		}
		if dateRange[1] != nil && s.Date.After(timestampToTime(*dateRange[1])) {
			return false
		}

		return true
	}
}

func ByFavorite(favoriteRange []*int) func(*model.Subject) bool {
	return func(s *model.Subject) bool {
		if len(favoriteRange) < 2 {
			return true
		}

		if favoriteRange[0] != nil && *favoriteRange[0] > s.Favorite {
			return false
		}
		if favoriteRange[1] != nil && *favoriteRange[1] < s.Favorite {
			return false
		}

		return true
	}
}

func ByRate(rateRange []*float64) func(*model.Subject) bool {
	return func(s *model.Subject) bool {
		if len(rateRange) < 2 {
			return true
		}

		if rateRange[0] != nil && *rateRange[0] > s.Rate {
			return false
		}
		if rateRange[1] != nil && *rateRange[1] < s.Rate {
			return false
		}

		return true
	}
}

func ByTags(positiveRaw []string, negativeRaw []string) func(*model.Subject) bool {
	positiveTags := parseTags(positiveRaw, true)
	negativeTags := parseTags(negativeRaw, false)

	return func(s *model.Subject) bool {
		return matchAll(s, positiveTags) && !matchAny(s, negativeTags)
	}
}

func ByNSFW() func(*model.Subject) bool {
	return func(s *model.Subject) bool {
		return !s.NSFW
	}
}

func timestampToTime(timestamp int) time.Time {
	return time.Unix(int64(timestamp/1000), 0)
}

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

func matchAll(s *model.Subject, conjunctionTags [][]string) bool {
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

func matchAny(s *model.Subject, disjunctionTags [][]string) bool {
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

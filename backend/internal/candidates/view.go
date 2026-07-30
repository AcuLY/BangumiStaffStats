package candidates

import (
	"context"
	"math"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

const maxJSONSafeInteger int64 = 9007199254740991

// NormalizeView applies exact defaults and scope-specific validation.
func NormalizeView(scope string, input *ViewInput) (View, error) {
	result := View{
		Sort:     SortCount,
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	}
	if input != nil {
		if input.Search != nil {
			result.Search = *input.Search
		}
		if input.Sort != nil {
			result.Sort = *input.Sort
		}
		if input.Order != nil {
			result.Order = *input.Order
		}
		if input.Page != nil {
			result.Page = *input.Page
		}
		if input.PageSize != nil {
			result.PageSize = *input.PageSize
		}
	}
	if !utf8.ValidString(result.Search) ||
		utf8.RuneCountInString(result.Search) > 256 {
		return View{}, fieldError("/view/search")
	}
	switch scope {
	case "global":
		if result.Sort != SortCount && result.Sort != SortAverage {
			return View{}, fieldError("/view/sort")
		}
	case "personal":
		if result.Sort != SortCount &&
			result.Sort != SortAverage &&
			result.Sort != SortGlobalAverage {
			return View{}, fieldError("/view/sort")
		}
	default:
		return View{}, fieldError("/query/scope")
	}
	if result.Order != OrderAscending && result.Order != OrderDescending {
		return View{}, fieldError("/view/order")
	}
	if result.Page < 1 || result.Page > maxJSONSafeInteger {
		return View{}, fieldError("/view/page")
	}
	if result.PageSize != 5 && result.PageSize != 10 && result.PageSize != 20 {
		return View{}, fieldError("/view/pageSize")
	}
	result.Search = normalizeSearch(result.Search)
	return result, nil
}

// Project ranks the complete current-position set before search and checked
// pagination. It never mutates core.
func Project(ctx context.Context, core Core, view View) (Page, error) {
	if err := contextError(ctx); err != nil {
		return Page{}, err
	}
	if _, err := NormalizeView(core.Scope, &ViewInput{
		Search:   &view.Search,
		Sort:     &view.Sort,
		Order:    &view.Order,
		Page:     &view.Page,
		PageSize: &view.PageSize,
	}); err != nil {
		return Page{}, err
	}

	rows := make(map[int64]Row, len(core.Rows))
	entries := make([]statistics.PersonSortEntry, 0, len(core.Rows))
	for _, row := range core.Rows {
		if row.Person.ID <= 0 || row.WorkCount < 0 {
			return Page{}, fieldError("")
		}
		if _, duplicate := rows[row.Person.ID]; duplicate {
			return Page{}, fieldError("")
		}
		rows[row.Person.ID] = row
		average, ratedCount := selectedAverage(core.Scope, view.Sort, row)
		entries = append(entries, statistics.PersonSortEntry{
			PersonID:          row.Person.ID,
			Count:             row.WorkCount,
			AverageHundredths: average,
			ValidRatingCount:  ratedCount,
		})
	}

	profile := statistics.SortPersonCount
	if view.Sort == SortAverage || view.Sort == SortGlobalAverage {
		profile = statistics.SortPersonAverage
	}
	direction := statistics.Descending
	if view.Order == OrderAscending {
		direction = statistics.Ascending
	}
	ordered, err := statistics.SortPeople(ctx, profile, direction, entries)
	if err != nil {
		return Page{}, evaluationError(ctx, err)
	}

	search := normalizeSearch(view.Search)
	filtered := make([]Item, 0, len(ordered))
	for index, personID := range ordered {
		if err := contextError(ctx); err != nil {
			return Page{}, err
		}
		row := rows[personID]
		if search != "" &&
			!strings.Contains(normalizeSearch(row.Person.Name), search) &&
			(row.Person.NameCN == nil ||
				!strings.Contains(normalizeSearch(*row.Person.NameCN), search)) {
			continue
		}
		filtered = append(filtered, Item{
			Rank:      index + 1,
			Person:    clonePerson(row.Person),
			WorkCount: row.WorkCount,
		})
	}

	total := len(filtered)
	start := checkedPageStart(view.Page, view.PageSize, total)
	end := start + view.PageSize
	if end > total {
		end = total
	}
	items := append([]Item(nil), filtered[start:end]...)
	for index := range items {
		items[index].Person = clonePerson(items[index].Person)
	}
	return Page{
		PositionCounts: append([]PositionCount(nil), core.PositionCounts...),
		PositionKey:    core.PositionKey,
		WorkUnit:       core.WorkUnit,
		Items:          items,
		Page:           view.Page,
		PageSize:       view.PageSize,
		Total:          total,
	}, nil
}

func normalizeSearch(value string) string {
	return cases.Fold().String(norm.NFKC.String(query.TrimV1(value)))
}

func selectedAverage(scope string, sort Sort, row Row) (*int64, int) {
	if scope == "personal" && sort != SortGlobalAverage {
		return cloneInt64(row.PersonalAverage), row.PersonalRatedCount
	}
	return cloneInt64(row.GlobalAverage), row.GlobalRatedCount
}

func checkedPageStart(page int64, pageSize int, total int) int {
	offset := page - 1
	if offset > int64(math.MaxInt)/int64(pageSize) {
		return total
	}
	start := offset * int64(pageSize)
	if start >= int64(total) {
		return total
	}
	return int(start)
}

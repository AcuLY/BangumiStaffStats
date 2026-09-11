package ranking

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

func normalizeView(raw json.RawMessage, scope string) (View, error) {
	result := View{
		Sort:     "count",
		Order:    statistics.Descending,
		Page:     1,
		PageSize: 10,
	}
	if len(raw) == 0 {
		return result, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return View{}, viewFailure("/view", "INVALID_TYPE")
	}
	fields, err := decodeRawObject(raw)
	if err != nil {
		return View{}, viewFailure("/view", "INVALID_TYPE")
	}
	for name := range fields {
		switch name {
		case "search", "sort", "order", "page", "pageSize", "locatePersonId":
		default:
			return View{}, fail(
				CodeInvalidRequest,
				"rankings request is invalid",
				"",
				"",
				false,
				nil,
			)
		}
	}
	if value, found := fields["search"]; found {
		if err := json.Unmarshal(value, &result.Search); err != nil ||
			!utf8.ValidString(result.Search) ||
			utf8.RuneCountInString(result.Search) > maxSearchRunes {
			return View{}, viewFailure("/view/search", "OUT_OF_RANGE")
		}
	}
	if value, found := fields["sort"]; found {
		if err := json.Unmarshal(value, &result.Sort); err != nil {
			return View{}, viewFailure("/view/sort", "INVALID_TYPE")
		}
		switch result.Sort {
		case "count", "average", "overall", "preference":
		default:
			return View{}, viewFailure("/view/sort", "UNSUPPORTED_VALUE")
		}
	}
	if scope == "global" && result.Sort == "preference" {
		return View{}, fail(
			CodeFieldInvalid,
			"rankings view is invalid",
			"/view/sort",
			"UNSUPPORTED_VALUE",
			false,
			nil,
		)
	}
	if value, found := fields["order"]; found {
		var order string
		if err := json.Unmarshal(value, &order); err != nil {
			return View{}, viewFailure("/view/order", "INVALID_TYPE")
		}
		result.Order = statistics.Direction(order)
		if result.Order != statistics.Ascending && result.Order != statistics.Descending {
			return View{}, viewFailure("/view/order", "UNSUPPORTED_VALUE")
		}
	}
	if value, found := fields["page"]; found {
		page, parseErr := exactPositiveInteger(value)
		if parseErr != nil || page > maxJSONSafeInteger {
			return View{}, viewFailure("/view/page", "OUT_OF_RANGE")
		}
		result.Page = page
	}
	if value, found := fields["pageSize"]; found {
		pageSize, parseErr := exactPositiveInteger(value)
		if parseErr != nil {
			return View{}, viewFailure("/view/pageSize", "INVALID_TYPE")
		}
		switch pageSize {
		case 5, 10, 20:
			result.PageSize = int(pageSize)
		default:
			return View{}, viewFailure("/view/pageSize", "UNSUPPORTED_VALUE")
		}
	}
	if value, found := fields["locatePersonId"]; found {
		personID, parseErr := exactPositiveInteger(value)
		if parseErr != nil {
			return View{}, viewFailure("/view/locatePersonId", "OUT_OF_RANGE")
		}
		result.LocatePersonID = &personID
	}
	result.Search = normalizeSearch(result.Search)
	return result, nil
}

func viewFailure(path, fieldCode string) error {
	return fail(
		CodeFieldInvalid,
		"rankings view is invalid",
		path,
		fieldCode,
		false,
		nil,
	)
}

func exactPositiveInteger(raw json.RawMessage) (int64, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return 0, err
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, errors.New("ranking: integer required")
	}
	rational, ok := new(big.Rat).SetString(number.String())
	if !ok || rational.Sign() <= 0 || !rational.IsInt() ||
		!rational.Num().IsInt64() {
		return 0, errors.New("ranking: positive integer required")
	}
	integer := rational.Num().Int64()
	if integer > maxJSONSafeInteger {
		return 0, errors.New("ranking: integer exceeds JSON safe range")
	}
	return integer, nil
}

func normalizeSearch(value string) string {
	return cases.Fold().String(norm.NFKC.String(query.TrimV1(value)))
}

type rankedRow struct {
	rank int
	row  rowCore
}

func project(
	ctx context.Context,
	value core,
	view View,
	collection *runtimecache.CollectionAccess,
) (Projection, error) {
	if cause := context.Cause(ctx); cause != nil {
		return Projection{}, cause
	}
	sortEntries := make([]statistics.PersonSortEntry, len(value.Rows))
	rowsByID := make(map[int64]rowCore, len(value.Rows))
	for index, row := range value.Rows {
		if cause := context.Cause(ctx); cause != nil {
			return Projection{}, cause
		}
		var preference *statistics.Rational
		if row.Preference != nil {
			copy := row.Preference.Score
			preference = &copy
		}
		sortEntries[index] = statistics.PersonSortEntry{
			PersonID:          row.Person.ID,
			Count:             row.WorkCount,
			AverageHundredths: cloneInt64(row.Average),
			ValidRatingCount:  row.RatedUnitCount,
			OverallHundredths: cloneInt64(row.Overall),
			Preference:        preference,
			EffectiveEvidence: row.EffectiveEvidence,
		}
		rowsByID[row.Person.ID] = cloneRow(row)
	}
	profile := statistics.SortPersonCount
	switch view.Sort {
	case "average":
		profile = statistics.SortPersonAverage
	case "overall":
		profile = statistics.SortPersonOverall
	case "preference":
		profile = statistics.SortPersonPreference
	}
	orderedIDs, err := statistics.SortPeople(ctx, profile, view.Order, sortEntries)
	if err != nil {
		return Projection{}, err
	}
	ranked := make([]rankedRow, 0, len(orderedIDs))
	for index, id := range orderedIDs {
		row, found := rowsByID[id]
		if !found {
			return Projection{}, errors.New("ranking: sorted person missing")
		}
		ranked = append(ranked, rankedRow{rank: index + 1, row: row})
	}

	scale, err := statistics.PersonMetricScale(ctx, view.Sort, sortEntries)
	if err != nil {
		return Projection{}, err
	}
	var location *Location
	if view.LocatePersonID != nil {
		location = &Location{PersonID: *view.LocatePersonID}
		for _, item := range ranked {
			if item.row.Person.ID == location.PersonID {
				rank := item.rank
				location.Rank = &rank
				break
			}
		}
	}
	filtered := ranked[:0]
	for _, item := range ranked {
		if view.Search == "" ||
			strings.Contains(item.row.SearchName, view.Search) ||
			strings.Contains(item.row.SearchNameCN, view.Search) {
			if location != nil && item.row.Person.ID == location.PersonID {
				page := int64(len(filtered)/view.PageSize + 1)
				location.Page = &page
			}
			filtered = append(filtered, item)
		}
	}
	total := len(filtered)
	page := checkedPage(filtered, view.Page, view.PageSize)
	result := Projection{
		location:    location,
		scope:       value.Scope,
		dataVersion: value.DataVersion,
		summary:     cloneSummary(value.Summary),
		metricScale: cloneMetricScale(scale),
		pagination: Pagination{
			Page:     view.Page,
			PageSize: view.PageSize,
			Total:    total,
		},
		globalItems:   make([]GlobalItem, 0),
		personalItems: make([]PersonalItem, 0),
	}
	if value.Scope == "personal" {
		if collection == nil {
			return Projection{}, errors.New("ranking: personal projection missing collection")
		}
		freshness := CollectionFreshness{
			FetchedAt:    collection.FetchedAt.UTC(),
			Stale:        collection.Stale,
			WarningCodes: append([]string{}, collection.WarningCodes...),
		}
		result.collection = &freshness
		result.personalItems = make([]PersonalItem, 0, len(page))
		for _, item := range page {
			result.personalItems = append(result.personalItems, PersonalItem{
				Rank:       item.rank,
				Person:     clonePerson(item.row.Person),
				WorkCount:  item.row.WorkCount,
				Average:    cloneInt64(item.row.Average),
				Overall:    cloneInt64(item.row.Overall),
				Preference: clonePreference(item.row.Preference),
			})
		}
		return result, nil
	}
	result.globalItems = make([]GlobalItem, 0, len(page))
	for _, item := range page {
		result.globalItems = append(result.globalItems, GlobalItem{
			Rank:      item.rank,
			Person:    clonePerson(item.row.Person),
			WorkCount: item.row.WorkCount,
			Average:   cloneInt64(item.row.Average),
			Overall:   cloneInt64(item.row.Overall),
		})
	}
	return result, nil
}

func checkedPage(values []rankedRow, page int64, pageSize int) []rankedRow {
	if len(values) == 0 || page <= 0 || pageSize <= 0 {
		return []rankedRow{}
	}
	pageOffset := page - 1
	if pageOffset > int64(len(values))/int64(pageSize) {
		return []rankedRow{}
	}
	start64 := pageOffset * int64(pageSize)
	if start64 >= int64(len(values)) {
		return []rankedRow{}
	}
	start := int(start64)
	end := start + pageSize
	if end > len(values) {
		end = len(values)
	}
	return append([]rankedRow(nil), values[start:end]...)
}

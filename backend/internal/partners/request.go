package partners

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

func normalizeOperationRequest(
	effective query.EffectiveQuery,
	request Request,
) (Operation, error) {
	input, err := parseInput(request.Input)
	if err != nil {
		return Operation{}, err
	}
	if err := validateInputMembership(effective, input); err != nil {
		return Operation{}, err
	}
	view, err := parseView(request.View, effective.Scope)
	if err != nil {
		return Operation{}, err
	}
	return Operation{Input: input, View: view}, nil
}

func parseInput(raw json.RawMessage) (Input, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return Input{}, requestFailure("partners input is required", "/input", "REQUIRED")
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return Input{}, requestFailure("partners input must be an object", "/input", "INVALID_TYPE")
	}
	for name := range fields {
		switch name {
		case "source", "candidatePositionKey":
		default:
			return Input{}, unknownFieldFailure("/input/" + escapePointerToken(name))
		}
	}
	sourceRaw, found := fields["source"]
	if !found {
		return Input{}, requestFailure("partners source is required", "/input/source", "REQUIRED")
	}
	source, err := parseSource(sourceRaw)
	if err != nil {
		return Input{}, err
	}
	result := Input{Source: source}
	if candidateRaw, found := fields["candidatePositionKey"]; found {
		value, parseErr := parsePositionKey(candidateRaw, "/input/candidatePositionKey")
		if parseErr != nil {
			return Input{}, parseErr
		}
		result.CandidatePositionKey = &value
	}
	return result, nil
}

func parseSource(raw json.RawMessage) (SourceInput, error) {
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return SourceInput{}, requestFailure(
			"partners source must be an object",
			"/input/source",
			"INVALID_TYPE",
		)
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return SourceInput{}, requestFailure(
			"partners source must be an object",
			"/input/source",
			"INVALID_TYPE",
		)
	}
	for name := range fields {
		switch name {
		case "personId", "positionKeys":
		default:
			return SourceInput{}, unknownFieldFailure(
				"/input/source/" + escapePointerToken(name),
			)
		}
	}
	personRaw, found := fields["personId"]
	if !found {
		return SourceInput{}, requestFailure(
			"source person is required",
			"/input/source/personId",
			"REQUIRED",
		)
	}
	personID, fieldCode, err := exactPositiveJSONInteger(personRaw)
	if err != nil {
		return SourceInput{}, requestFailure(
			"source person is invalid",
			"/input/source/personId",
			fieldCode,
		)
	}
	positionRaw, found := fields["positionKeys"]
	if !found {
		return SourceInput{}, requestFailure(
			"source positions are required",
			"/input/source/positionKeys",
			"REQUIRED",
		)
	}
	var elements []json.RawMessage
	if err := json.Unmarshal(positionRaw, &elements); err != nil || elements == nil {
		return SourceInput{}, requestFailure(
			"source positions must be an array",
			"/input/source/positionKeys",
			"INVALID_TYPE",
		)
	}
	if len(elements) == 0 {
		return SourceInput{}, requestFailure(
			"source positions must not be empty",
			"/input/source/positionKeys",
			"OUT_OF_RANGE",
		)
	}
	positions := make([]string, len(elements))
	seen := make(map[string]struct{}, len(elements))
	for index, element := range elements {
		path := fmt.Sprintf("/input/source/positionKeys/%d", index)
		key, parseErr := parsePositionKey(element, path)
		if parseErr != nil {
			return SourceInput{}, parseErr
		}
		if _, duplicate := seen[key]; duplicate {
			return SourceInput{}, requestFailure(
				"source positions must be unique",
				path,
				"DUPLICATE",
			)
		}
		seen[key] = struct{}{}
		positions[index] = key
	}
	return SourceInput{PersonID: personID, PositionKeys: positions}, nil
}

func parsePositionKey(raw json.RawMessage, path string) (string, error) {
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", requestFailure("position identity must be a string", path, "INVALID_TYPE")
	}
	if !utf8.ValidString(value) || utf8.RuneCountInString(value) < 1 ||
		utf8.RuneCountInString(value) > 96 {
		return "", requestFailure("position identity is invalid", path, "OUT_OF_RANGE")
	}
	return value, nil
}

func validateInputMembership(effective query.EffectiveQuery, input Input) error {
	positions := make(map[string]int, len(effective.PositionKeys))
	for index, key := range effective.PositionKeys {
		positions[key] = index
	}
	for index, key := range input.Source.PositionKeys {
		if _, exists := positions[key]; !exists {
			return requestFailure(
				"source position is not selected by the query",
				fmt.Sprintf("/input/source/positionKeys/%d", index),
				string(CodePositionNotFound),
			)
		}
	}
	if input.CandidatePositionKey != nil {
		if _, exists := positions[*input.CandidatePositionKey]; !exists {
			return requestFailure(
				"candidate position is not selected by the query",
				"/input/candidatePositionKey",
				string(CodePositionNotFound),
			)
		}
	}
	return nil
}

func parseView(raw json.RawMessage, scope string) (View, error) {
	result := View{
		Sort:     SortCount,
		Order:    statistics.Descending,
		Page:     1,
		PageSize: 10,
	}
	if len(raw) == 0 {
		return result, validateView(scope, result)
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return View{}, requestFailure("partners view must be an object", "/view", "INVALID_TYPE")
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return View{}, requestFailure("partners view must be an object", "/view", "INVALID_TYPE")
	}
	for name := range fields {
		switch name {
		case "search", "sort", "order", "page", "pageSize":
		default:
			return View{}, unknownFieldFailure("/view/" + escapePointerToken(name))
		}
	}
	if value, found := fields["search"]; found {
		if err := json.Unmarshal(value, &result.Search); err != nil {
			return View{}, requestFailure("partners search must be a string", "/view/search", "INVALID_TYPE")
		}
		if !utf8.ValidString(result.Search) || utf8.RuneCountInString(result.Search) > 256 {
			return View{}, requestFailure("partners search is too long", "/view/search", "OUT_OF_RANGE")
		}
	}
	if value, found := fields["sort"]; found {
		var sortValue string
		if err := json.Unmarshal(value, &sortValue); err != nil {
			return View{}, requestFailure("partners sort must be a string", "/view/sort", "INVALID_TYPE")
		}
		result.Sort = Sort(sortValue)
	}
	if value, found := fields["order"]; found {
		var order string
		if err := json.Unmarshal(value, &order); err != nil {
			return View{}, requestFailure("partners order must be a string", "/view/order", "INVALID_TYPE")
		}
		result.Order = statistics.Direction(order)
	}
	if value, found := fields["page"]; found {
		page, fieldCode, parseErr := exactPositiveJSONInteger(value)
		if parseErr != nil {
			return View{}, requestFailure("partners page is invalid", "/view/page", fieldCode)
		}
		result.Page = page
	}
	if value, found := fields["pageSize"]; found {
		pageSize, fieldCode, parseErr := exactPositiveJSONInteger(value)
		if parseErr != nil {
			return View{}, requestFailure("partners page size is invalid", "/view/pageSize", fieldCode)
		}
		if pageSize != 5 && pageSize != 10 && pageSize != 20 {
			return View{}, requestFailure(
				"partners page size is unsupported",
				"/view/pageSize",
				"UNSUPPORTED_VALUE",
			)
		}
		result.PageSize = int(pageSize)
	}
	if err := validateView(scope, result); err != nil {
		return View{}, err
	}
	result.Search = normalizeSearch(result.Search)
	return result, nil
}

func validateView(scope string, view View) error {
	switch view.Sort {
	case SortCount, SortAverage, SortOverall:
	case SortPreference:
		if scope != "personal" {
			return requestFailure(
				"preference sort requires personal scope",
				"/view/sort",
				"UNSUPPORTED_VALUE",
			)
		}
	default:
		return requestFailure("partners sort is unsupported", "/view/sort", "UNSUPPORTED_VALUE")
	}
	if scope != "global" && scope != "personal" {
		return requestFailure("partners query scope is invalid", "/query/scope", "UNSUPPORTED_VALUE")
	}
	if view.Order != statistics.Ascending && view.Order != statistics.Descending {
		return requestFailure("partners order is unsupported", "/view/order", "UNSUPPORTED_VALUE")
	}
	if view.Page < 1 || view.Page > maxJSONSafeInteger {
		return requestFailure("partners page is invalid", "/view/page", "OUT_OF_RANGE")
	}
	if view.PageSize != 5 && view.PageSize != 10 && view.PageSize != 20 {
		return requestFailure("partners page size is unsupported", "/view/pageSize", "UNSUPPORTED_VALUE")
	}
	if !utf8.ValidString(view.Search) || utf8.RuneCountInString(view.Search) > 256 {
		return requestFailure("partners search is invalid", "/view/search", "OUT_OF_RANGE")
	}
	return nil
}

func exactPositiveJSONInteger(raw json.RawMessage) (int64, string, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return 0, "INVALID_TYPE", err
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, "INVALID_TYPE", errors.New("partners: integer required")
	}
	rational, ok := new(big.Rat).SetString(number.String())
	if !ok || !rational.IsInt() {
		return 0, "INVALID_TYPE", errors.New("partners: exact integer required")
	}
	if rational.Sign() <= 0 || !rational.Num().IsInt64() {
		return 0, "OUT_OF_RANGE", errors.New("partners: positive safe integer required")
	}
	integer := rational.Num().Int64()
	if integer > maxJSONSafeInteger {
		return 0, "OUT_OF_RANGE", errors.New("partners: integer exceeds JSON safe range")
	}
	return integer, "", nil
}

func decodeObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil || value == nil {
		return nil, err
	}
	return value, nil
}

func escapePointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func normalizeSearch(value string) string {
	return cases.Fold().String(norm.NFKC.String(query.TrimV1(value)))
}

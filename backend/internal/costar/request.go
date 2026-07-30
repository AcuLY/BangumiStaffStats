package costar

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
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
	view, err := parseView(request.View, effective.Scope, effective.MergeSeries)
	if err != nil {
		return Operation{}, err
	}
	return Operation{Input: input, View: view}, nil
}

func parseInput(raw json.RawMessage) (Input, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return Input{}, requestFailure("co-star input is required", "/input", "REQUIRED")
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return Input{}, requestFailure("co-star input must be an object", "/input", "INVALID_TYPE")
	}
	for name := range fields {
		if name != "participants" {
			return Input{}, unknownFieldFailure("/input/" + escapePointerToken(name))
		}
	}
	rawParticipants, found := fields["participants"]
	if !found {
		return Input{}, requestFailure("participants are required", "/input/participants", "REQUIRED")
	}
	var values []json.RawMessage
	if err := json.Unmarshal(rawParticipants, &values); err != nil || values == nil {
		return Input{}, requestFailure(
			"participants must be an array",
			"/input/participants",
			"INVALID_TYPE",
		)
	}
	if len(values) < 2 || len(values) > 10 {
		return Input{}, requestFailure(
			"participant count must be between 2 and 10",
			"/input/participants",
			string(CodeParticipantLimitExceeded),
		)
	}
	result := Input{Participants: make([]ParticipantInput, len(values))}
	seenPeople := make(map[int64]struct{}, len(values))
	totalIdentities := 0
	for index, rawParticipant := range values {
		participant, parseErr := parseParticipant(rawParticipant, index)
		if parseErr != nil {
			return Input{}, parseErr
		}
		if _, duplicate := seenPeople[participant.PersonID]; duplicate {
			return Input{}, requestFailure(
				"participants must be unique",
				fmt.Sprintf("/input/participants/%d/personId", index),
				"DUPLICATE",
			)
		}
		seenPeople[participant.PersonID] = struct{}{}
		totalIdentities += len(participant.PositionKeys)
		if totalIdentities > 20 {
			return Input{}, requestFailure(
				"total participant identities exceed the limit",
				fmt.Sprintf("/input/participants/%d/positionKeys", index),
				string(CodeIdentityLimitExceeded),
			)
		}
		result.Participants[index] = participant
	}
	return result, nil
}

func parseParticipant(raw json.RawMessage, index int) (ParticipantInput, error) {
	path := fmt.Sprintf("/input/participants/%d", index)
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return ParticipantInput{}, requestFailure(
			"participant must be an object",
			path,
			"INVALID_TYPE",
		)
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return ParticipantInput{}, requestFailure(
			"participant must be an object",
			path,
			"INVALID_TYPE",
		)
	}
	for name := range fields {
		switch name {
		case "personId", "positionKeys":
		default:
			return ParticipantInput{}, unknownFieldFailure(
				path + "/" + escapePointerToken(name),
			)
		}
	}
	personRaw, found := fields["personId"]
	if !found {
		return ParticipantInput{}, requestFailure(
			"participant person is required",
			path+"/personId",
			"REQUIRED",
		)
	}
	personID, fieldCode, err := exactPositiveJSONInteger(personRaw)
	if err != nil {
		return ParticipantInput{}, requestFailure(
			"participant person is invalid",
			path+"/personId",
			fieldCode,
		)
	}
	positionsRaw, found := fields["positionKeys"]
	if !found {
		return ParticipantInput{}, requestFailure(
			"participant identities are required",
			path+"/positionKeys",
			"REQUIRED",
		)
	}
	var elements []json.RawMessage
	if err := json.Unmarshal(positionsRaw, &elements); err != nil || elements == nil {
		return ParticipantInput{}, requestFailure(
			"participant identities must be an array",
			path+"/positionKeys",
			"INVALID_TYPE",
		)
	}
	if len(elements) == 0 {
		return ParticipantInput{}, requestFailure(
			"participant identities must not be empty",
			path+"/positionKeys",
			"OUT_OF_RANGE",
		)
	}
	positions := make([]string, len(elements))
	seen := make(map[string]struct{}, len(elements))
	for positionIndex, element := range elements {
		positionPath := fmt.Sprintf("%s/positionKeys/%d", path, positionIndex)
		key, parseErr := parsePositionKey(element, positionPath)
		if parseErr != nil {
			return ParticipantInput{}, parseErr
		}
		if _, duplicate := seen[key]; duplicate {
			return ParticipantInput{}, requestFailure(
				"participant identities must be unique",
				positionPath,
				"DUPLICATE",
			)
		}
		seen[key] = struct{}{}
		positions[positionIndex] = key
	}
	return ParticipantInput{PersonID: personID, PositionKeys: positions}, nil
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
	positions := make(map[string]struct{}, len(effective.PositionKeys))
	for _, key := range effective.PositionKeys {
		positions[key] = struct{}{}
	}
	for participantIndex, participant := range input.Participants {
		for positionIndex, key := range participant.PositionKeys {
			if _, exists := positions[key]; !exists {
				return requestFailure(
					"participant identity is not selected by the query",
					fmt.Sprintf(
						"/input/participants/%d/positionKeys/%d",
						participantIndex,
						positionIndex,
					),
					string(CodePositionNotFound),
				)
			}
		}
	}
	return nil
}

func parseView(raw json.RawMessage, scope string, mergeSeries bool) (View, error) {
	result := View{
		Order:    OrderDescending,
		Page:     1,
		PageSize: 10,
	}
	if scope == "personal" {
		result.Sort = SortPersonalScore
	} else {
		result.Sort = SortGlobalScore
	}
	if len(raw) == 0 {
		return result, validateView(scope, mergeSeries, result)
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return View{}, requestFailure("co-star view must be an object", "/view", "INVALID_TYPE")
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return View{}, requestFailure("co-star view must be an object", "/view", "INVALID_TYPE")
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
			return View{}, requestFailure("co-star search must be a string", "/view/search", "INVALID_TYPE")
		}
		if !utf8.ValidString(result.Search) || utf8.RuneCountInString(result.Search) > 256 {
			return View{}, requestFailure("co-star search is too long", "/view/search", "OUT_OF_RANGE")
		}
	}
	if value, found := fields["sort"]; found {
		var sortValue string
		if err := json.Unmarshal(value, &sortValue); err != nil {
			return View{}, requestFailure("co-star sort must be a string", "/view/sort", "INVALID_TYPE")
		}
		result.Sort = Sort(sortValue)
	}
	if value, found := fields["order"]; found {
		var order string
		if err := json.Unmarshal(value, &order); err != nil {
			return View{}, requestFailure("co-star order must be a string", "/view/order", "INVALID_TYPE")
		}
		result.Order = Order(order)
	}
	if value, found := fields["page"]; found {
		page, fieldCode, parseErr := exactPositiveJSONInteger(value)
		if parseErr != nil {
			return View{}, requestFailure("co-star page is invalid", "/view/page", fieldCode)
		}
		result.Page = page
	}
	if value, found := fields["pageSize"]; found {
		pageSize, fieldCode, parseErr := exactPositiveJSONInteger(value)
		if parseErr != nil {
			return View{}, requestFailure("co-star page size is invalid", "/view/pageSize", fieldCode)
		}
		if pageSize != 5 && pageSize != 10 && pageSize != 20 {
			return View{}, requestFailure(
				"co-star page size is unsupported",
				"/view/pageSize",
				"UNSUPPORTED_VALUE",
			)
		}
		result.PageSize = int(pageSize)
	}
	if err := validateView(scope, mergeSeries, result); err != nil {
		return View{}, err
	}
	result.Search = normalizeSearch(result.Search)
	return result, nil
}

func validateView(scope string, mergeSeries bool, view View) error {
	switch view.Sort {
	case SortGlobalScore:
	case SortPersonalScore, SortCollectionUpdatedAt:
		if scope != "personal" {
			return requestFailure(
				"personal work sort requires personal scope",
				"/view/sort",
				"UNSUPPORTED_VALUE",
			)
		}
	case SortSeriesSize:
		if !mergeSeries {
			return requestFailure(
				"series size sort requires merged series",
				"/view/sort",
				"UNSUPPORTED_VALUE",
			)
		}
	default:
		return requestFailure("co-star sort is unsupported", "/view/sort", "UNSUPPORTED_VALUE")
	}
	if scope != "global" && scope != "personal" {
		return requestFailure("co-star query scope is invalid", "/query/scope", "UNSUPPORTED_VALUE")
	}
	if view.Order != OrderAscending && view.Order != OrderDescending {
		return requestFailure("co-star order is unsupported", "/view/order", "UNSUPPORTED_VALUE")
	}
	if view.Page < 1 || view.Page > maxJSONSafeInteger {
		return requestFailure("co-star page is invalid", "/view/page", "OUT_OF_RANGE")
	}
	if view.PageSize != 5 && view.PageSize != 10 && view.PageSize != 20 {
		return requestFailure("co-star page size is unsupported", "/view/pageSize", "UNSUPPORTED_VALUE")
	}
	if !utf8.ValidString(view.Search) || utf8.RuneCountInString(view.Search) > 256 {
		return requestFailure("co-star search is invalid", "/view/search", "OUT_OF_RANGE")
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
		return 0, "INVALID_TYPE", errors.New("costar: integer required")
	}
	rational, ok := new(big.Rat).SetString(number.String())
	if !ok || !rational.IsInt() {
		return 0, "INVALID_TYPE", errors.New("costar: exact integer required")
	}
	if rational.Sign() <= 0 || !rational.Num().IsInt64() {
		return 0, "OUT_OF_RANGE", errors.New("costar: positive safe integer required")
	}
	integer := rational.Num().Int64()
	if integer > maxJSONSafeInteger {
		return 0, "OUT_OF_RANGE", errors.New("costar: integer exceeds JSON safe range")
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

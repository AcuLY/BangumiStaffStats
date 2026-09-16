package candidates

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func normalizeOperationRequest(
	effective query.EffectiveQuery,
	request Request,
) (Operation, error) {
	return parseOperationRequest(effective, request, false)
}

// deferMembership permits syntax-only preflight; admitted facts must validate it.
func parseOperationRequest(effective query.EffectiveQuery, request Request, deferMembership bool) (Operation, error) {
	positionKey, err := parsePositionInput(request.Input)
	if err != nil {
		return Operation{}, err
	}
	positionScope, err := query.OperationPositionScope(request.Input)
	if err != nil {
		return Operation{}, requestFailure("invalid position scope", "/input/positionScope", "UNSUPPORTED_VALUE")
	}
	participants, err := parseParticipants(request.Input, effective, deferMembership)
	if err != nil {
		return Operation{}, err
	}
	viewInput, err := parseViewInput(request.View)
	if err != nil {
		return Operation{}, err
	}
	if !deferMembership && positionKey != "" && !containsPosition(effective.PositionKeys, positionKey) {
		return Operation{}, requestFailure(
			"the candidate position is not selected by the query",
			"/input/positionKey",
			string(CodePositionNotFound),
		)
	}
	view, err := NormalizeView(effective.Scope, viewInput)
	if err != nil {
		var candidateError *Error
		if errors.As(err, &candidateError) {
			fieldCode := "UNSUPPORTED_VALUE"
			if candidateError.Path() == "/view/search" {
				fieldCode = "OUT_OF_RANGE"
			}
			return Operation{}, requestFailure(
				"candidate view is invalid",
				candidateError.Path(),
				fieldCode,
			)
		}
		return Operation{}, err
	}
	return Operation{
		PositionKey:   positionKey,
		Participants:  participants,
		PositionScope: positionScope,
		View:          view,
	}, nil
}

func parsePositionInput(raw json.RawMessage) (string, error) {
	if len(raw) == 0 || bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return "", requestFailure(
			"candidate input is required",
			"/input",
			"REQUIRED",
		)
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return "", requestFailure(
			"candidate input must be an object",
			"/input",
			"INVALID_TYPE",
		)
	}
	for name := range fields {
		if name != "positionKey" && name != "positionScope" && name != "participants" {
			return "", unknownFieldFailure("/input/" + escapePointerToken(name))
		}
	}
	value, found := fields["positionKey"]
	if !found {
		return "", requestFailure(
			"the candidate position is required",
			"/input/positionKey",
			"REQUIRED",
		)
	}
	if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
		return "", nil
	}
	var positionKey string
	if err := json.Unmarshal(value, &positionKey); err != nil {
		return "", requestFailure(
			"the candidate position must be a string",
			"/input/positionKey",
			"INVALID_TYPE",
		)
	}
	if positionKey == "" || utf8.RuneCountInString(positionKey) > 128 {
		return "", requestFailure(
			"the candidate position is invalid",
			"/input/positionKey",
			"OUT_OF_RANGE",
		)
	}
	return positionKey, nil
}

func parseViewInput(raw json.RawMessage) (*ViewInput, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, requestFailure(
			"candidate view must be an object",
			"/view",
			"INVALID_TYPE",
		)
	}
	fields, err := decodeObject(raw)
	if err != nil {
		return nil, requestFailure(
			"candidate view must be an object",
			"/view",
			"INVALID_TYPE",
		)
	}
	for name := range fields {
		switch name {
		case "search", "sort", "order", "page", "pageSize":
		default:
			return nil, unknownFieldFailure("/view/" + escapePointerToken(name))
		}
	}

	result := new(ViewInput)
	if rawSearch, found := fields["search"]; found {
		var value string
		if err := json.Unmarshal(rawSearch, &value); err != nil {
			return nil, requestFailure(
				"candidate search must be a string",
				"/view/search",
				"INVALID_TYPE",
			)
		}
		if !utf8.ValidString(value) || utf8.RuneCountInString(value) > 256 {
			return nil, requestFailure(
				"candidate search is too long",
				"/view/search",
				"OUT_OF_RANGE",
			)
		}
		result.Search = &value
	}
	if rawSort, found := fields["sort"]; found {
		var value string
		if err := json.Unmarshal(rawSort, &value); err != nil {
			return nil, requestFailure(
				"candidate sort must be a string",
				"/view/sort",
				"INVALID_TYPE",
			)
		}
		sortValue := Sort(value)
		result.Sort = &sortValue
	}
	if rawOrder, found := fields["order"]; found {
		var value string
		if err := json.Unmarshal(rawOrder, &value); err != nil {
			return nil, requestFailure(
				"candidate order must be a string",
				"/view/order",
				"INVALID_TYPE",
			)
		}
		orderValue := Order(value)
		result.Order = &orderValue
	}
	if rawPage, found := fields["page"]; found {
		value, fieldCode, err := exactPositiveJSONInteger(rawPage)
		if err != nil {
			return nil, requestFailure(
				"candidate page is invalid",
				"/view/page",
				fieldCode,
			)
		}
		result.Page = &value
	}
	if rawPageSize, found := fields["pageSize"]; found {
		value, fieldCode, err := exactPositiveJSONInteger(rawPageSize)
		if err != nil {
			return nil, requestFailure(
				"candidate page size is invalid",
				"/view/pageSize",
				fieldCode,
			)
		}
		if value != 5 && value != 10 && value != 20 {
			return nil, requestFailure(
				"candidate page size is unsupported",
				"/view/pageSize",
				"UNSUPPORTED_VALUE",
			)
		}
		converted := int(value)
		result.PageSize = &converted
	}
	return result, nil
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
		return 0, "INVALID_TYPE", errors.New("candidates: integer required")
	}
	rational, ok := new(big.Rat).SetString(number.String())
	if !ok || !rational.IsInt() {
		return 0, "INVALID_TYPE", errors.New("candidates: exact integer required")
	}
	if rational.Sign() <= 0 || !rational.Num().IsInt64() {
		return 0, "OUT_OF_RANGE", errors.New("candidates: positive safe integer required")
	}
	integer := rational.Num().Int64()
	if integer > maxJSONSafeInteger {
		return 0, "OUT_OF_RANGE", errors.New("candidates: integer exceeds JSON safe range")
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

func containsPosition(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func escapePointerToken(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(value, "~", "~0"), "/", "~1")
}

func requestFailure(message, path, fieldCode string) *Error {
	return fail(CodeFieldInvalid, message, path, fieldCode, false, nil)
}

func unknownFieldFailure(path string) *Error {
	return fail(
		CodeInvalidRequest,
		"the request contains an unknown field",
		path,
		"UNKNOWN_FIELD",
		false,
		nil,
	)
}

// parseParticipants accepts semantic identities only, never picker presentation state.
func parseParticipants(raw json.RawMessage, effective query.EffectiveQuery, deferred ...bool) ([]query.ParticipantPerson, error) {
	deferMembership := len(deferred) > 0 && deferred[0]
	fields, err := decodeObject(raw)
	if err != nil {
		return nil, requestFailure("candidate input must be an object", "/input", "INVALID_TYPE")
	}
	data, found := fields["participants"]
	if !found {
		return nil, nil
	}
	var values []json.RawMessage
	if err := json.Unmarshal(data, &values); err != nil || values == nil {
		return nil, requestFailure("participants must be an array", "/input/participants", "INVALID_TYPE")
	}
	if len(values) > 10 {
		return nil, requestFailure("too many participants", "/input/participants", "OUT_OF_RANGE")
	}
	people := make(map[int64]bool)
	result := make([]query.ParticipantPerson, 0, len(values))
	total := 0
	for index, value := range values {
		path := fmt.Sprintf("/input/participants/%d", index)
		fields, err := decodeObject(value)
		if err != nil || fields == nil {
			return nil, requestFailure("participant must be an object", path, "INVALID_TYPE")
		}
		for name := range fields {
			if name != "personId" && name != "positionKeys" {
				return nil, unknownFieldFailure(path + "/" + escapePointerToken(name))
			}
		}
		idRaw, ok := fields["personId"]
		if !ok {
			return nil, requestFailure("person is required", path+"/personId", "REQUIRED")
		}
		id, code, err := exactPositiveJSONInteger(idRaw)
		if err != nil {
			return nil, requestFailure("person is invalid", path+"/personId", code)
		}
		if people[id] {
			return nil, requestFailure("duplicate person", path+"/personId", "DUPLICATE")
		}
		people[id] = true
		keysRaw, ok := fields["positionKeys"]
		if !ok {
			return nil, requestFailure("identities are required", path+"/positionKeys", "REQUIRED")
		}
		var keys []json.RawMessage
		if err := json.Unmarshal(keysRaw, &keys); err != nil || keys == nil {
			return nil, requestFailure("identities must be an array", path+"/positionKeys", "INVALID_TYPE")
		}
		if len(keys) == 0 || total+len(keys) > 20 {
			return nil, requestFailure("identity count is invalid", path+"/positionKeys", "OUT_OF_RANGE")
		}
		total += len(keys)
		positions := make([]string, 0, len(keys))
		seen := make(map[string]bool)
		for keyIndex, keyRaw := range keys {
			keyPath := fmt.Sprintf("%s/positionKeys/%d", path, keyIndex)
			var key string
			if err := json.Unmarshal(keyRaw, &key); err != nil || bytes.Equal(bytes.TrimSpace(keyRaw), []byte("null")) {
				return nil, requestFailure("identity must be a string", keyPath, "INVALID_TYPE")
			}
			if key == "" || utf8.RuneCountInString(key) > 96 {
				return nil, requestFailure("identity is invalid", keyPath, "OUT_OF_RANGE")
			}
			if seen[key] {
				return nil, requestFailure("duplicate identity", keyPath, "DUPLICATE")
			}
			seen[key] = true
			if !deferMembership && !containsPosition(effective.PositionKeys, key) {
				return nil, requestFailure("identity is not permitted", keyPath, string(CodePositionNotFound))
			}
			positions = append(positions, key)
		}
		result = append(result, query.ParticipantPerson{PersonID: id, PositionKeys: positions})
	}
	return result, nil
}

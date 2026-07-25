package query

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/gowebpki/jcs"
	"golang.org/x/text/cases"
	"golang.org/x/text/unicode/norm"
)

const (
	maxRequestBytes       = 65536
	maxUIDCodePoints      = 256
	maxUIDBytes           = 256
	maxTagGroups          = 32
	maxTagTokensPerGroup  = 16
	maxNormalizedTags     = 256
	maxNormalizedTagRunes = 256
	maxNormalizedTagBytes = 256
	maxJSONSafeInteger    = 9007199254740991

	digestLabel  = "q1:"
	digestDomain = "bgmss.query.v1"
)

const (
	CodeInvalidJSON               = "INVALID_JSON"
	CodeRequestTooLarge           = "REQUEST_TOO_LARGE"
	CodeFieldInvalid              = "FIELD_INVALID"
	CodePositionNotFound          = "POSITION_NOT_FOUND"
	CodePositionNotSelectable     = "POSITION_NOT_SELECTABLE"
	CodePositionSubjectMismatch   = "POSITION_SUBJECT_TYPE_MISMATCH"
	CodePositionSelectionConflict = "POSITION_SELECTION_CONFLICT"
)

var (
	monthPattern    = regexp.MustCompile(`^[0-9]{4}-(0[1-9]|1[0-2])$`)
	staffPattern    = regexp.MustCompile(`^staff:(book|anime|music|game|real):[1-9][0-9]*$`)
	castPattern     = regexp.MustCompile(`^cast:(anime|game):(main|all)$`)
	staffSetPattern = regexp.MustCompile(`^staffset:(book|anime|music|game|real):[a-z0-9]+(?:-[a-z0-9]+)*$`)
)

// ContractError is the stable shared-query failure surfaced before Archive or
// collection access. Path is an RFC 6901 JSON pointer, or empty for a
// document-level failure.
type ContractError struct {
	Code    string
	Path    string
	Message string
}

func (e *ContractError) Error() string {
	if e.Path == "" {
		return fmt.Sprintf("%s: %s", e.Code, e.Message)
	}
	return fmt.Sprintf("%s at %s: %s", e.Code, e.Path, e.Message)
}

// CatalogContext is the narrow catalog authority required during query
// normalization. Selection plans used during evaluation are intentionally a
// separate type.
type CatalogContext struct {
	Positions []CatalogPosition `json:"positions"`
}

type CatalogPosition struct {
	Key         string `json:"key"`
	SubjectType string `json:"subjectType"`
	Selectable  bool   `json:"selectable"`
}

// EffectiveQuery is the closed normalized query consumed by the result-set
// evaluator. Numeric range values remain json.Number until comparison or JCS
// serialization so they never pass through generated float32 transport types.
type EffectiveQuery struct {
	Scope              string   `json:"scope"`
	UID                string   `json:"uid,omitempty"`
	CollectionStatuses []string `json:"collectionStatuses,omitempty"`
	SubjectType        string   `json:"subjectType"`
	PositionKeys       []string `json:"positionKeys"`
	IncludeNSFW        bool     `json:"includeNSFW"`
	MergeSeries        bool     `json:"mergeSeries"`
	Filters            *Filters `json:"filters,omitempty"`
}

type Filters struct {
	SubjectDate         *MonthRange   `json:"subjectDate,omitempty"`
	CollectionUpdatedAt *MonthRange   `json:"collectionUpdatedAt,omitempty"`
	PersonalScore       *NumberRange  `json:"personalScore,omitempty"`
	GlobalScore         *NumberRange  `json:"globalScore,omitempty"`
	ScoreDifference     *NumberRange  `json:"scoreDifference,omitempty"`
	RatingCount         *IntegerRange `json:"ratingCount,omitempty"`
	Tags                *TagFilters   `json:"tags,omitempty"`
}

type MonthRange struct {
	Min *string `json:"min,omitempty"`
	Max *string `json:"max,omitempty"`
}

type NumberRange struct {
	Min *json.Number `json:"min,omitempty"`
	Max *json.Number `json:"max,omitempty"`
}

type IntegerRange struct {
	Min *json.Number `json:"min,omitempty"`
	Max *json.Number `json:"max,omitempty"`
}

type TagFilters struct {
	Include []TagIncludeGroup `json:"include,omitempty"`
	Exclude []TagExcludeGroup `json:"exclude,omitempty"`
}

type TagIncludeGroup struct {
	AnyOf []string `json:"anyOf"`
}

type TagExcludeGroup struct {
	AllOf []string `json:"allOf"`
}

// QueryDigestProjection is EffectiveQuery with the personal UID deliberately
// excluded. It is the sole input to RFC 8785 canonicalization.
type QueryDigestProjection struct {
	Scope              string   `json:"scope"`
	CollectionStatuses []string `json:"collectionStatuses,omitempty"`
	SubjectType        string   `json:"subjectType"`
	PositionKeys       []string `json:"positionKeys"`
	IncludeNSFW        bool     `json:"includeNSFW"`
	MergeSeries        bool     `json:"mergeSeries"`
	Filters            *Filters `json:"filters,omitempty"`
}

type NormalizedQuery struct {
	Effective  EffectiveQuery
	Projection QueryDigestProjection
	Canonical  []byte
	Preimage   []byte
	Digest     string
}

// NormalizeJSON decodes a closed catalog document and normalizes one preserved
// raw SharedQueryV1 document.
func NormalizeJSON(rawQuery, rawCatalog []byte) (NormalizedQuery, error) {
	catalog, err := DecodeCatalog(rawCatalog)
	if err != nil {
		return NormalizedQuery{}, err
	}
	return Normalize(rawQuery, catalog)
}

// DecodeCatalog validates the closed CatalogContextV1 shape.
func DecodeCatalog(raw []byte) (CatalogContext, error) {
	value, err := decodeJSON(raw, "/catalog")
	if err != nil {
		return CatalogContext{}, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return CatalogContext{}, fieldError("/catalog", "catalog must be an object")
	}
	if err := rejectUnknown(object, "/catalog", "positions"); err != nil {
		return CatalogContext{}, err
	}
	rawPositions, ok := object["positions"]
	if !ok {
		return CatalogContext{}, fieldError("/catalog/positions", "required field is missing")
	}
	positions, ok := rawPositions.([]any)
	if !ok || len(positions) == 0 {
		return CatalogContext{}, fieldError("/catalog/positions", "positions must be a non-empty array")
	}
	result := CatalogContext{Positions: make([]CatalogPosition, 0, len(positions))}
	for index, rawPosition := range positions {
		path := fmt.Sprintf("/catalog/positions/%d", index)
		entry, ok := rawPosition.(map[string]any)
		if !ok {
			return CatalogContext{}, fieldError(path, "catalog position must be an object")
		}
		if err := rejectUnknown(entry, path, "key", "subjectType", "selectable"); err != nil {
			return CatalogContext{}, err
		}
		key, err := requiredString(entry, "key", path)
		if err != nil {
			return CatalogContext{}, err
		}
		subjectType, err := requiredString(entry, "subjectType", path)
		if err != nil {
			return CatalogContext{}, err
		}
		selectable, err := requiredBool(entry, "selectable", path)
		if err != nil {
			return CatalogContext{}, err
		}
		result.Positions = append(result.Positions, CatalogPosition{
			Key:         key,
			SubjectType: subjectType,
			Selectable:  selectable,
		})
	}
	if err := validateCatalog(result); err != nil {
		return CatalogContext{}, err
	}
	return result, nil
}

// Normalize strictly validates, normalizes, projects, canonicalizes, and
// digests one raw SharedQueryV1 document.
func Normalize(raw []byte, catalog CatalogContext) (NormalizedQuery, error) {
	value, err := decodeJSON(raw, "")
	if err != nil {
		return NormalizedQuery{}, err
	}
	if len(raw) > maxRequestBytes {
		return NormalizedQuery{}, &ContractError{
			Code:    CodeRequestTooLarge,
			Message: "request exceeds byte cap",
		}
	}
	if err := validateCatalog(catalog); err != nil {
		return NormalizedQuery{}, err
	}
	object, ok := value.(map[string]any)
	if !ok {
		return NormalizedQuery{}, fieldError("", "query must be an object")
	}
	effective, err := normalizeQueryObject(object, catalog)
	if err != nil {
		return NormalizedQuery{}, err
	}
	projection := projectQuery(effective)
	projectionJSON, err := json.Marshal(projection)
	if err != nil {
		return NormalizedQuery{}, fmt.Errorf("marshal query digest projection: %w", err)
	}
	canonical, err := jcs.Transform(projectionJSON)
	if err != nil {
		return NormalizedQuery{}, fmt.Errorf("canonicalize query digest projection: %w", err)
	}
	preimage := make([]byte, 0, len(digestDomain)+1+len(canonical))
	preimage = append(preimage, digestDomain...)
	preimage = append(preimage, 0)
	preimage = append(preimage, canonical...)
	sum := sha256.Sum256(preimage)
	return NormalizedQuery{
		Effective:  effective,
		Projection: projection,
		Canonical:  append([]byte(nil), canonical...),
		Preimage:   append([]byte(nil), preimage...),
		Digest:     digestLabel + hex.EncodeToString(sum[:]),
	}, nil
}

// CanonicalizeJSON applies the same scalar, number, and RFC 8785 gates used by
// queryDigest to an arbitrary raw JSON value.
func CanonicalizeJSON(raw []byte) ([]byte, error) {
	if _, err := decodeJSONDocument(raw, "", false); err != nil {
		return nil, err
	}
	canonical, err := jcs.Transform(raw)
	if err != nil {
		return nil, &ContractError{Code: CodeInvalidJSON, Message: err.Error()}
	}
	return append([]byte(nil), canonical...), nil
}

// Canonicalize marshals a Go JSON value before applying RFC 8785.
func Canonicalize(value any) ([]byte, error) {
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return CanonicalizeJSON(raw)
}

func normalizeQueryObject(object map[string]any, catalog CatalogContext) (EffectiveQuery, error) {
	scope, err := requiredString(object, "scope", "")
	if err != nil {
		return EffectiveQuery{}, err
	}
	if scope == "global" {
		for _, field := range []string{
			"uid",
			"collectionStatuses",
			"collectionUpdatedAt",
			"personalScore",
			"scoreDifference",
		} {
			if _, exists := object[field]; exists {
				return EffectiveQuery{}, fieldError("/"+field, "personal field is forbidden in global scope")
			}
		}
	}

	var allowed []string
	switch scope {
	case "personal":
		allowed = []string{
			"scope", "uid", "collectionStatuses", "subjectType", "positionKeys",
			"includeNSFW", "mergeSeries", "filters",
		}
	case "global":
		allowed = []string{
			"scope", "subjectType", "positionKeys", "includeNSFW", "mergeSeries", "filters",
		}
	default:
		return EffectiveQuery{}, fieldError("/scope", "scope must be personal or global")
	}
	if err := rejectUnknown(object, "", allowed...); err != nil {
		return EffectiveQuery{}, err
	}

	subjectType, err := requiredString(object, "subjectType", "")
	if err != nil {
		return EffectiveQuery{}, err
	}
	if !validSubjectType(subjectType) {
		return EffectiveQuery{}, fieldError("/subjectType", "unsupported subject type")
	}
	positionKeys, err := parsePositionKeys(object["positionKeys"], "/positionKeys")
	if err != nil {
		return EffectiveQuery{}, err
	}
	includeNSFW, err := optionalBool(object, "includeNSFW", false, "")
	if err != nil {
		return EffectiveQuery{}, err
	}
	mergeSeries, err := optionalBool(object, "mergeSeries", false, "")
	if err != nil {
		return EffectiveQuery{}, err
	}

	effective := EffectiveQuery{
		Scope:        scope,
		SubjectType:  subjectType,
		PositionKeys: positionKeys,
		IncludeNSFW:  includeNSFW,
		MergeSeries:  mergeSeries,
	}
	if scope == "personal" {
		uid, err := requiredString(object, "uid", "")
		if err != nil {
			return EffectiveQuery{}, err
		}
		if utf8.RuneCountInString(uid) > maxUIDCodePoints {
			return EffectiveQuery{}, fieldError("/uid", "UID exceeds code-point limit")
		}
		statuses, err := parseCollectionStatuses(object["collectionStatuses"])
		if err != nil {
			return EffectiveQuery{}, err
		}
		effective.UID = uid
		effective.CollectionStatuses = statuses
	}

	if rawFilters, exists := object["filters"]; exists {
		filters, err := parseFilters(rawFilters, scope)
		if err != nil {
			return EffectiveQuery{}, err
		}
		effective.Filters = filters
	}

	if err := validatePositionSelection(positionKeys, subjectType, catalog); err != nil {
		return EffectiveQuery{}, err
	}
	if mergeSeries && subjectType != "anime" {
		return EffectiveQuery{}, fieldError("/mergeSeries", "series merge is anime-only")
	}
	if scope == "personal" {
		effective.UID = TrimV1(effective.UID)
		if !validUID(effective.UID) {
			return EffectiveQuery{}, fieldError("/uid", "invalid public UID")
		}
	}
	return effective, nil
}

func projectQuery(effective EffectiveQuery) QueryDigestProjection {
	projection := QueryDigestProjection{
		Scope:        effective.Scope,
		SubjectType:  effective.SubjectType,
		PositionKeys: append([]string(nil), effective.PositionKeys...),
		IncludeNSFW:  effective.IncludeNSFW,
		MergeSeries:  effective.MergeSeries,
		Filters:      cloneFilters(effective.Filters),
	}
	if effective.Scope == "personal" {
		projection.CollectionStatuses = append([]string(nil), effective.CollectionStatuses...)
	}
	return projection
}

func parseCollectionStatuses(value any) ([]string, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 || len(values) > 16 {
		return nil, fieldError("/collectionStatuses", "collectionStatuses must contain 1..16 entries")
	}
	selected := make(map[string]struct{}, len(values))
	for index, raw := range values {
		status, ok := raw.(string)
		if !ok || !validCollectionStatus(status) {
			return nil, fieldError(fmt.Sprintf("/collectionStatuses/%d", index), "invalid collection status")
		}
		selected[status] = struct{}{}
	}
	order := []string{"completed", "in_progress", "on_hold", "dropped"}
	result := make([]string, 0, len(selected))
	for _, status := range order {
		if _, ok := selected[status]; ok {
			result = append(result, status)
		}
	}
	return result, nil
}

func parsePositionKeys(value any, path string) ([]string, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 {
		return nil, fieldError(path, "positionKeys must be a non-empty array")
	}
	result := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for index, raw := range values {
		key, ok := raw.(string)
		itemPath := fmt.Sprintf("%s/%d", path, index)
		if !ok || !validPositionKey(key) {
			return nil, fieldError(itemPath, "invalid position key")
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result, nil
}

func parseFilters(value any, scope string) (*Filters, error) {
	object, ok := value.(map[string]any)
	if !ok || len(object) == 0 {
		return nil, fieldError("/filters", "filters must be a non-empty object")
	}
	allowed := []string{"subjectDate", "globalScore", "ratingCount", "tags"}
	if scope == "personal" {
		allowed = []string{
			"subjectDate", "collectionUpdatedAt", "personalScore", "globalScore",
			"scoreDifference", "ratingCount", "tags",
		}
	}
	if err := rejectUnknown(object, "/filters", allowed...); err != nil {
		return nil, err
	}
	result := &Filters{}
	var err error
	if raw, exists := object["subjectDate"]; exists {
		result.SubjectDate, err = parseMonthRange(raw, "/filters/subjectDate")
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["collectionUpdatedAt"]; exists {
		result.CollectionUpdatedAt, err = parseMonthRange(raw, "/filters/collectionUpdatedAt")
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["personalScore"]; exists {
		result.PersonalScore, err = parseNumberRange(raw, "/filters/personalScore", 0, 10)
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["globalScore"]; exists {
		result.GlobalScore, err = parseNumberRange(raw, "/filters/globalScore", 0, 10)
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["scoreDifference"]; exists {
		result.ScoreDifference, err = parseNumberRange(raw, "/filters/scoreDifference", -10, 10)
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["ratingCount"]; exists {
		result.RatingCount, err = parseIntegerRange(raw, "/filters/ratingCount")
		if err != nil {
			return nil, err
		}
	}
	if raw, exists := object["tags"]; exists {
		result.Tags, err = parseTagFilters(raw, "/filters/tags")
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func parseMonthRange(value any, path string) (*MonthRange, error) {
	object, ok := value.(map[string]any)
	if !ok || len(object) == 0 {
		return nil, fieldError(path, "month range must be a non-empty object")
	}
	if err := rejectUnknown(object, path, "min", "max"); err != nil {
		return nil, err
	}
	result := &MonthRange{}
	if raw, exists := object["min"]; exists {
		value, ok := raw.(string)
		if !ok || !monthPattern.MatchString(value) {
			return nil, fieldError(path+"/min", "invalid month")
		}
		result.Min = stringPointer(value)
	}
	if raw, exists := object["max"]; exists {
		value, ok := raw.(string)
		if !ok || !monthPattern.MatchString(value) {
			return nil, fieldError(path+"/max", "invalid month")
		}
		result.Max = stringPointer(value)
	}
	if result.Min != nil && result.Max != nil && *result.Min > *result.Max {
		return nil, fieldError(path, "range min exceeds max")
	}
	return result, nil
}

func parseNumberRange(value any, path string, lower, upper float64) (*NumberRange, error) {
	object, ok := value.(map[string]any)
	if !ok || len(object) == 0 {
		return nil, fieldError(path, "number range must be a non-empty object")
	}
	if err := rejectUnknown(object, path, "min", "max"); err != nil {
		return nil, err
	}
	result := &NumberRange{}
	if raw, exists := object["min"]; exists {
		number, _, err := boundedNumber(raw, path+"/min", lower, upper, false)
		if err != nil {
			return nil, err
		}
		result.Min = numberPointer(number)
	}
	if raw, exists := object["max"]; exists {
		number, _, err := boundedNumber(raw, path+"/max", lower, upper, false)
		if err != nil {
			return nil, err
		}
		result.Max = numberPointer(number)
	}
	if result.Min != nil && result.Max != nil {
		minimum, _ := result.Min.Float64()
		maximum, _ := result.Max.Float64()
		if minimum > maximum {
			return nil, fieldError(path, "range min exceeds max")
		}
	}
	return result, nil
}

func parseIntegerRange(value any, path string) (*IntegerRange, error) {
	object, ok := value.(map[string]any)
	if !ok || len(object) == 0 {
		return nil, fieldError(path, "integer range must be a non-empty object")
	}
	if err := rejectUnknown(object, path, "min", "max"); err != nil {
		return nil, err
	}
	result := &IntegerRange{}
	if raw, exists := object["min"]; exists {
		number, _, err := boundedNumber(raw, path+"/min", 0, maxJSONSafeInteger, true)
		if err != nil {
			return nil, err
		}
		result.Min = numberPointer(number)
	}
	if raw, exists := object["max"]; exists {
		number, _, err := boundedNumber(raw, path+"/max", 0, maxJSONSafeInteger, true)
		if err != nil {
			return nil, err
		}
		result.Max = numberPointer(number)
	}
	if result.Min != nil && result.Max != nil {
		minimum, _ := result.Min.Float64()
		maximum, _ := result.Max.Float64()
		if minimum > maximum {
			return nil, fieldError(path, "range min exceeds max")
		}
	}
	return result, nil
}

func boundedNumber(value any, path string, lower, upper float64, integer bool) (json.Number, float64, error) {
	number, ok := value.(json.Number)
	if !ok {
		return "", 0, fieldError(path, "value must be a JSON number")
	}
	parsed, err := number.Float64()
	if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
		return "", 0, fieldError(path, "invalid JSON number")
	}
	if integer && math.Trunc(parsed) != parsed {
		return "", 0, fieldError(path, "value must be an integer")
	}
	if parsed < lower || parsed > upper {
		return "", 0, fieldError(path, "number is outside the accepted range")
	}
	return number, parsed, nil
}

func parseTagFilters(value any, path string) (*TagFilters, error) {
	object, ok := value.(map[string]any)
	if !ok || len(object) == 0 {
		return nil, fieldError(path, "tag filters must be a non-empty object")
	}
	if err := rejectUnknown(object, path, "include", "exclude"); err != nil {
		return nil, err
	}
	result := &TagFilters{}
	totalTokens := 0
	if raw, exists := object["include"]; exists {
		groups, count, err := parseIncludeGroups(raw, path+"/include")
		if err != nil {
			return nil, err
		}
		result.Include = groups
		totalTokens += count
	}
	if raw, exists := object["exclude"]; exists {
		groups, count, err := parseExcludeGroups(raw, path+"/exclude")
		if err != nil {
			return nil, err
		}
		result.Exclude = groups
		totalTokens += count
	}
	if totalTokens > maxNormalizedTags {
		return nil, fieldError(path, "normalized tag token count exceeds limit")
	}
	return result, nil
}

func parseIncludeGroups(value any, path string) ([]TagIncludeGroup, int, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 || len(values) > maxTagGroups {
		return nil, 0, fieldError(path, "include must contain 1..32 groups")
	}
	groups := make([]TagIncludeGroup, 0, len(values))
	total := 0
	for index, raw := range values {
		groupPath := fmt.Sprintf("%s/%d", path, index)
		object, ok := raw.(map[string]any)
		if !ok {
			return nil, 0, fieldError(groupPath, "tag group must be an object")
		}
		if err := rejectUnknown(object, groupPath, "anyOf"); err != nil {
			return nil, 0, err
		}
		tokens, err := parseTagTokens(object["anyOf"], groupPath+"/anyOf")
		if err != nil {
			return nil, 0, err
		}
		total += len(tokens)
		groups = append(groups, TagIncludeGroup{AnyOf: tokens})
	}
	sort.Slice(groups, func(i, j int) bool {
		return compareStringSequence(groups[i].AnyOf, groups[j].AnyOf) < 0
	})
	groups = compactIncludeGroups(groups)
	return groups, total, nil
}

func parseExcludeGroups(value any, path string) ([]TagExcludeGroup, int, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 || len(values) > maxTagGroups {
		return nil, 0, fieldError(path, "exclude must contain 1..32 groups")
	}
	groups := make([]TagExcludeGroup, 0, len(values))
	total := 0
	for index, raw := range values {
		groupPath := fmt.Sprintf("%s/%d", path, index)
		object, ok := raw.(map[string]any)
		if !ok {
			return nil, 0, fieldError(groupPath, "tag group must be an object")
		}
		if err := rejectUnknown(object, groupPath, "allOf"); err != nil {
			return nil, 0, err
		}
		tokens, err := parseTagTokens(object["allOf"], groupPath+"/allOf")
		if err != nil {
			return nil, 0, err
		}
		total += len(tokens)
		groups = append(groups, TagExcludeGroup{AllOf: tokens})
	}
	sort.Slice(groups, func(i, j int) bool {
		return compareStringSequence(groups[i].AllOf, groups[j].AllOf) < 0
	})
	groups = compactExcludeGroups(groups)
	return groups, total, nil
}

func parseTagTokens(value any, path string) ([]string, error) {
	values, ok := value.([]any)
	if !ok || len(values) == 0 || len(values) > maxTagTokensPerGroup {
		return nil, fieldError(path, "tag group must contain 1..16 tokens")
	}
	tokens := make([]string, 0, len(values))
	seen := make(map[string]struct{}, len(values))
	for index, raw := range values {
		token, ok := raw.(string)
		itemPath := fmt.Sprintf("%s/%d", path, index)
		if !ok || token == "" || utf8.RuneCountInString(token) > maxNormalizedTagRunes {
			return nil, fieldError(itemPath, "invalid tag token")
		}
		normalized, err := normalizeTag(token, itemPath)
		if err != nil {
			return nil, err
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		tokens = append(tokens, normalized)
	}
	sort.Slice(tokens, func(i, j int) bool {
		return compareScalarStrings(tokens[i], tokens[j]) < 0
	})
	return tokens, nil
}

func compactIncludeGroups(groups []TagIncludeGroup) []TagIncludeGroup {
	if len(groups) < 2 {
		return groups
	}
	result := groups[:1]
	for _, group := range groups[1:] {
		if compareStringSequence(result[len(result)-1].AnyOf, group.AnyOf) != 0 {
			result = append(result, group)
		}
	}
	return result
}

func compactExcludeGroups(groups []TagExcludeGroup) []TagExcludeGroup {
	if len(groups) < 2 {
		return groups
	}
	result := groups[:1]
	for _, group := range groups[1:] {
		if compareStringSequence(result[len(result)-1].AllOf, group.AllOf) != 0 {
			result = append(result, group)
		}
	}
	return result
}

// TrimV1 removes only the pinned Unicode 15.1 White_Space boundary set.
func TrimV1(value string) string {
	start := 0
	for start < len(value) {
		r, size := utf8.DecodeRuneInString(value[start:])
		if !trimV1Rune(r) {
			break
		}
		start += size
	}
	end := len(value)
	for end > start {
		r, size := utf8.DecodeLastRuneInString(value[:end])
		if !trimV1Rune(r) {
			break
		}
		end -= size
	}
	return value[start:end]
}

func trimV1Rune(r rune) bool {
	switch {
	case r >= 0x0009 && r <= 0x000d:
		return true
	case r == 0x0020, r == 0x0085, r == 0x00a0, r == 0x1680:
		return true
	case r >= 0x2000 && r <= 0x200a:
		return true
	case r == 0x2028, r == 0x2029, r == 0x202f, r == 0x205f, r == 0x3000:
		return true
	default:
		return false
	}
}

// NormalizeTag applies TrimV1, the Unicode 15.1 assigned-scalar gate, NFKC,
// and default (non-Turkic) full case folding.
func NormalizeTag(value string) (string, error) {
	return normalizeTag(value, "/tag")
}

func normalizeTag(value, path string) (string, error) {
	if !utf8.ValidString(value) {
		return "", fieldError(path, "tag is not valid UTF-8")
	}
	trimmed := TrimV1(value)
	if trimmed == "" {
		return "", fieldError(path, "empty normalized tag")
	}
	for _, scalar := range trimmed {
		if !unicode.Is(unicodeAssigned15_1, scalar) {
			return "", fieldError(path, fmt.Sprintf("scalar U+%04X is not assigned in Unicode 15.1", scalar))
		}
	}
	normalized := cases.Fold().String(norm.NFKC.String(trimmed))
	if normalized == "" ||
		utf8.RuneCountInString(normalized) > maxNormalizedTagRunes ||
		len(normalized) > maxNormalizedTagBytes {
		return "", fieldError(path, "normalized tag exceeds limit")
	}
	return normalized, nil
}

func validateCatalog(catalog CatalogContext) error {
	if len(catalog.Positions) == 0 {
		return fieldError("/catalog/positions", "positions must be non-empty")
	}
	keys := make(map[string]struct{}, len(catalog.Positions))
	for index, position := range catalog.Positions {
		path := fmt.Sprintf("/catalog/positions/%d", index)
		if !utf8.ValidString(position.Key) || !validPositionKey(position.Key) {
			return fieldError(path+"/key", "invalid position key")
		}
		if !validSubjectType(position.SubjectType) {
			return fieldError(path+"/subjectType", "unsupported subject type")
		}
		if _, exists := keys[position.Key]; exists {
			return fieldError("/catalog/positions", "duplicate catalog key")
		}
		keys[position.Key] = struct{}{}
	}
	return nil
}

func validatePositionSelection(positionKeys []string, subjectType string, catalog CatalogContext) error {
	catalogByKey := make(map[string]CatalogPosition, len(catalog.Positions))
	for _, position := range catalog.Positions {
		catalogByKey[position.Key] = position
	}
	for index, key := range positionKeys {
		path := fmt.Sprintf("/positionKeys/%d", index)
		if strings.HasPrefix(key, "staff:") {
			identifier := key[strings.LastIndexByte(key, ':')+1:]
			if decimalGreaterThan(identifier, strconv.FormatInt(maxJSONSafeInteger, 10)) {
				return fieldError(path, "unsafe position ID")
			}
		}
		if positionSubjectType(key) != subjectType {
			return &ContractError{
				Code:    CodePositionSubjectMismatch,
				Path:    path,
				Message: "position subject type mismatch",
			}
		}
		entry, exists := catalogByKey[key]
		if !exists {
			return &ContractError{
				Code:    CodePositionNotFound,
				Path:    path,
				Message: "position missing from catalog",
			}
		}
		if entry.SubjectType != subjectType {
			return &ContractError{
				Code:    CodePositionSubjectMismatch,
				Path:    path,
				Message: "catalog subject type mismatch",
			}
		}
		if !entry.Selectable {
			return &ContractError{
				Code:    CodePositionNotSelectable,
				Path:    path,
				Message: "position is not selectable",
			}
		}
	}
	for _, subject := range []string{"anime", "game"} {
		if containsString(positionKeys, "cast:"+subject+":main") &&
			containsString(positionKeys, "cast:"+subject+":all") {
			return &ContractError{
				Code:    CodePositionSelectionConflict,
				Path:    "/positionKeys",
				Message: "cast main and all are mutually exclusive",
			}
		}
	}
	return nil
}

func decodeJSON(raw []byte, pathPrefix string) (any, error) {
	return decodeJSONDocument(raw, pathPrefix, true)
}

func decodeJSONDocument(raw []byte, pathPrefix string, enforceSafeNumbers bool) (any, error) {
	if !utf8.Valid(raw) {
		return nil, &ContractError{Code: CodeInvalidJSON, Message: "JSON is not valid UTF-8"}
	}
	if err := rejectLoneSurrogateEscapes(raw); err != nil {
		return nil, fieldError(pathPrefix, err.Error())
	}
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, &ContractError{Code: CodeInvalidJSON, Message: err.Error()}
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return nil, &ContractError{Code: CodeInvalidJSON, Message: "trailing JSON value"}
		}
		return nil, &ContractError{Code: CodeInvalidJSON, Message: err.Error()}
	}
	if enforceSafeNumbers {
		if err := validateJSONNumbers(value, pathPrefix); err != nil {
			return nil, err
		}
	}
	return value, nil
}

func rejectLoneSurrogateEscapes(raw []byte) error {
	for index := 0; index < len(raw); {
		if raw[index] != '"' {
			index++
			continue
		}
		index++
		for index < len(raw) {
			switch raw[index] {
			case '"':
				index++
				goto nextString
			case '\\':
				if index+1 >= len(raw) {
					return nil
				}
				if raw[index+1] != 'u' {
					index += 2
					continue
				}
				if index+6 > len(raw) {
					return nil
				}
				unit, ok := parseHex16(raw[index+2 : index+6])
				if !ok {
					index += 6
					continue
				}
				switch {
				case unit >= 0xd800 && unit <= 0xdbff:
					if index+12 > len(raw) || raw[index+6] != '\\' || raw[index+7] != 'u' {
						return fmt.Errorf("unpaired high surrogate")
					}
					next, ok := parseHex16(raw[index+8 : index+12])
					if !ok || next < 0xdc00 || next > 0xdfff {
						return fmt.Errorf("unpaired high surrogate")
					}
					index += 12
				case unit >= 0xdc00 && unit <= 0xdfff:
					return fmt.Errorf("unpaired low surrogate")
				default:
					index += 6
				}
			default:
				_, size := utf8.DecodeRune(raw[index:])
				index += size
			}
		}
	nextString:
	}
	return nil
}

func parseHex16(value []byte) (uint16, bool) {
	if len(value) != 4 {
		return 0, false
	}
	var result uint16
	for _, character := range value {
		result <<= 4
		switch {
		case character >= '0' && character <= '9':
			result |= uint16(character - '0')
		case character >= 'a' && character <= 'f':
			result |= uint16(character-'a') + 10
		case character >= 'A' && character <= 'F':
			result |= uint16(character-'A') + 10
		default:
			return 0, false
		}
	}
	return result, true
}

func validateJSONNumbers(value any, path string) error {
	switch typed := value.(type) {
	case json.Number:
		number, err := typed.Float64()
		if err != nil || math.IsNaN(number) || math.IsInf(number, 0) {
			return fieldError(path, "non-finite JSON number")
		}
		if math.Trunc(number) == number && math.Abs(number) > maxJSONSafeInteger {
			return fieldError(path, "unsafe JSON integer")
		}
	case []any:
		for index, entry := range typed {
			if err := validateJSONNumbers(entry, childPointer(path, strconv.Itoa(index))); err != nil {
				return err
			}
		}
	case map[string]any:
		keys := make([]string, 0, len(typed))
		for key := range typed {
			keys = append(keys, key)
		}
		sort.Slice(keys, func(i, j int) bool {
			return compareScalarStrings(keys[i], keys[j]) < 0
		})
		for _, key := range keys {
			if err := validateJSONNumbers(typed[key], childPointer(path, key)); err != nil {
				return err
			}
		}
	}
	return nil
}

func rejectUnknown(object map[string]any, path string, fields ...string) error {
	allowed := make(map[string]struct{}, len(fields))
	for _, field := range fields {
		allowed[field] = struct{}{}
	}
	unknown := make([]string, 0)
	for field := range object {
		if _, ok := allowed[field]; !ok {
			unknown = append(unknown, field)
		}
	}
	if len(unknown) == 0 {
		return nil
	}
	sort.Slice(unknown, func(i, j int) bool {
		return compareScalarStrings(unknown[i], unknown[j]) < 0
	})
	return fieldError(childPointer(path, unknown[0]), "unknown field")
}

func requiredString(object map[string]any, field, path string) (string, error) {
	raw, exists := object[field]
	if !exists {
		return "", fieldError(childPointer(path, field), "required field is missing")
	}
	value, ok := raw.(string)
	if !ok {
		return "", fieldError(childPointer(path, field), "field must be a string")
	}
	return value, nil
}

func requiredBool(object map[string]any, field, path string) (bool, error) {
	raw, exists := object[field]
	if !exists {
		return false, fieldError(childPointer(path, field), "required field is missing")
	}
	value, ok := raw.(bool)
	if !ok {
		return false, fieldError(childPointer(path, field), "field must be a boolean")
	}
	return value, nil
}

func optionalBool(object map[string]any, field string, fallback bool, path string) (bool, error) {
	raw, exists := object[field]
	if !exists {
		return fallback, nil
	}
	value, ok := raw.(bool)
	if !ok {
		return false, fieldError(childPointer(path, field), "field must be a boolean")
	}
	return value, nil
}

func validUID(value string) bool {
	if value == "" || !utf8.ValidString(value) ||
		utf8.RuneCountInString(value) > maxUIDCodePoints ||
		len(value) > maxUIDBytes {
		return false
	}
	for _, scalar := range value {
		if scalar == 0 || scalar <= 0x1f || (scalar >= 0x7f && scalar <= 0x9f) {
			return false
		}
	}
	return true
}

func validSubjectType(value string) bool {
	switch value {
	case "book", "anime", "music", "game", "real":
		return true
	default:
		return false
	}
}

func validCollectionStatus(value string) bool {
	switch value {
	case "completed", "in_progress", "on_hold", "dropped":
		return true
	default:
		return false
	}
}

func validPositionKey(value string) bool {
	if value == "" || utf8.RuneCountInString(value) > 96 {
		return false
	}
	return staffPattern.MatchString(value) ||
		castPattern.MatchString(value) ||
		staffSetPattern.MatchString(value)
}

func positionSubjectType(value string) string {
	parts := strings.Split(value, ":")
	if len(parts) < 2 {
		return ""
	}
	return parts[1]
}

func decimalGreaterThan(value, limit string) bool {
	if len(value) != len(limit) {
		return len(value) > len(limit)
	}
	return value > limit
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func compareScalarStrings(left, right string) int {
	leftRunes := []rune(left)
	rightRunes := []rune(right)
	for index := 0; index < len(leftRunes) && index < len(rightRunes); index++ {
		if leftRunes[index] < rightRunes[index] {
			return -1
		}
		if leftRunes[index] > rightRunes[index] {
			return 1
		}
	}
	switch {
	case len(leftRunes) < len(rightRunes):
		return -1
	case len(leftRunes) > len(rightRunes):
		return 1
	default:
		return 0
	}
}

func compareStringSequence(left, right []string) int {
	for index := 0; index < len(left) && index < len(right); index++ {
		if comparison := compareScalarStrings(left[index], right[index]); comparison != 0 {
			return comparison
		}
	}
	switch {
	case len(left) < len(right):
		return -1
	case len(left) > len(right):
		return 1
	default:
		return 0
	}
}

func childPointer(path, field string) string {
	field = strings.ReplaceAll(field, "~", "~0")
	field = strings.ReplaceAll(field, "/", "~1")
	return path + "/" + field
}

func fieldError(path, message string) *ContractError {
	return &ContractError{Code: CodeFieldInvalid, Path: path, Message: message}
}

func stringPointer(value string) *string {
	copy := value
	return &copy
}

func numberPointer(value json.Number) *json.Number {
	copy := value
	return &copy
}

func cloneFilters(filters *Filters) *Filters {
	if filters == nil {
		return nil
	}
	result := &Filters{
		SubjectDate:         cloneMonthRange(filters.SubjectDate),
		CollectionUpdatedAt: cloneMonthRange(filters.CollectionUpdatedAt),
		PersonalScore:       cloneNumberRange(filters.PersonalScore),
		GlobalScore:         cloneNumberRange(filters.GlobalScore),
		ScoreDifference:     cloneNumberRange(filters.ScoreDifference),
		RatingCount:         cloneIntegerRange(filters.RatingCount),
	}
	if filters.Tags != nil {
		result.Tags = &TagFilters{
			Include: make([]TagIncludeGroup, len(filters.Tags.Include)),
			Exclude: make([]TagExcludeGroup, len(filters.Tags.Exclude)),
		}
		for index, group := range filters.Tags.Include {
			result.Tags.Include[index] = TagIncludeGroup{AnyOf: append([]string(nil), group.AnyOf...)}
		}
		for index, group := range filters.Tags.Exclude {
			result.Tags.Exclude[index] = TagExcludeGroup{AllOf: append([]string(nil), group.AllOf...)}
		}
	}
	return result
}

func cloneMonthRange(value *MonthRange) *MonthRange {
	if value == nil {
		return nil
	}
	result := &MonthRange{}
	if value.Min != nil {
		result.Min = stringPointer(*value.Min)
	}
	if value.Max != nil {
		result.Max = stringPointer(*value.Max)
	}
	return result
}

func cloneNumberRange(value *NumberRange) *NumberRange {
	if value == nil {
		return nil
	}
	result := &NumberRange{}
	if value.Min != nil {
		result.Min = numberPointer(*value.Min)
	}
	if value.Max != nil {
		result.Max = numberPointer(*value.Max)
	}
	return result
}

func cloneIntegerRange(value *IntegerRange) *IntegerRange {
	if value == nil {
		return nil
	}
	result := &IntegerRange{}
	if value.Min != nil {
		result.Min = numberPointer(*value.Min)
	}
	if value.Max != nil {
		result.Max = numberPointer(*value.Max)
	}
	return result
}

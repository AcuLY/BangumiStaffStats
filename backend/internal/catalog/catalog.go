// Package catalog projects the immutable Archive catalog into the generated
// public wire without retaining rows, Store state, or a mutable cache.
package catalog

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"slices"
	"strings"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

const maxJSONInteger = 9_007_199_254_740_991

var (
	// ErrInvalidCatalog is returned for every corrupt or contradictory Store
	// projection. Callers must sanitize it as INTERNAL_ERROR.
	ErrInvalidCatalog = errors.New("catalog: invalid Store catalog")

	staffKeyPattern    = regexp.MustCompile(`^staff:(book|anime|music|game|real):([1-9][0-9]*)$`)
	castKeyPattern     = regexp.MustCompile(`^cast:(anime|game):(main|all)$`)
	staffSetKeyPattern = regexp.MustCompile(`^staffset:(book|anime|music|game|real):[a-z0-9]+(?:-[a-z0-9]+)*$`)
	categoryPattern    = regexp.MustCompile(`^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$`)
	dataVersionPattern = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
)

func catalogSubjectTypes() []wire.CatalogSubjectTypeV1 {
	return []wire.CatalogSubjectTypeV1{
		{Key: wire.Book, Label: "书籍"},
		{Key: wire.Anime, Label: "动画"},
		{Key: wire.Music, Label: "音乐"},
		{Key: wire.Game, Label: "游戏"},
		{Key: wire.Real, Label: "三次元"},
	}
}

func orderedCapabilities() []wire.CatalogPositionCapabilityNameV1 {
	return []wire.CatalogPositionCapabilityNameV1{
		wire.CatalogPositionCapabilityNameV1Rankings,
		wire.CatalogPositionCapabilityNameV1Candidates,
		wire.CatalogPositionCapabilityNameV1PersonDetail,
		wire.CatalogPositionCapabilityNameV1Partners,
		wire.CatalogPositionCapabilityNameV1CoStar,
	}
}

// Result is a newly owned immutable-by-convention projection. Project returns
// fresh slices and values on every call.
type Result struct {
	DataVersion string
	Data        wire.CatalogDataV1
}

func invalid(format string, arguments ...any) error {
	return fmt.Errorf("%w: %s", ErrInvalidCatalog, fmt.Sprintf(format, arguments...))
}

func validText(value string, maximum int) bool {
	return value != "" && utf8.ValidString(value) && utf8.RuneCountInString(value) <= maximum
}

func validSubject(value string) bool {
	return slices.Contains([]string{"book", "anime", "music", "game", "real"}, value)
}

func subjectRank(value string) int {
	return slices.Index([]string{"book", "anime", "music", "game", "real"}, value)
}

func validCategories(values []string) bool {
	if len(values) > 64 {
		return false
	}
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if len(value) > 64 || !categoryPattern.MatchString(value) {
			return false
		}
		if _, duplicate := seen[value]; duplicate {
			return false
		}
		seen[value] = struct{}{}
	}
	return true
}

func validCapabilities(values []wire.CatalogPositionCapabilityNameV1) bool {
	order := orderedCapabilities()
	if len(values) > len(order) {
		return false
	}
	expected := make([]wire.CatalogPositionCapabilityNameV1, 0, len(values))
	for _, capability := range order {
		if slices.Contains(values, capability) {
			expected = append(expected, capability)
		}
	}
	return slices.Equal(values, expected)
}

func groupKind(key string) (wire.CatalogGroupV1Kind, bool) {
	switch {
	case strings.HasPrefix(key, "bangumi:"):
		return wire.Bangumi, true
	case strings.HasPrefix(key, "shortcut:"):
		return wire.Shortcut, true
	case strings.HasPrefix(key, "custom:"):
		return wire.Custom, true
	case strings.HasPrefix(key, "fallback:"):
		return wire.Fallback, true
	default:
		return "", false
	}
}

func capabilityMatrices(ctx context.Context) ([]wire.CatalogFilterCapabilityV1, []wire.CatalogSortCapabilityV1, error) {
	if err := ctx.Err(); err != nil {
		return nil, nil, err
	}
	allTypes := []wire.CatalogSubjectTypeKeyV1{wire.Book, wire.Anime, wire.Music, wire.Game, wire.Real}
	both := []wire.CatalogScopeV1{wire.Personal, wire.Global}
	personal := []wire.CatalogScopeV1{wire.Personal}
	applications, err := allApplications()
	if err != nil {
		return nil, nil, err
	}
	filters := []wire.CatalogFilterCapabilityV1{
		{Field: wire.CatalogFilterCapabilityV1FieldIncludeNSFW, Scopes: both, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldMergeSeries, Scopes: both, SubjectTypes: []wire.CatalogSubjectTypeKeyV1{wire.Anime}, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldSubjectDate, Scopes: both, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldCollectionUpdatedAt, Scopes: personal, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldPersonalScore, Scopes: personal, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldGlobalScore, Scopes: both, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldScoreDifference, Scopes: personal, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldRatingCount, Scopes: both, SubjectTypes: allTypes, Applications: applications},
		{Field: wire.CatalogFilterCapabilityV1FieldTags, Scopes: both, SubjectTypes: allTypes, Applications: applications},
	}
	var sorts []wire.CatalogSortCapabilityV1
	addRoot := func(operation wire.CatalogRootSortCapabilityV1Operation, field wire.CatalogRootSortCapabilityV1Field, scopes []wire.CatalogScopeV1, types []wire.CatalogSubjectTypeKeyV1, merge bool) error {
		var value wire.CatalogSortCapabilityV1
		if err := value.FromCatalogRootSortCapabilityV1(wire.CatalogRootSortCapabilityV1{
			Operation: operation, Field: field, Scopes: slices.Clone(scopes),
			SubjectTypes: slices.Clone(types), RequiresMergeSeries: merge,
		}); err != nil {
			return err
		}
		sorts = append(sorts, value)
		return nil
	}
	addSection := func(section wire.CatalogSectionV1, field wire.CatalogSectionSortCapabilityV1Field, scopes []wire.CatalogScopeV1, types []wire.CatalogSubjectTypeKeyV1, merge bool) error {
		var value wire.CatalogSortCapabilityV1
		if err := value.FromCatalogSectionSortCapabilityV1(wire.CatalogSectionSortCapabilityV1{
			Operation: "personDetail", Section: section, Field: field,
			Scopes: slices.Clone(scopes), SubjectTypes: slices.Clone(types),
			RequiresMergeSeries: merge,
		}); err != nil {
			return err
		}
		sorts = append(sorts, value)
		return nil
	}
	rootSpecs := []struct {
		operation wire.CatalogRootSortCapabilityV1Operation
		field     wire.CatalogRootSortCapabilityV1Field
		scopes    []wire.CatalogScopeV1
		types     []wire.CatalogSubjectTypeKeyV1
		merge     bool
	}{
		{"rankings", "count", both, allTypes, false},
		{"rankings", "average", both, allTypes, false},
		{"rankings", "overall", both, allTypes, false},
		{"rankings", "preference", personal, allTypes, false},
		{"candidates", "count", both, allTypes, false},
		{"candidates", "average", both, allTypes, false},
		{"candidates", "globalAverage", personal, allTypes, false},
	}
	for _, spec := range rootSpecs {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		if err := addRoot(spec.operation, spec.field, spec.scopes, spec.types, spec.merge); err != nil {
			return nil, nil, invalid("build root sort: %v", err)
		}
	}
	sectionSpecs := []struct {
		section wire.CatalogSectionV1
		field   wire.CatalogSectionSortCapabilityV1Field
		scopes  []wire.CatalogScopeV1
		types   []wire.CatalogSubjectTypeKeyV1
		merge   bool
	}{
		{wire.Works, "globalScore", both, allTypes, false},
		{wire.Works, "personalScore", personal, allTypes, false},
		{wire.Works, "collectionUpdatedAt", personal, allTypes, false},
		{wire.Works, "seriesSize", both, []wire.CatalogSubjectTypeKeyV1{wire.Anime}, true},
		{wire.Characters, "role", both, []wire.CatalogSubjectTypeKeyV1{wire.Anime, wire.Game}, false},
		{wire.Characters, "workCount", both, []wire.CatalogSubjectTypeKeyV1{wire.Anime, wire.Game}, false},
		{wire.Characters, "name", both, []wire.CatalogSubjectTypeKeyV1{wire.Anime, wire.Game}, false},
	}
	for _, spec := range sectionSpecs {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		if err := addSection(spec.section, spec.field, spec.scopes, spec.types, spec.merge); err != nil {
			return nil, nil, invalid("build section sort: %v", err)
		}
	}
	for _, operation := range []wire.CatalogRootSortCapabilityV1Operation{"partners"} {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		for _, field := range []wire.CatalogRootSortCapabilityV1Field{"count", "average", "overall"} {
			if err := addRoot(operation, field, both, allTypes, false); err != nil {
				return nil, nil, invalid("build partners sort: %v", err)
			}
		}
		if err := addRoot(operation, "preference", personal, allTypes, false); err != nil {
			return nil, nil, invalid("build partners preference: %v", err)
		}
	}
	castTypes := []wire.CatalogSubjectTypeKeyV1{wire.Anime, wire.Game}
	for _, spec := range []struct {
		field  wire.CatalogRootSortCapabilityV1Field
		scopes []wire.CatalogScopeV1
		types  []wire.CatalogSubjectTypeKeyV1
		merge  bool
	}{
		{"globalScore", both, castTypes, false},
		{"personalScore", personal, castTypes, false},
		{"collectionUpdatedAt", personal, castTypes, false},
		{"seriesSize", both, []wire.CatalogSubjectTypeKeyV1{wire.Anime}, true},
	} {
		if err := ctx.Err(); err != nil {
			return nil, nil, err
		}
		if err := addRoot("coStar", spec.field, spec.scopes, spec.types, spec.merge); err != nil {
			return nil, nil, invalid("build co-star sort: %v", err)
		}
	}
	return filters, sorts, nil
}

func allApplications() ([]wire.CatalogOperationApplicabilityV1, error) {
	var result []wire.CatalogOperationApplicabilityV1
	for _, operation := range []wire.CatalogOperationApplicabilityV10Operation{
		"rankings", "candidates",
	} {
		var value wire.CatalogOperationApplicabilityV1
		if err := value.FromCatalogOperationApplicabilityV10(wire.CatalogOperationApplicabilityV10{Operation: operation}); err != nil {
			return nil, invalid("build applicability: %v", err)
		}
		result = append(result, value)
	}
	var person wire.CatalogOperationApplicabilityV1
	if err := person.FromCatalogOperationApplicabilityV11(wire.CatalogOperationApplicabilityV11{
		Operation: "personDetail",
		Sections:  []wire.CatalogSectionV1{wire.Works, wire.Characters},
	}); err != nil {
		return nil, invalid("build person applicability: %v", err)
	}
	result = append(result, person)
	for _, operation := range []wire.CatalogOperationApplicabilityV10Operation{
		"partners", "coStar",
	} {
		var value wire.CatalogOperationApplicabilityV1
		if err := value.FromCatalogOperationApplicabilityV10(wire.CatalogOperationApplicabilityV10{Operation: operation}); err != nil {
			return nil, invalid("build applicability: %v", err)
		}
		result = append(result, value)
	}
	return result, nil
}

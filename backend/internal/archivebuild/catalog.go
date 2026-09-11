package archivebuild

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"go.yaml.in/yaml/v3"
)

var subjectTypeNames = [...]string{"book", "anime", "music", "game", "real"}

var allCapabilities = [...]string{"rankings", "candidates", "personDetail", "partners", "coStar"}

type names struct {
	CN string `json:"cn" yaml:"cn"`
	EN string `json:"en" yaml:"en"`
	JP string `json:"jp" yaml:"jp"`
}

type commonCategory struct {
	SubjectType string
	Key         string
	Names       names
	Order       *int64
	SourceIndex int
}

type commonPosition struct {
	SubjectType  string
	PositionID   int64
	Names        names
	Order        *int64
	SourceIndex  int
	CategoryKeys []string
}

type commonCatalog struct {
	Categories []commonCategory
	Positions  []commonPosition
}

type capabilityRule struct {
	SubjectType  string   `json:"subjectType" yaml:"subjectType"`
	PositionKind string   `json:"positionKind" yaml:"positionKind"`
	Capabilities []string `json:"capabilities" yaml:"capabilities"`
}

type featuredGroup struct {
	SubjectType  string   `json:"subjectType" yaml:"subjectType"`
	Label        string   `json:"label" yaml:"label"`
	PositionKeys []string `json:"positionKeys" yaml:"positionKeys"`
}

type castGroup struct {
	SubjectType       string   `json:"subjectType" yaml:"subjectType"`
	Label             string   `json:"label" yaml:"label"`
	AnchorCategoryKey string   `json:"anchorCategoryKey" yaml:"anchorCategoryKey"`
	PositionKeys      []string `json:"positionKeys" yaml:"positionKeys"`
}

type additionalGroup struct {
	GroupKey     string   `json:"groupKey" yaml:"groupKey"`
	SubjectType  string   `json:"subjectType" yaml:"subjectType"`
	Label        string   `json:"label" yaml:"label"`
	DisplayOrder int64    `json:"displayOrder" yaml:"displayOrder"`
	PositionKeys []string `json:"positionKeys" yaml:"positionKeys"`
}

type displayConfig struct {
	SchemaVersion           int               `json:"schemaVersion" yaml:"schemaVersion"`
	CapabilityRules         []capabilityRule  `json:"capabilityRules" yaml:"capabilityRules"`
	FeaturedGroups          []featuredGroup   `json:"featuredGroups" yaml:"featuredGroups"`
	CastGroups              []castGroup       `json:"castGroups" yaml:"castGroups"`
	AdditionalDisplayGroups []additionalGroup `json:"additionalDisplayGroups" yaml:"additionalDisplayGroups"`
}

type staffSetValue struct {
	Key          string   `json:"key" yaml:"key"`
	SubjectType  string   `json:"subjectType" yaml:"subjectType"`
	Label        string   `json:"label" yaml:"label"`
	DisplayOrder int64    `json:"displayOrder" yaml:"displayOrder"`
	Members      []string `json:"members" yaml:"members"`
}

type staffSetConfig struct {
	SchemaVersion int             `json:"schemaVersion" yaml:"schemaVersion"`
	Sets          []staffSetValue `json:"sets" yaml:"sets"`
}

type canonicalCatalogConfig struct {
	Display   displayConfig  `json:"display"`
	StaffSets staffSetConfig `json:"staffSets"`
}

type compiledPosition struct {
	PositionKey  string
	SubjectType  string
	PositionKind string
	Names        names
	Label        string
	DisplayOrder int64
	Selectable   bool
	Capabilities []string
	RuleKey      string
	RuleKind     string
	RuleValue    string
	MemberKeys   []string
	LogicalRule  string
}

type compiledGroup struct {
	GroupKey     string
	SubjectType  string
	Label        string
	DisplayOrder int64
	PositionKeys []string
}

type compiledStaffSet struct {
	Key          string
	SubjectType  string
	Label        string
	DisplayOrder int64
	Members      []string
}

type compiledCatalog struct {
	Governed          bool
	OrderedCategories []commonCategory
	OrderedPositions  []commonPosition
	Positions         []compiledPosition
	Groups            []compiledGroup
	StaffSets         []compiledStaffSet
}

func canonicalCatalogConfiguration(displayBytes, staffSetBytes []byte) ([]byte, string, error) {
	var display displayConfig
	if err := decodeYAMLStrict(displayBytes, &display); err != nil {
		return nil, "", failure("DISPLAY_CONFIG_INVALID", err)
	}
	var sets staffSetConfig
	if err := decodeYAMLStrict(staffSetBytes, &sets); err != nil {
		return nil, "", failure("STAFF_SET_CONFIG_INVALID", err)
	}
	return canonicalCatalogFromValues(display, sets)
}

// CanonicalCatalogConfiguration is the fixture seam for the governed catalog.
// JSON documents are accepted because JSON is a strict YAML subset.
func CanonicalCatalogConfiguration(displayBytes, staffSetBytes []byte) ([]byte, string, error) {
	return canonicalCatalogConfiguration(displayBytes, staffSetBytes)
}

func canonicalCatalogFromValues(display displayConfig, sets staffSetConfig) ([]byte, string, error) {
	if err := validateDisplayConfig(display); err != nil {
		return nil, "", err
	}
	if err := validateStaffSetConfig(sets); err != nil {
		return nil, "", err
	}
	for index := range sets.Sets {
		slices.Sort(sets.Sets[index].Members)
	}
	sort.Slice(sets.Sets, func(i, j int) bool {
		left, right := sets.Sets[i], sets.Sets[j]
		if subjectTypeOrder[left.SubjectType] != subjectTypeOrder[right.SubjectType] {
			return subjectTypeOrder[left.SubjectType] < subjectTypeOrder[right.SubjectType]
		}
		if left.DisplayOrder != right.DisplayOrder {
			return left.DisplayOrder < right.DisplayOrder
		}
		return left.Key < right.Key
	})
	data, err := compactCanonicalJSON(canonicalCatalogConfig{Display: display, StaffSets: sets})
	if err != nil {
		return nil, "", failure("CATALOG_CONFIG_INVALID", err)
	}
	return data, digestBytes(data), nil
}

func decodeYAMLStrict(data []byte, target any) error {
	if !utf8.Valid(data) || len(data) == 0 || len(data) > 4*1024*1024 {
		return fmt.Errorf("yaml bytes")
	}
	var document yaml.Node
	decoder := yaml.NewDecoder(bytes.NewReader(data))
	decoder.KnownFields(true)
	if err := decoder.Decode(&document); err != nil {
		return err
	}
	if len(document.Content) != 1 {
		return fmt.Errorf("yaml document")
	}
	if err := rejectDuplicateYAMLKeys(document.Content[0]); err != nil {
		return err
	}
	return document.Content[0].Decode(target)
}

func rejectDuplicateYAMLKeys(node *yaml.Node) error {
	if node == nil {
		return nil
	}
	if node.Kind == yaml.AliasNode {
		return nil
	}
	if node.Kind == yaml.MappingNode {
		seen := make(map[string]struct{}, len(node.Content)/2)
		for index := 0; index < len(node.Content); index += 2 {
			key := node.Content[index]
			identity := key.Tag + "\x00" + key.Value
			if _, exists := seen[identity]; exists {
				return fmt.Errorf("duplicate YAML key")
			}
			seen[identity] = struct{}{}
		}
	}
	for _, child := range node.Content {
		if err := rejectDuplicateYAMLKeys(child); err != nil {
			return err
		}
	}
	return nil
}

func validateDisplayConfig(value displayConfig) error {
	if value.SchemaVersion != 1 || len(value.CapabilityRules) != 7 || len(value.FeaturedGroups) != 2 || len(value.CastGroups) != 2 {
		return failure("DISPLAY_CONFIG_INVALID", nil)
	}
	expectedRules := map[string]struct{}{
		"book:staff": {}, "anime:staff": {}, "music:staff": {}, "game:staff": {}, "real:staff": {},
		"anime:cast": {}, "game:cast": {},
	}
	for _, rule := range value.CapabilityRules {
		key := rule.SubjectType + ":" + rule.PositionKind
		if _, ok := expectedRules[key]; !ok || !slices.Equal(rule.Capabilities, allCapabilities[:]) {
			return failure("CAPABILITY_MATRIX_INVALID", nil)
		}
		delete(expectedRules, key)
	}
	if len(expectedRules) != 0 {
		return failure("CAPABILITY_MATRIX_INVALID", nil)
	}
	expectedFeatured := map[string][]string{
		"anime": {"staff:anime:2", "staff:anime:67", "cast:anime:main", "cast:anime:all", "staff:anime:3", "staff:anime:10", "staff:anime:74", "staff:anime:1", "staff:anime:5", "staff:anime:4"},
		"game":  {"staff:game:1004", "staff:game:1001", "cast:game:all", "cast:game:main", "staff:game:1013"},
	}
	for _, group := range value.FeaturedGroups {
		expected, ok := expectedFeatured[group.SubjectType]
		if !ok || group.Label == "" || !slices.Equal(group.PositionKeys, expected) {
			return failure("FEATURED_GROUP_INVALID", nil)
		}
		delete(expectedFeatured, group.SubjectType)
	}
	expectedCast := map[string][]string{
		"anime": {"cast:anime:main", "cast:anime:all"},
		"game":  {"cast:game:main", "cast:game:all"},
	}
	for _, group := range value.CastGroups {
		expected, ok := expectedCast[group.SubjectType]
		if !ok || group.Label == "" || group.AnchorCategoryKey != "music" || !slices.Equal(group.PositionKeys, expected) {
			return failure("CAST_GROUP_INVALID", nil)
		}
		delete(expectedCast, group.SubjectType)
	}
	seen := make(map[string]struct{})
	for _, group := range value.AdditionalDisplayGroups {
		if group.GroupKey == "" || group.Label == "" || group.DisplayOrder < 0 || !validSubjectType(group.SubjectType) || len(group.PositionKeys) == 0 {
			return failure("DISPLAY_CONFIG_INVALID", nil)
		}
		if _, exists := seen[group.GroupKey]; exists {
			return failure("DUPLICATE_GROUP_KEY", nil)
		}
		seen[group.GroupKey] = struct{}{}
	}
	return nil
}

var staffSetKeyPattern = regexp.MustCompile(`^staffset:(book|anime|music|game|real):[a-z0-9]+(?:-[a-z0-9]+)*$`)

func validateStaffSetConfig(value staffSetConfig) error {
	if value.SchemaVersion != 1 {
		return failure("STAFF_SET_CONFIG_INVALID", nil)
	}
	seen := make(map[string]struct{})
	for _, set := range value.Sets {
		match := staffSetKeyPattern.FindStringSubmatch(set.Key)
		if len(match) != 2 || match[1] != set.SubjectType || len(set.Key) > 96 || set.Label == "" || set.DisplayOrder <= 0 || len(set.Members) < 2 {
			return failure("STAFF_SET_CONFIG_INVALID", nil)
		}
		if _, exists := seen[set.Key]; exists {
			return failure("DUPLICATE_STAFF_SET_KEY", nil)
		}
		seen[set.Key] = struct{}{}
		memberSeen := make(map[string]struct{})
		for _, member := range set.Members {
			if _, exists := memberSeen[member]; exists {
				return failure("DUPLICATE_STAFF_SET_MEMBER", nil)
			}
			memberSeen[member] = struct{}{}
		}
	}
	return nil
}

func validSubjectType(value string) bool {
	_, ok := subjectTypeOrder[value]
	return ok
}

func parseCatalog(commonBytes, catalogBytes []byte) (commonCatalog, compiledCatalog, error) {
	common, err := parseCommonCatalog(commonBytes)
	if err != nil {
		return commonCatalog{}, compiledCatalog{}, err
	}
	object, err := decodeStrictObject(catalogBytes)
	if err != nil {
		return commonCatalog{}, compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", err)
	}
	if _, governed := object["display"]; governed {
		var config canonicalCatalogConfig
		decoder := json.NewDecoder(bytes.NewReader(catalogBytes))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&config); err != nil || requireJSONEOF(decoder) != nil {
			return commonCatalog{}, compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", err)
		}
		canonical, _, err := canonicalCatalogFromValues(config.Display, config.StaffSets)
		if err != nil {
			return commonCatalog{}, compiledCatalog{}, err
		}
		if !bytes.Equal(canonical, catalogBytes) {
			return commonCatalog{}, compiledCatalog{}, failure("CATALOG_CONFIG_NOT_CANONICAL", nil)
		}
		compiled, err := compileGovernedCatalog(common, config)
		return common, compiled, err
	}
	compiled, err := parseLegacyCatalog(catalogBytes)
	return common, compiled, err
}

func parseCommonCatalog(data []byte) (commonCatalog, error) {
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
	}
	if trimmed[0] == '[' {
		return parseContractCommon(trimmed)
	}
	if trimmed[0] == '{' {
		object, err := decodeStrictObject(trimmed)
		if err == nil {
			if _, ok := object["positions"]; ok {
				return parseSyntheticCommon(trimmed)
			}
		}
	}
	return parsePinnedCommon(data)
}

type contractNames struct {
	CN *string `json:"cn"`
	EN *string `json:"en"`
	JP *string `json:"jp"`
}

type contractCategory struct {
	Key         string        `json:"key"`
	Names       contractNames `json:"names"`
	Order       *int64        `json:"order"`
	SourceIndex int           `json:"sourceIndex"`
}

type contractPosition struct {
	ID           int64         `json:"id"`
	Names        contractNames `json:"names"`
	Order        *int64        `json:"order"`
	SourceIndex  int           `json:"sourceIndex"`
	CategoryKeys []string      `json:"categoryKeys"`
}

type contractCommonType struct {
	SubjectType string             `json:"subjectType"`
	Categories  []contractCategory `json:"categories"`
	Positions   []contractPosition `json:"positions"`
}

func normalizedNames(value contractNames, requireCN bool) (names, error) {
	result := names{}
	if value.CN != nil {
		result.CN = *value.CN
	}
	if value.EN != nil {
		result.EN = *value.EN
	}
	if value.JP != nil {
		result.JP = *value.JP
	}
	if requireCN && result.CN == "" {
		return names{}, failure("COMMON_CHINESE_LABEL_MISSING", nil)
	}
	return result, nil
}

func parseContractCommon(data []byte) (commonCatalog, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var values []contractCommonType
	if err := decoder.Decode(&values); err != nil || requireJSONEOF(decoder) != nil || len(values) != len(subjectTypeNames) {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", err)
	}
	result := commonCatalog{}
	typesSeen := make(map[string]struct{})
	for _, entry := range values {
		if !validSubjectType(entry.SubjectType) {
			return commonCatalog{}, failure("COMMON_TYPE_SET_INVALID", nil)
		}
		if _, exists := typesSeen[entry.SubjectType]; exists {
			return commonCatalog{}, failure("COMMON_TYPE_SET_INVALID", nil)
		}
		typesSeen[entry.SubjectType] = struct{}{}
		categoryKeys := make(map[string]struct{})
		for _, category := range entry.Categories {
			categoryNames, err := normalizedNames(category.Names, true)
			if err != nil {
				return commonCatalog{}, failure("COMMON_CATEGORY_CHINESE_LABEL_MISSING", err)
			}
			if category.Key == "" || category.SourceIndex < 0 {
				return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
			}
			if _, exists := categoryKeys[category.Key]; exists {
				return commonCatalog{}, failure("DUPLICATE_COMMON_CATEGORY", nil)
			}
			categoryKeys[category.Key] = struct{}{}
			result.Categories = append(result.Categories, commonCategory{SubjectType: entry.SubjectType, Key: category.Key, Names: categoryNames, Order: category.Order, SourceIndex: category.SourceIndex})
		}
		positionIDs := make(map[int64]struct{})
		for _, position := range entry.Positions {
			positionNames, err := normalizedNames(position.Names, true)
			if err != nil {
				return commonCatalog{}, err
			}
			if position.ID <= 0 || position.ID > maxJSONSafeInteger || position.SourceIndex < 0 {
				return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
			}
			if _, exists := positionIDs[position.ID]; exists {
				return commonCatalog{}, failure("DUPLICATE_COMMON_POSITION", nil)
			}
			positionIDs[position.ID] = struct{}{}
			seen := make(map[string]struct{})
			for _, key := range position.CategoryKeys {
				if _, ok := categoryKeys[key]; !ok {
					return commonCatalog{}, failure("UNKNOWN_COMMON_CATEGORY_REFERENCE", nil)
				}
				if _, duplicate := seen[key]; duplicate {
					return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
				}
				seen[key] = struct{}{}
			}
			result.Positions = append(result.Positions, commonPosition{SubjectType: entry.SubjectType, PositionID: position.ID, Names: positionNames, Order: position.Order, SourceIndex: position.SourceIndex, CategoryKeys: slices.Clone(position.CategoryKeys)})
		}
	}
	return result, nil
}

type syntheticCommonPosition struct {
	SubjectType int64    `json:"subjectType"`
	PositionID  int64    `json:"positionId"`
	NameCN      *string  `json:"nameCn"`
	NameEN      *string  `json:"nameEn"`
	NameJP      *string  `json:"nameJp"`
	Categories  []string `json:"categories"`
	SortOrder   int64    `json:"sortOrder"`
	Status      string   `json:"status"`
}

func parseSyntheticCommon(data []byte) (commonCatalog, error) {
	var document struct {
		Positions []syntheticCommonPosition `json:"positions"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&document); err != nil || requireJSONEOF(decoder) != nil {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", err)
	}
	result := commonCatalog{}
	categoryOrder := make(map[string]int64)
	identities := make(map[string]struct{})
	for index, value := range document.Positions {
		typeName, err := subjectTypeFromCode(value.SubjectType)
		if err != nil || value.PositionID <= 0 || value.Status != "selectable" || value.NameCN == nil || *value.NameCN == "" {
			return commonCatalog{}, failure("COMMON_CATALOG_INVALID", err)
		}
		identity := fmt.Sprintf("%d:%d", value.SubjectType, value.PositionID)
		if _, exists := identities[identity]; exists {
			return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
		}
		identities[identity] = struct{}{}
		for _, key := range value.Categories {
			categoryIdentity := typeName + ":" + key
			if _, exists := categoryOrder[categoryIdentity]; !exists {
				categoryOrder[categoryIdentity] = int64(len(categoryOrder) + 1)
				order := categoryOrder[categoryIdentity]
				result.Categories = append(result.Categories, commonCategory{SubjectType: typeName, Key: key, Names: names{CN: key, EN: key}, Order: &order, SourceIndex: len(result.Categories)})
			}
		}
		positionNames := names{CN: dereference(value.NameCN), EN: dereference(value.NameEN), JP: dereference(value.NameJP)}
		order := value.SortOrder
		result.Positions = append(result.Positions, commonPosition{SubjectType: typeName, PositionID: value.PositionID, Names: positionNames, Order: &order, SourceIndex: index, CategoryKeys: slices.Clone(value.Categories)})
	}
	return result, nil
}

func dereference(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func yamlMappingValue(node *yaml.Node, key string) *yaml.Node {
	if node != nil && node.Kind == yaml.AliasNode {
		node = node.Alias
	}
	if node == nil || node.Kind != yaml.MappingNode {
		return nil
	}
	for index := 0; index < len(node.Content); index += 2 {
		if yamlScalar(node.Content[index]) == key {
			return node.Content[index+1]
		}
	}
	return nil
}

func yamlScalar(node *yaml.Node) string {
	if node != nil && node.Kind == yaml.AliasNode {
		node = node.Alias
	}
	if node == nil || node.Kind != yaml.ScalarNode {
		return ""
	}
	return node.Value
}

func parsePinnedCommon(data []byte) (commonCatalog, error) {
	if !utf8.Valid(data) || len(data) == 0 || len(data) > 4*1024*1024 {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
	}
	var document yaml.Node
	if err := yaml.Unmarshal(data, &document); err != nil || len(document.Content) != 1 {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", err)
	}
	if err := rejectDuplicateYAMLKeys(document.Content[0]); err != nil {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", err)
	}
	root := document.Content[0]
	define := yamlMappingValue(root, "define")
	typesNode := yamlMappingValue(define, "types")
	categoriesNode := yamlMappingValue(define, "categories")
	staffsNode := yamlMappingValue(root, "staffs")
	if define == nil || typesNode == nil || staffsNode == nil {
		return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
	}
	result := commonCatalog{}
	codeByType := map[string]string{"book": "1", "anime": "2", "music": "3", "game": "4", "real": "6"}
	for _, subjectType := range subjectTypeNames {
		positionsNode := yamlMappingValue(typesNode, subjectType)
		if positionsNode != nil && positionsNode.Kind == yaml.AliasNode {
			positionsNode = positionsNode.Alias
		}
		if positionsNode == nil || positionsNode.Kind != yaml.MappingNode || yamlMappingValue(staffsNode, codeByType[subjectType]) == nil {
			return commonCatalog{}, failure("COMMON_TYPE_SET_INVALID", nil)
		}
		categories := make(map[string]commonCategory)
		typeCategories := yamlMappingValue(categoriesNode, subjectType)
		if typeCategories != nil && typeCategories.Kind == yaml.AliasNode {
			typeCategories = typeCategories.Alias
		}
		if typeCategories != nil {
			if typeCategories.Kind != yaml.SequenceNode {
				return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
			}
			for index, categoryNode := range typeCategories.Content {
				if categoryNode.Kind == yaml.AliasNode {
					categoryNode = categoryNode.Alias
				}
				key := yamlScalar(yamlMappingValue(categoryNode, "en"))
				label := yamlScalar(yamlMappingValue(categoryNode, "cn"))
				orderValue, orderErr := strconv.ParseInt(yamlScalar(yamlMappingValue(categoryNode, "order")), 10, 64)
				if key == "" || label == "" || orderErr != nil {
					return commonCatalog{}, failure("COMMON_CATEGORY_CHINESE_LABEL_MISSING", orderErr)
				}
				order := orderValue
				category := commonCategory{SubjectType: subjectType, Key: key, Names: names{CN: label, EN: key}, Order: &order, SourceIndex: index}
				if _, exists := categories[key]; exists {
					return commonCatalog{}, failure("DUPLICATE_COMMON_CATEGORY", nil)
				}
				categories[key] = category
				result.Categories = append(result.Categories, category)
			}
		}
		for index := 0; index < len(positionsNode.Content); index += 2 {
			id, idErr := strconv.ParseInt(yamlScalar(positionsNode.Content[index]), 10, 64)
			positionNode := positionsNode.Content[index+1]
			if positionNode.Kind == yaml.AliasNode {
				positionNode = positionNode.Alias
			}
			cn := yamlScalar(yamlMappingValue(positionNode, "cn"))
			if idErr != nil || id <= 0 || cn == "" {
				return commonCatalog{}, failure("COMMON_CHINESE_LABEL_MISSING", idErr)
			}
			categoryKeys := []string{}
			positionCategories := yamlMappingValue(positionNode, "categories")
			if positionCategories != nil {
				if positionCategories.Kind != yaml.SequenceNode {
					return commonCatalog{}, failure("COMMON_CATALOG_INVALID", nil)
				}
				for _, item := range positionCategories.Content {
					if item.Kind == yaml.AliasNode {
						item = item.Alias
					}
					key := yamlScalar(yamlMappingValue(item, "en"))
					if _, ok := categories[key]; !ok || slices.Contains(categoryKeys, key) {
						return commonCatalog{}, failure("UNKNOWN_COMMON_CATEGORY_REFERENCE", nil)
					}
					categoryKeys = append(categoryKeys, key)
				}
			}
			result.Positions = append(result.Positions, commonPosition{SubjectType: subjectType, PositionID: id, Names: names{CN: cn, EN: yamlScalar(yamlMappingValue(positionNode, "en")), JP: yamlScalar(yamlMappingValue(positionNode, "jp"))}, SourceIndex: index / 2, CategoryKeys: categoryKeys})
		}
	}
	return result, nil
}

func stableCommonLess(orderA *int64, sourceA int, identityA string, orderB *int64, sourceB int, identityB string) bool {
	positiveA := orderA != nil && *orderA > 0
	positiveB := orderB != nil && *orderB > 0
	if positiveA != positiveB {
		return positiveA
	}
	if positiveA && *orderA != *orderB {
		return *orderA < *orderB
	}
	if sourceA != sourceB {
		return sourceA < sourceB
	}
	return identityA < identityB
}

func compileGovernedCatalog(common commonCatalog, config canonicalCatalogConfig) (compiledCatalog, error) {
	rules := make(map[string][]string)
	for _, rule := range config.Display.CapabilityRules {
		rules[rule.SubjectType+":"+rule.PositionKind] = slices.Clone(rule.Capabilities)
	}
	compiled := compiledCatalog{Governed: true}
	positionByKey := make(map[string]compiledPosition)
	for _, subjectType := range subjectTypeNames {
		categories := []commonCategory{}
		positions := []commonPosition{}
		for _, value := range common.Categories {
			if value.SubjectType == subjectType {
				categories = append(categories, value)
			}
		}
		for _, value := range common.Positions {
			if value.SubjectType == subjectType {
				positions = append(positions, value)
			}
		}
		sort.Slice(categories, func(i, j int) bool {
			return stableCommonLess(categories[i].Order, categories[i].SourceIndex, categories[i].Key, categories[j].Order, categories[j].SourceIndex, categories[j].Key)
		})
		sort.Slice(positions, func(i, j int) bool {
			return stableCommonLess(positions[i].Order, positions[i].SourceIndex, fmt.Sprint(positions[i].PositionID), positions[j].Order, positions[j].SourceIndex, fmt.Sprint(positions[j].PositionID))
		})
		compiled.OrderedCategories = append(compiled.OrderedCategories, categories...)
		compiled.OrderedPositions = append(compiled.OrderedPositions, positions...)
		for index, value := range positions {
			key := fmt.Sprintf("staff:%s:%d", subjectType, value.PositionID)
			position := compiledPosition{PositionKey: key, SubjectType: subjectType, PositionKind: "staff", Names: value.Names, Label: value.Names.CN, DisplayOrder: int64(index+1) * 10, Selectable: true, Capabilities: slices.Clone(rules[subjectType+":staff"]), RuleKey: "rule:" + key, RuleKind: "exactStaff", RuleValue: fmt.Sprint(value.PositionID), LogicalRule: "positionId=" + fmt.Sprint(value.PositionID)}
			positionByKey[key] = position
		}
		if subjectType == "anime" || subjectType == "game" {
			firstOrder := int64(len(positions)+1) * 10
			for offset, suffix := range []string{"main", "all"} {
				key := "cast:" + subjectType + ":" + suffix
				label, rule := "声优（仅主役）", "1"
				if suffix == "all" {
					label, rule = "声优", "1..6"
				}
				positionByKey[key] = compiledPosition{PositionKey: key, SubjectType: subjectType, PositionKind: "cast", Names: names{CN: label}, Label: label, DisplayOrder: firstOrder + int64(offset)*10, Selectable: true, Capabilities: slices.Clone(rules[subjectType+":cast"]), RuleKey: "exclusive:cast:" + subjectType, RuleKind: "exactCast", RuleValue: rule, LogicalRule: "roleType=" + rule}
			}
		}
	}
	for _, set := range config.StaffSets.Sets {
		members := slices.Clone(set.Members)
		slices.Sort(members)
		capabilities := []string{}
		for _, capability := range allCapabilities {
			present := true
			for _, memberKey := range members {
				member, ok := positionByKey[memberKey]
				if !ok {
					return compiledCatalog{}, failure("UNKNOWN_STAFF_SET_MEMBER", nil)
				}
				if member.PositionKind != "staff" {
					return compiledCatalog{}, failure("NON_STAFF_SET_MEMBER", nil)
				}
				if member.SubjectType != set.SubjectType {
					return compiledCatalog{}, failure("CROSS_TYPE_STAFF_SET_MEMBER", nil)
				}
				present = present && slices.Contains(member.Capabilities, capability)
			}
			if present {
				capabilities = append(capabilities, capability)
			}
		}
		compiled.StaffSets = append(compiled.StaffSets, compiledStaffSet{Key: set.Key, SubjectType: set.SubjectType, Label: set.Label, DisplayOrder: set.DisplayOrder, Members: members})
		positionByKey[set.Key] = compiledPosition{PositionKey: set.Key, SubjectType: set.SubjectType, PositionKind: "staffSet", Names: names{CN: set.Label}, Label: set.Label, DisplayOrder: set.DisplayOrder, Selectable: true, Capabilities: capabilities, RuleKey: "rule:" + set.Key, RuleKind: "staffSetUnion", RuleValue: set.Key, LogicalRule: "staffSetUnion:" + set.Key, MemberKeys: members}
	}
	for _, value := range positionByKey {
		compiled.Positions = append(compiled.Positions, value)
	}
	sort.Slice(compiled.Positions, func(i, j int) bool {
		left, right := compiled.Positions[i], compiled.Positions[j]
		if subjectTypeOrder[left.SubjectType] != subjectTypeOrder[right.SubjectType] {
			return subjectTypeOrder[left.SubjectType] < subjectTypeOrder[right.SubjectType]
		}
		if left.DisplayOrder != right.DisplayOrder {
			return left.DisplayOrder < right.DisplayOrder
		}
		return left.PositionKey < right.PositionKey
	})
	featured := make(map[string]featuredGroup)
	for _, group := range config.Display.FeaturedGroups {
		featured[group.SubjectType] = group
	}
	castGroups := make(map[string]castGroup)
	for _, group := range config.Display.CastGroups {
		castGroups[group.SubjectType] = group
	}
	groupKeys := make(map[string]struct{})
	for _, subjectType := range subjectTypeNames {
		displayOrder := int64(10)
		addGroup := func(group compiledGroup) error {
			if _, exists := groupKeys[group.GroupKey]; exists {
				return failure("DUPLICATE_GROUP_KEY", nil)
			}
			seen := make(map[string]struct{})
			for _, key := range group.PositionKeys {
				position, ok := positionByKey[key]
				if !ok || position.SubjectType != group.SubjectType {
					return failure("UNKNOWN_GROUP_REFERENCE", nil)
				}
				if _, duplicate := seen[key]; duplicate {
					return failure("DUPLICATE_GROUP_REFERENCE", nil)
				}
				seen[key] = struct{}{}
			}
			groupKeys[group.GroupKey] = struct{}{}
			compiled.Groups = append(compiled.Groups, group)
			return nil
		}
		if group, ok := featured[subjectType]; ok {
			if err := addGroup(compiledGroup{GroupKey: "shortcut:" + subjectType + ":featured", SubjectType: subjectType, Label: group.Label, DisplayOrder: displayOrder, PositionKeys: slices.Clone(group.PositionKeys)}); err != nil {
				return compiledCatalog{}, err
			}
			displayOrder += 10
		}
		categories := []commonCategory{}
		positions := []commonPosition{}
		for _, category := range compiled.OrderedCategories {
			if category.SubjectType == subjectType {
				categories = append(categories, category)
			}
		}
		for _, position := range compiled.OrderedPositions {
			if position.SubjectType == subjectType {
				positions = append(positions, position)
			}
		}
		for _, category := range categories {
			members := []string{}
			for _, position := range positions {
				if slices.Contains(position.CategoryKeys, category.Key) {
					members = append(members, fmt.Sprintf("staff:%s:%d", subjectType, position.PositionID))
				}
			}
			if err := addGroup(compiledGroup{GroupKey: "bangumi:" + subjectType + ":" + category.Key, SubjectType: subjectType, Label: category.Names.CN, DisplayOrder: displayOrder, PositionKeys: members}); err != nil {
				return compiledCatalog{}, err
			}
			displayOrder += 10
			if cast, ok := castGroups[subjectType]; ok && cast.AnchorCategoryKey == category.Key {
				if category.Names.CN != "声音类" || category.Names.EN != "music" {
					return compiledCatalog{}, failure("CAST_GROUP_ANCHOR_LABEL_INVALID", nil)
				}
				if err := addGroup(compiledGroup{GroupKey: "shortcut:" + subjectType + ":cast", SubjectType: subjectType, Label: cast.Label, DisplayOrder: displayOrder, PositionKeys: slices.Clone(cast.PositionKeys)}); err != nil {
					return compiledCatalog{}, err
				}
				displayOrder += 10
			}
		}
		if cast, ok := castGroups[subjectType]; ok {
			found := false
			for _, category := range categories {
				found = found || category.Key == cast.AnchorCategoryKey
			}
			if !found {
				return compiledCatalog{}, failure("CAST_GROUP_ANCHOR_MISSING", nil)
			}
		}
		fallback := []string{}
		for _, position := range positions {
			if len(categories) == 0 || len(position.CategoryKeys) == 0 {
				fallback = append(fallback, fmt.Sprintf("staff:%s:%d", subjectType, position.PositionID))
			}
		}
		if len(fallback) > 0 {
			suffix, label := "other", "其他"
			if len(categories) == 0 {
				suffix, label = "all", "全部职位"
			}
			if err := addGroup(compiledGroup{GroupKey: "fallback:" + subjectType + ":" + suffix, SubjectType: subjectType, Label: label, DisplayOrder: displayOrder, PositionKeys: fallback}); err != nil {
				return compiledCatalog{}, err
			}
			displayOrder += 10
		}
		sets := []compiledStaffSet{}
		for _, set := range compiled.StaffSets {
			if set.SubjectType == subjectType {
				sets = append(sets, set)
			}
		}
		if len(sets) > 0 {
			sort.Slice(sets, func(i, j int) bool {
				if sets[i].DisplayOrder != sets[j].DisplayOrder {
					return sets[i].DisplayOrder < sets[j].DisplayOrder
				}
				return sets[i].Key < sets[j].Key
			})
			members := make([]string, len(sets))
			for index := range sets {
				members[index] = sets[index].Key
			}
			if err := addGroup(compiledGroup{GroupKey: "custom:" + subjectType + ":staff-sets", SubjectType: subjectType, Label: "人工职位集合", DisplayOrder: displayOrder, PositionKeys: members}); err != nil {
				return compiledCatalog{}, err
			}
			displayOrder += 10
		}
		additional := []additionalGroup{}
		for _, group := range config.Display.AdditionalDisplayGroups {
			if group.SubjectType == subjectType {
				additional = append(additional, group)
			}
		}
		sort.Slice(additional, func(i, j int) bool {
			if additional[i].DisplayOrder != additional[j].DisplayOrder {
				return additional[i].DisplayOrder < additional[j].DisplayOrder
			}
			return additional[i].GroupKey < additional[j].GroupKey
		})
		for _, group := range additional {
			if err := addGroup(compiledGroup{GroupKey: group.GroupKey, SubjectType: subjectType, Label: group.Label, DisplayOrder: displayOrder, PositionKeys: slices.Clone(group.PositionKeys)}); err != nil {
				return compiledCatalog{}, err
			}
			displayOrder += 10
		}
	}
	return compiled, nil
}

type legacyCatalogPosition struct {
	PositionKey   string   `json:"positionKey"`
	SubjectType   string   `json:"subjectType"`
	PositionKind  string   `json:"positionKind"`
	Label         string   `json:"label"`
	DisplayOrder  int64    `json:"displayOrder"`
	Selectable    bool     `json:"selectable"`
	Capabilities  []string `json:"capabilities"`
	SelectionRule string   `json:"selectionRule"`
}

type legacyCatalogGroup struct {
	GroupKey     string   `json:"groupKey"`
	SubjectType  string   `json:"subjectType"`
	Label        string   `json:"label"`
	DisplayOrder int64    `json:"displayOrder"`
	PositionKeys []string `json:"positionKeys"`
}

func parseLegacyCatalog(data []byte) (compiledCatalog, error) {
	var document struct {
		Positions []legacyCatalogPosition `json:"positions"`
		Groups    []legacyCatalogGroup    `json:"groups"`
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&document); err != nil || requireJSONEOF(decoder) != nil || len(document.Positions) == 0 {
		return compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", err)
	}
	compiled := compiledCatalog{}
	keys := make(map[string]struct{})
	for _, value := range document.Positions {
		parts := strings.Split(value.PositionKey, ":")
		if len(parts) != 3 || parts[0] != value.PositionKind || parts[1] != value.SubjectType || !validSubjectType(value.SubjectType) || value.Label == "" || len(value.Capabilities) == 0 {
			return compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", nil)
		}
		if _, exists := keys[value.PositionKey]; exists {
			return compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", nil)
		}
		keys[value.PositionKey] = struct{}{}
		ruleKind, ruleValue := "exactStaff", strings.TrimPrefix(value.SelectionRule, "positionId=")
		if value.PositionKind == "cast" {
			ruleKind, ruleValue = "exactCast", strings.TrimPrefix(value.SelectionRule, "roleType=")
		}
		compiled.Positions = append(compiled.Positions, compiledPosition{PositionKey: value.PositionKey, SubjectType: value.SubjectType, PositionKind: value.PositionKind, Label: value.Label, DisplayOrder: value.DisplayOrder, Selectable: value.Selectable, Capabilities: slices.Clone(value.Capabilities), RuleKey: "rule:" + value.PositionKey, RuleKind: ruleKind, RuleValue: ruleValue, LogicalRule: value.SelectionRule})
	}
	for _, value := range document.Groups {
		for _, key := range value.PositionKeys {
			if _, ok := keys[key]; !ok {
				return compiledCatalog{}, failure("CATALOG_CONFIG_INVALID", nil)
			}
		}
		compiled.Groups = append(compiled.Groups, compiledGroup{GroupKey: value.GroupKey, SubjectType: value.SubjectType, Label: value.Label, DisplayOrder: value.DisplayOrder, PositionKeys: slices.Clone(value.PositionKeys)})
	}
	return compiled, nil
}

package archive

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const (
	pointerSchemaVersion   = 1
	manifestSchemaVersion  = 1
	sqliteSchemaVersion    = 1
	sqliteApplicationID    = 1111969107
	dataVersionAlgorithm   = "bgmss-archive-data-version-v1"
	domainRulesVersion     = "domain-raw-v1"
	castRulesVersion       = "cast-exact-v1"
	schemaSQLDigest        = "sha256:3cce7ce75fb4a7d2943ee8b9fb7c5df2639fae8fa0a2e07bddb3e1519ffdc8e0"
	schemaObjectAlgorithm  = "bgmss-sqlite-schema-objects-v1"
	schemaObjectDigest     = "sha256:e0e7ad754cfd65ad7774479e495694b99b2fcae8a38f4c44686438bf8cddf9e0"
	schemaObjectCount      = 35
	sqliteFilename         = "bangumi.sqlite"
	maxJSONInteger         = int64(9007199254740991)
	maxJSONIntegerText     = "9007199254740991"
	maxPointerBytes        = 4096
	maxManifestBytes       = 1 << 20
	maxContractJSONNumbers = 71
)

var (
	dataVersionPattern = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	digestPattern      = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	tokenPattern       = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]*$`)
	commitPattern      = regexp.MustCompile(`^[0-9a-f]{40}$`)
	assetNamePattern   = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
)

var requiredSourceNames = []string{
	"subject.jsonlines",
	"person.jsonlines",
	"character.jsonlines",
	"subject-persons.jsonlines",
	"subject-characters.jsonlines",
	"person-characters.jsonlines",
	"subject-relations.jsonlines",
}

var requiredTableNames = []string{
	"archive_meta",
	"subject",
	"subject_rating_bucket",
	"subject_tag",
	"person",
	"person_career",
	"character",
	"subject_relation",
	"staff_position",
	"staff_position_category",
	"staff_credit",
	"cast_credit",
	"staff_set",
	"staff_set_member",
	"catalog_position",
	"catalog_position_member",
	"catalog_group",
	"catalog_group_member",
	"catalog_capability",
	"catalog_selection_rule",
}

var requiredIndexNames = []string{
	"idx_subject_filter_date_id",
	"idx_subject_relation_source",
	"idx_subject_tag_lookup",
	"idx_person_career_lookup",
	"idx_staff_position_category_lookup",
	"idx_staff_credit_lookup",
	"idx_cast_credit_role_lookup",
	"idx_cast_credit_character_lookup",
	"idx_staff_set_member_lookup",
	"idx_catalog_position_order",
	"idx_catalog_position_member_lookup",
	"idx_catalog_group_order",
	"idx_catalog_group_member_lookup",
	"idx_catalog_capability_lookup",
	"idx_catalog_selection_rule_lookup",
}

var requiredQualityNames = []string{
	"NO_CHARACTERS",
	"NO_CAST_RELATIONS",
	"FILTERED_BY_VALID_CV",
	"UNKNOWN_STAFF_POSITION",
}

type pointer struct {
	PointerSchemaVersion int64  `json:"pointerSchemaVersion"`
	DataVersion          string `json:"dataVersion"`
	ManifestDigest       string `json:"manifestDigest"`
}

type manifest struct {
	ManifestSchemaVersion  int64            `json:"manifestSchemaVersion"`
	SQLiteSchemaVersion    int64            `json:"sqliteSchemaVersion"`
	DataVersionAlgorithm   string           `json:"dataVersionAlgorithm"`
	DataVersion            string           `json:"dataVersion"`
	GeneratorVersion       string           `json:"generatorVersion"`
	GeneratedAt            string           `json:"generatedAt"`
	ArchiveRelease         string           `json:"archiveRelease"`
	ArchiveAssetURL        string           `json:"archiveAssetUrl"`
	ArchiveAssetName       string           `json:"archiveAssetName"`
	ArchiveSize            int64            `json:"archiveSize"`
	ArchiveDigest          string           `json:"archiveDigest"`
	CommonCommit           string           `json:"commonCommit"`
	CommonSubjectStaffsURL string           `json:"commonSubjectStaffsUrl"`
	CommonSize             int64            `json:"commonSize"`
	CommonDigest           string           `json:"commonDigest"`
	SchemaSQLDigest        string           `json:"schemaSqlDigest"`
	CatalogConfigDigest    string           `json:"catalogConfigDigest"`
	DomainRulesVersion     string           `json:"domainRulesVersion"`
	CastRulesVersion       string           `json:"castRulesVersion"`
	SourceFiles            []sourceFile     `json:"sourceFiles"`
	TableCounts            map[string]int64 `json:"tableCounts"`
	QualitySummary         map[string]int64 `json:"qualitySummary"`
	SQLiteFile             string           `json:"sqliteFile"`
	SQLiteSize             int64            `json:"sqliteSize"`
	SQLiteDigest           string           `json:"sqliteDigest"`
}

type sourceFile struct {
	Name         string `json:"name"`
	Size         int64  `json:"size"`
	Digest       string `json:"digest"`
	RecordsTotal int64  `json:"recordsTotal"`
	Imported     int64  `json:"imported"`
	Duplicate    int64  `json:"duplicate"`
	Invalid      int64  `json:"invalid"`
	Unresolved   int64  `json:"unresolved"`
}

var sourceFileFields = []string{
	"name",
	"size",
	"digest",
	"recordsTotal",
	"imported",
	"duplicate",
	"invalid",
	"unresolved",
}

func (s *sourceFile) UnmarshalJSON(data []byte) error {
	if !hasExactNonNullObjectFields(data, sourceFileFields) {
		return fmt.Errorf("invalid source file shape")
	}
	type plainSourceFile sourceFile
	var value plainSourceFile
	if err := decodeExactIntegerJSON(data, &value); err != nil {
		return err
	}
	*s = sourceFile(value)
	return nil
}

var pointerFields = []string{
	"pointerSchemaVersion",
	"dataVersion",
	"manifestDigest",
}

var manifestFields = []string{
	"manifestSchemaVersion",
	"sqliteSchemaVersion",
	"dataVersionAlgorithm",
	"dataVersion",
	"generatorVersion",
	"generatedAt",
	"archiveRelease",
	"archiveAssetUrl",
	"archiveAssetName",
	"archiveSize",
	"archiveDigest",
	"commonCommit",
	"commonSubjectStaffsUrl",
	"commonSize",
	"commonDigest",
	"schemaSqlDigest",
	"catalogConfigDigest",
	"domainRulesVersion",
	"castRulesVersion",
	"sourceFiles",
	"tableCounts",
	"qualitySummary",
	"sqliteFile",
	"sqliteSize",
	"sqliteDigest",
}

func decodePointer(data []byte) (pointer, error) {
	var value pointer
	if len(data) == 0 || len(data) > maxPointerBytes ||
		!utf8.Valid(data) ||
		!hasExactObjectFields(data, pointerFields) ||
		decodeExactIntegerJSON(data, &value) != nil ||
		value.PointerSchemaVersion < 1 || int64(value.PointerSchemaVersion) > maxJSONInteger ||
		!dataVersionPattern.MatchString(value.DataVersion) ||
		!digestPattern.MatchString(value.ManifestDigest) {
		return pointer{}, outcome(CodePointerSchemaInvalid)
	}
	return value, nil
}

func decodeManifest(data []byte) (manifest, error) {
	var value manifest
	if len(data) == 0 || len(data) > maxManifestBytes ||
		!utf8.Valid(data) ||
		!hasNoIsolatedJSONSurrogates(data) ||
		!hasExactNonNullObjectFields(data, manifestFields) ||
		!hasNoNullObjectValues(data, "tableCounts", "qualitySummary") ||
		decodeExactIntegerJSON(data, &value) != nil ||
		!validManifestShape(value) {
		return manifest{}, outcome(CodeManifestSchemaInvalid)
	}
	if !validSourceAccounting(value.SourceFiles) {
		return manifest{}, outcome(CodeManifestAccountingInvalid)
	}
	return value, nil
}

func validManifestShape(value manifest) bool {
	if !boundedPositive(value.ManifestSchemaVersion) ||
		!boundedPositive(value.SQLiteSchemaVersion) ||
		!validToken(value.DataVersionAlgorithm) ||
		!dataVersionPattern.MatchString(value.DataVersion) ||
		!validToken(value.GeneratorVersion) ||
		!validGeneratedAt(value.GeneratedAt) ||
		!validToken(value.ArchiveRelease) ||
		!validHTTPSURL(value.ArchiveAssetURL, "") ||
		len(value.ArchiveAssetName) > 255 ||
		!assetNamePattern.MatchString(value.ArchiveAssetName) ||
		!boundedNonNegative(value.ArchiveSize) ||
		!digestPattern.MatchString(value.ArchiveDigest) ||
		!commitPattern.MatchString(value.CommonCommit) ||
		!validHTTPSURL(value.CommonSubjectStaffsURL, "/subject_staffs.yml") ||
		!boundedNonNegative(value.CommonSize) ||
		!digestPattern.MatchString(value.CommonDigest) ||
		!digestPattern.MatchString(value.SchemaSQLDigest) ||
		!digestPattern.MatchString(value.CatalogConfigDigest) ||
		!validToken(value.DomainRulesVersion) ||
		!validToken(value.CastRulesVersion) ||
		value.SQLiteFile != sqliteFilename ||
		!boundedNonNegative(value.SQLiteSize) ||
		!digestPattern.MatchString(value.SQLiteDigest) {
		return false
	}
	if !validSources(value.SourceFiles) ||
		!validNamedCounts(value.TableCounts, requiredTableNames) ||
		!validNamedCounts(value.QualitySummary, requiredQualityNames) {
		return false
	}
	return true
}

func validSources(sources []sourceFile) bool {
	if len(sources) != len(requiredSourceNames) {
		return false
	}
	required := make(map[string]struct{}, len(requiredSourceNames))
	for _, name := range requiredSourceNames {
		required[name] = struct{}{}
	}
	seen := make(map[string]struct{}, len(sources))
	for _, source := range sources {
		if _, ok := required[source.Name]; !ok {
			return false
		}
		if _, duplicate := seen[source.Name]; duplicate {
			return false
		}
		seen[source.Name] = struct{}{}
		if !boundedNonNegative(source.Size) ||
			!digestPattern.MatchString(source.Digest) ||
			!boundedNonNegative(source.RecordsTotal) ||
			!boundedNonNegative(source.Imported) ||
			!boundedNonNegative(source.Duplicate) ||
			!boundedNonNegative(source.Invalid) ||
			!boundedNonNegative(source.Unresolved) {
			return false
		}
	}
	return true
}

func validSourceAccounting(sources []sourceFile) bool {
	for _, source := range sources {
		if source.RecordsTotal != source.Imported+source.Duplicate+source.Invalid+source.Unresolved {
			return false
		}
	}
	return true
}

func validNamedCounts(counts map[string]int64, names []string) bool {
	if len(counts) != len(names) {
		return false
	}
	for _, name := range names {
		count, ok := counts[name]
		if !ok || !boundedNonNegative(count) {
			return false
		}
	}
	return true
}

func validateCompatibility(manifestValue manifest) error {
	if manifestValue.ManifestSchemaVersion != manifestSchemaVersion ||
		manifestValue.SQLiteSchemaVersion != sqliteSchemaVersion ||
		manifestValue.DataVersionAlgorithm != dataVersionAlgorithm ||
		manifestValue.DomainRulesVersion != domainRulesVersion ||
		manifestValue.CastRulesVersion != castRulesVersion ||
		manifestValue.SchemaSQLDigest != schemaSQLDigest {
		return outcome(CodeArchiveVersionUnsupported)
	}
	return nil
}

func recomputeDataVersion(value manifest) string {
	preimage := dataVersionAlgorithm + "\n" +
		"archiveRelease=" + value.ArchiveRelease + "\n" +
		"archiveDigest=" + value.ArchiveDigest + "\n" +
		"commonCommit=" + value.CommonCommit + "\n" +
		"commonDigest=" + value.CommonDigest + "\n" +
		"manifestSchemaVersion=" + strconv.FormatInt(value.ManifestSchemaVersion, 10) + "\n" +
		"sqliteSchemaVersion=" + strconv.FormatInt(value.SQLiteSchemaVersion, 10) + "\n" +
		"schemaSqlDigest=" + value.SchemaSQLDigest + "\n" +
		"domainRulesVersion=" + value.DomainRulesVersion + "\n" +
		"castRulesVersion=" + value.CastRulesVersion + "\n" +
		"catalogConfigDigest=" + value.CatalogConfigDigest + "\n"
	sum := sha256.Sum256([]byte(preimage))
	return "dv1-" + hex.EncodeToString(sum[:])
}

func digestBytes(data []byte) string {
	sum := sha256.Sum256(data)
	return "sha256:" + hex.EncodeToString(sum[:])
}

func hasExactObjectFields(data []byte, fields []string) bool {
	var object map[string]json.RawMessage
	if decodeStrictJSON(data, &object) != nil || len(object) != len(fields) {
		return false
	}
	for _, field := range fields {
		if _, ok := object[field]; !ok {
			return false
		}
	}
	return true
}

func hasExactNonNullObjectFields(data []byte, fields []string) bool {
	var object map[string]json.RawMessage
	if decodeStrictJSON(data, &object) != nil || len(object) != len(fields) {
		return false
	}
	for _, field := range fields {
		value, ok := object[field]
		if !ok || bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return false
		}
	}
	return true
}

func hasNoNullObjectValues(data []byte, fields ...string) bool {
	var object map[string]json.RawMessage
	if decodeStrictJSON(data, &object) != nil {
		return false
	}
	for _, field := range fields {
		var values map[string]json.RawMessage
		if decodeStrictJSON(object[field], &values) != nil {
			return false
		}
		for _, value := range values {
			if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
				return false
			}
		}
	}
	return true
}

func decodeStrictJSON(data []byte, target any) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON value")
		}
		return err
	}
	return nil
}

func decodeExactIntegerJSON(data []byte, target any) error {
	canonical, err := canonicalizeJSONIntegers(data)
	if err != nil {
		return err
	}
	return decodeStrictJSON(canonical, target)
}

// canonicalizeJSONIntegers preserves JSON Schema's mathematical integer
// semantics before decoding into Go int64 fields. It scans each input byte a
// bounded number of times, skips complete strings and escapes, and never uses
// binary floating point or allocates from an exponent's numeric magnitude.
func canonicalizeJSONIntegers(data []byte) ([]byte, error) {
	canonical := make([]byte, 0, len(data))
	numberCount := 0
	const maxCanonicalGrowth = maxContractJSONNumbers * (len(maxJSONIntegerText) + 1)

	for index := 0; index < len(data); {
		switch {
		case data[index] == '"':
			start := index
			index++
			closed := false
			for index < len(data) {
				switch data[index] {
				case '\\':
					if index+1 >= len(data) {
						return nil, fmt.Errorf("invalid JSON string escape")
					}
					index += 2
				case '"':
					index++
					closed = true
				default:
					index++
				}
				if closed {
					break
				}
			}
			if !closed {
				return nil, fmt.Errorf("unterminated JSON string")
			}
			canonical = append(canonical, data[start:index]...)
		case data[index] == '-' || isASCIIDigit(data[index]):
			numberCount++
			if numberCount > maxContractJSONNumbers {
				return nil, fmt.Errorf("too many JSON numbers")
			}
			value, end, ok := canonicalJSONInteger(data, index)
			if !ok {
				return nil, fmt.Errorf("invalid JSON integer")
			}
			if len(canonical)+len(value)+len(data)-end > len(data)+maxCanonicalGrowth {
				return nil, fmt.Errorf("canonical JSON exceeds bound")
			}
			canonical = append(canonical, value...)
			index = end
		default:
			canonical = append(canonical, data[index])
			index++
		}
	}
	return canonical, nil
}

func canonicalJSONInteger(data []byte, start int) ([]byte, int, bool) {
	index := start
	negative := false
	if index < len(data) && data[index] == '-' {
		negative = true
		index++
	}
	if index >= len(data) {
		return nil, start, false
	}

	integerStart := index
	switch {
	case data[index] == '0':
		index++
		if index < len(data) && isASCIIDigit(data[index]) {
			return nil, start, false
		}
	case data[index] >= '1' && data[index] <= '9':
		for index < len(data) && isASCIIDigit(data[index]) {
			index++
		}
	default:
		return nil, start, false
	}
	integerEnd := index

	fractionStart := index
	fractionEnd := index
	if index < len(data) && data[index] == '.' {
		index++
		fractionStart = index
		for index < len(data) && isASCIIDigit(data[index]) {
			index++
		}
		fractionEnd = index
		if fractionStart == fractionEnd {
			return nil, start, false
		}
	}

	exponentNegative := false
	exponentStart := index
	exponentEnd := index
	if index < len(data) && (data[index] == 'e' || data[index] == 'E') {
		index++
		if index < len(data) && (data[index] == '+' || data[index] == '-') {
			exponentNegative = data[index] == '-'
			index++
		}
		exponentStart = index
		for index < len(data) && isASCIIDigit(data[index]) {
			index++
		}
		exponentEnd = index
		if exponentStart == exponentEnd {
			return nil, start, false
		}
	}
	end := index

	integerDigits := integerEnd - integerStart
	fractionDigits := fractionEnd - fractionStart
	totalDigits := integerDigits + fractionDigits
	digitAt := func(position int) byte {
		if position < integerDigits {
			return data[integerStart+position]
		}
		return data[fractionStart+position-integerDigits]
	}

	firstNonZero := totalDigits
	for position := 0; position < totalDigits; position++ {
		if digitAt(position) != '0' {
			firstNonZero = position
			break
		}
	}
	if firstNonZero == totalDigits {
		return []byte{'0'}, end, true
	}

	exponent := 0
	if exponentStart != exponentEnd {
		limit := end - start + len(maxJSONIntegerText)
		for _, digit := range data[exponentStart:exponentEnd] {
			value := int(digit - '0')
			if exponent > limit/10 ||
				(exponent == limit/10 && value > limit%10) {
				return nil, start, false
			}
			exponent = exponent*10 + value
		}
		if exponentNegative {
			exponent = -exponent
		}
	}

	scale := exponent - fractionDigits
	integerDigitEnd := totalDigits
	appendZeros := 0
	if scale < 0 {
		removeDigits := -scale
		if removeDigits > totalDigits {
			return nil, start, false
		}
		for position := totalDigits - removeDigits; position < totalDigits; position++ {
			if digitAt(position) != '0' {
				return nil, start, false
			}
		}
		integerDigitEnd -= removeDigits
	} else {
		appendZeros = scale
	}

	firstIntegerDigit := 0
	for firstIntegerDigit < integerDigitEnd && digitAt(firstIntegerDigit) == '0' {
		firstIntegerDigit++
	}
	canonicalDigits := integerDigitEnd - firstIntegerDigit + appendZeros
	if canonicalDigits <= 0 || canonicalDigits > len(maxJSONIntegerText) {
		return nil, start, false
	}

	result := make([]byte, 0, canonicalDigits+1)
	if negative {
		result = append(result, '-')
	}
	for position := firstIntegerDigit; position < integerDigitEnd; position++ {
		result = append(result, digitAt(position))
	}
	for range appendZeros {
		result = append(result, '0')
	}

	absolute := result
	if negative {
		absolute = result[1:]
	}
	if len(absolute) == len(maxJSONIntegerText) &&
		bytes.Compare(absolute, []byte(maxJSONIntegerText)) > 0 {
		return nil, start, false
	}
	return result, end, true
}

func isASCIIDigit(value byte) bool {
	return value >= '0' && value <= '9'
}

func validToken(value string) bool {
	return len(value) >= 1 && len(value) <= 128 && tokenPattern.MatchString(value)
}

func validGeneratedAt(value string) bool {
	raw := []byte(value)
	if len(raw) != 20 && (len(raw) < 22 || len(raw) > 27) {
		return false
	}
	if raw[4] != '-' || raw[7] != '-' || raw[10] != 'T' ||
		raw[13] != ':' || raw[16] != ':' {
		return false
	}
	if len(raw) == 20 {
		if raw[19] != 'Z' {
			return false
		}
	} else {
		if raw[19] != '.' || raw[len(raw)-1] != 'Z' ||
			!allASCIIDigits(raw[20:len(raw)-1]) {
			return false
		}
	}

	year, yearOK := parseASCIIDecimal(raw[0:4])
	month, monthOK := parseASCIIDecimal(raw[5:7])
	day, dayOK := parseASCIIDecimal(raw[8:10])
	hour, hourOK := parseASCIIDecimal(raw[11:13])
	minute, minuteOK := parseASCIIDecimal(raw[14:16])
	second, secondOK := parseASCIIDecimal(raw[17:19])
	if !yearOK || !monthOK || !dayOK || !hourOK || !minuteOK || !secondOK ||
		year < 1 || year > 9999 || month < 1 || month > 12 ||
		hour > 23 || minute > 59 || second > 59 {
		return false
	}

	daysInMonth := [...]int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
	if year%4 == 0 && (year%100 != 0 || year%400 == 0) {
		daysInMonth[1] = 29
	}
	return day >= 1 && day <= daysInMonth[month-1]
}

func validHTTPSURL(value, requiredSuffix string) bool {
	if !utf8.ValidString(value) {
		return false
	}
	scalarCount := utf8.RuneCountInString(value)
	if scalarCount < 12 || scalarCount > 2048 || strings.ContainsAny(value, "\x00\r\n") {
		return false
	}
	if !strings.HasPrefix(value, "https://") {
		return false
	}
	return requiredSuffix == "" || strings.HasSuffix(value, requiredSuffix)
}

func boundedPositive(value int64) bool {
	return value >= 1 && value <= maxJSONInteger
}

func boundedNonNegative(value int64) bool {
	return value >= 0 && value <= maxJSONInteger
}

func allASCIIDigits(value []byte) bool {
	for _, digit := range value {
		if digit < '0' || digit > '9' {
			return false
		}
	}
	return true
}

func parseASCIIDecimal(value []byte) (int, bool) {
	if len(value) == 0 || !allASCIIDigits(value) {
		return 0, false
	}
	result := 0
	for _, digit := range value {
		result = result*10 + int(digit-'0')
	}
	return result, true
}

// hasNoIsolatedJSONSurrogates scans the raw document before encoding/json can
// replace an isolated surrogate escape with U+FFFD. Other malformed JSON is
// left for the strict decoder so every failure remains MANIFEST_SCHEMA_INVALID.
func hasNoIsolatedJSONSurrogates(data []byte) bool {
	inString := false
	for index := 0; index < len(data); {
		switch data[index] {
		case '"':
			inString = !inString
			index++
		case '\\':
			if !inString || index+1 >= len(data) {
				index++
				continue
			}
			if data[index+1] != 'u' {
				index += 2
				continue
			}
			first, ok := parseJSONHex4(data, index+2)
			if !ok {
				index += 2
				continue
			}
			if first >= 0xD800 && first <= 0xDBFF {
				secondIndex := index + 6
				if secondIndex+6 > len(data) ||
					data[secondIndex] != '\\' ||
					data[secondIndex+1] != 'u' {
					return false
				}
				second, ok := parseJSONHex4(data, secondIndex+2)
				if !ok || second < 0xDC00 || second > 0xDFFF {
					return false
				}
				index += 12
				continue
			}
			if first >= 0xDC00 && first <= 0xDFFF {
				return false
			}
			index += 6
		default:
			index++
		}
	}
	return true
}

func parseJSONHex4(data []byte, start int) (uint16, bool) {
	if start < 0 || start+4 > len(data) {
		return 0, false
	}
	var result uint16
	for _, digit := range data[start : start+4] {
		result <<= 4
		switch {
		case digit >= '0' && digit <= '9':
			result += uint16(digit - '0')
		case digit >= 'a' && digit <= 'f':
			result += uint16(digit-'a') + 10
		case digit >= 'A' && digit <= 'F':
			result += uint16(digit-'A') + 10
		default:
			return 0, false
		}
	}
	return result, true
}

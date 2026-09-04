package archivebuild

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"os"
	"sort"
	"strings"
	"unicode/utf8"
)

const maxSourceLineBytes = 8 * 1024 * 1024

var careers = map[string]struct{}{"producer": {}, "mangaka": {}, "artist": {}, "seiyu": {}, "writer": {}, "illustrator": {}, "actor": {}}

var recordFields = map[string]map[string]struct{}{
	"subject.jsonlines":            keys("id", "type", "name", "name_cn", "infobox", "platform", "summary", "nsfw", "tags", "meta_tags", "score", "score_details", "rank", "date", "favorite", "series"),
	"person.jsonlines":             keys("id", "name", "name_cn", "type", "career", "infobox", "summary", "comments", "collects"),
	"character.jsonlines":          keys("id", "role", "name", "name_cn", "infobox", "summary", "comments", "collects"),
	"subject-persons.jsonlines":    keys("subject_id", "person_id", "position", "appear_eps"),
	"subject-characters.jsonlines": keys("subject_id", "character_id", "type", "order"),
	"person-characters.jsonlines":  keys("subject_id", "character_id", "person_id", "type", "summary"),
	"subject-relations.jsonlines":  keys("subject_id", "related_subject_id", "relation_type", "order"),
}

var requiredFields = map[string][]string{
	"subject.jsonlines":            {"id", "type", "name", "name_cn", "nsfw", "date"},
	"person.jsonlines":             {"id", "name", "career"},
	"character.jsonlines":          {"id", "name"},
	"subject-persons.jsonlines":    {"subject_id", "person_id", "position"},
	"subject-characters.jsonlines": {"subject_id", "character_id", "type", "order"},
	"person-characters.jsonlines":  {"subject_id", "character_id", "person_id"},
	"subject-relations.jsonlines":  {"subject_id", "related_subject_id", "relation_type"},
}

func keys(values ...string) map[string]struct{} {
	result := make(map[string]struct{}, len(values))
	for _, value := range values {
		result[value] = struct{}{}
	}
	return result
}

type sourceProcessor struct {
	ctx              context.Context
	tx               *sql.Tx
	commonIdentities map[string]struct{}
	governed         bool
}

func (p *sourceProcessor) process(sources []SourceInput) ([]SourceAccounting, int64, error) {
	accounting := make([]SourceAccounting, len(sources))
	var firstFatal error
	for sourceIndex, source := range sources {
		entry := &accounting[sourceIndex]
		entry.Name, entry.Size, entry.Digest = source.Name, source.Size, source.Digest
		err := readLines(p.ctx, source.Path, func(line int, data []byte, terminated bool) error {
			entry.RecordsTotal++
			if !terminated || len(data) == 0 {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure("SOURCE_RECORD_MALFORMED", source.Name, line, nil)
				}
				return nil
			}
			record, err := decodeStrictObject(data)
			if err != nil {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure("SOURCE_RECORD_MALFORMED", source.Name, line, err)
				}
				return nil
			}
			if err := validateRecordShape(source.Name, record, p.governed); err != nil {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure(ErrorCode(err), source.Name, line, err)
				}
				return nil
			}
			identity, err := recordIdentity(source.Name, record)
			if err != nil {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure(ErrorCode(err), source.Name, line, err)
				}
				return nil
			}
			digest, err := canonicalRecordDigest(data)
			if err != nil {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure("SOURCE_RECORD_MALFORMED", source.Name, line, err)
				}
				return nil
			}
			var seen string
			queryErr := p.tx.QueryRowContext(p.ctx, "SELECT digest FROM temp.seen_record WHERE source = ? AND identity = ?", source.Name, identity).Scan(&seen)
			if queryErr == nil {
				if seen == digest {
					entry.Duplicate++
				} else {
					entry.Invalid++
					if firstFatal == nil {
						firstFatal = sourceFailure("SOURCE_DUPLICATE_CONFLICT", source.Name, line, nil)
					}
				}
				return nil
			}
			if !errors.Is(queryErr, sql.ErrNoRows) {
				return failure("SQLITE_BUILD_FAILED", queryErr)
			}
			if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO temp.seen_record VALUES (?, ?, ?)", source.Name, identity, digest); err != nil {
				return failure("SQLITE_BUILD_FAILED", err)
			}
			classification, applyErr := p.apply(source.Name, record)
			if applyErr != nil {
				entry.Invalid++
				if firstFatal == nil {
					firstFatal = sourceFailure(ErrorCode(applyErr), source.Name, line, applyErr)
				}
				return nil
			}
			switch classification {
			case "imported":
				entry.Imported++
			case "invalid":
				entry.Invalid++
			case "unresolved":
				entry.Unresolved++
			default:
				return failure("SQLITE_BUILD_FAILED", fmt.Errorf("classification"))
			}
			return nil
		})
		if err != nil {
			return nil, 0, err
		}
	}
	if firstFatal != nil {
		return accounting, 0, firstFatal
	}
	var unresolved int64
	for _, entry := range accounting {
		unresolved += entry.Unresolved
	}
	return accounting, unresolved, nil
}

func readLines(ctx context.Context, location string, consume func(int, []byte, bool) error) error {
	file, err := os.Open(location)
	if err != nil {
		return failure("SOURCE_FILE_INVALID", err)
	}
	defer file.Close()
	reader := bufio.NewReaderSize(file, 1024*1024)
	lineNumber := 0
	for {
		if err := contextError(ctx); err != nil {
			return err
		}
		lineNumber++
		line := make([]byte, 0, 1024)
		tooLong := false
		terminated := false
		for {
			fragment, readErr := reader.ReadSlice('\n')
			if len(line)+len(fragment) > maxSourceLineBytes {
				tooLong = true
			} else if !tooLong {
				line = append(line, fragment...)
			}
			if readErr == nil {
				terminated = true
				break
			}
			if errors.Is(readErr, bufio.ErrBufferFull) {
				continue
			}
			if errors.Is(readErr, io.EOF) {
				if len(fragment) == 0 && len(line) == 0 {
					return nil
				}
				break
			}
			return failure("SOURCE_FILE_INVALID", readErr)
		}
		if tooLong {
			line = nil
		}
		if terminated && len(line) > 0 {
			line = line[:len(line)-1]
		}
		if err := consume(lineNumber, line, terminated); err != nil {
			return err
		}
	}
}

func canonicalRecordDigest(data []byte) (string, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil || requireJSONEOF(decoder) != nil {
		return "", err
	}
	canonical, err := json.Marshal(value)
	if err != nil {
		return "", err
	}
	sum := sha256.Sum256(canonical)
	return "sha256:" + hex.EncodeToString(sum[:]), nil
}

func validateRecordShape(source string, record map[string]json.RawMessage, governed bool) error {
	allowed, ok := recordFields[source]
	if !ok || !hasOnlyKeys(record, allowed) {
		return failure("SOURCE_RECORD_UNKNOWN_FIELD", nil)
	}
	if !hasRequiredKeys(record, requiredFields[source]...) {
		return failure("SOURCE_RECORD_MALFORMED", nil)
	}
	positive := func(key string) (int64, error) { return rawInt(record[key], 1, maxJSONSafeInteger) }
	switch source {
	case "subject.jsonlines":
		if _, err := positive("id"); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		code, err := positive("type")
		if err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err = subjectTypeFromCode(code); err != nil {
			return err
		}
		if _, err = validatedText(record["name"], 4096, false, false); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err = validatedText(record["name_cn"], 4096, true, false); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err = rawBool(record["nsfw"]); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		date, err := rawNullableString(record["date"])
		if err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, _, err = partialDate(date); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if err = validateSubjectOptional(record); err != nil {
			return err
		}
	case "person.jsonlines":
		if _, err := positive("id"); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err := validatedText(record["name"], 4096, false, false); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if err := validateCareers(record["career"]); err != nil {
			return err
		}
		if err := validateEntityOptional(record); err != nil {
			return err
		}
	case "character.jsonlines":
		if _, err := positive("id"); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err := validatedText(record["name"], 4096, false, false); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if err := validateEntityOptional(record); err != nil {
			return err
		}
	case "subject-characters.jsonlines":
		if _, err := positive("subject_id"); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		if _, err := positive("character_id"); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		role, err := rawInt(record["type"], 1, 6)
		if err != nil {
			if governed {
				return failure("UNKNOWN_CAST_ROLE", err)
			}
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		_ = role
		if _, err = rawInt(record["order"], 0, maxJSONSafeInteger); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
	default:
		for _, key := range requiredFields[source] {
			if _, err := positive(key); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
		if source == "subject-relations.jsonlines" {
			if _, err := rawInt(record["relation_type"], 1, maxJSONSafeInteger); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	return nil
}

func validateSubjectOptional(record map[string]json.RawMessage) error {
	for _, key := range []string{"infobox", "summary"} {
		if raw, ok := record[key]; ok {
			if _, err := validatedText(raw, maxSourceLineBytes, true, true); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	for _, key := range []string{"platform", "rank"} {
		if raw, ok := record[key]; ok {
			if _, err := rawInt(raw, 0, math.MaxUint32); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	if raw, ok := record["series"]; ok {
		if _, err := rawBool(raw); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
	}
	if raw, ok := record["score"]; ok && !bytes.Equal(raw, []byte("null")) {
		if _, err := rawFloat(raw, 0, 10); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
	}
	if raw, ok := record["score_details"]; ok {
		object, err := decodeStrictObject(raw)
		if err != nil || len(object) != 10 {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		for i := 1; i <= 10; i++ {
			if count, ok := object[strconvItoa(i)]; !ok {
				return failure("SOURCE_RECORD_MALFORMED", nil)
			} else if _, err := rawInt(count, 0, math.MaxUint32); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	if raw, ok := record["favorite"]; ok {
		object, err := decodeStrictObject(raw)
		if err != nil || len(object) != 5 {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		for _, key := range []string{"wish", "done", "doing", "on_hold", "dropped"} {
			if count, ok := object[key]; !ok {
				return failure("SOURCE_RECORD_MALFORMED", nil)
			} else if _, err := rawInt(count, 0, math.MaxUint32); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	if raw, ok := record["tags"]; ok {
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil || len(values) > 11 {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		for _, item := range values {
			object, err := decodeStrictObject(item)
			if err != nil || len(object) != 2 || !hasRequiredKeys(object, "name", "count") {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
			if _, err = validatedText(object["name"], 255, false, false); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
			if _, err = rawInt(object["count"], 0, maxJSONSafeInteger); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	if raw, ok := record["meta_tags"]; ok {
		var values []json.RawMessage
		if err := json.Unmarshal(raw, &values); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
		for _, item := range values {
			if _, err := validatedText(item, 255, false, false); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	return nil
}

func validateEntityOptional(record map[string]json.RawMessage) error {
	if raw, ok := record["name_cn"]; ok {
		if _, err := validatedText(raw, 4096, true, false); err != nil {
			return failure("SOURCE_RECORD_MALFORMED", err)
		}
	}
	for _, key := range []string{"infobox", "summary"} {
		if raw, ok := record[key]; ok {
			if _, err := validatedText(raw, maxSourceLineBytes, true, true); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	for _, key := range []string{"type", "role", "comments", "collects"} {
		if raw, ok := record[key]; ok {
			if _, err := rawInt(raw, 0, math.MaxUint32); err != nil {
				return failure("SOURCE_RECORD_MALFORMED", err)
			}
		}
	}
	return nil
}

func validateCareers(raw json.RawMessage) error {
	var values []string
	if err := json.Unmarshal(raw, &values); err != nil || len(values) > 16 {
		return failure("SOURCE_RECORD_MALFORMED", err)
	}
	for _, value := range values {
		if _, ok := careers[value]; !ok {
			return failure("SOURCE_RECORD_MALFORMED", nil)
		}
	}
	return nil
}

func validatedText(raw json.RawMessage, maximum int, nullable, multiline bool) (string, error) {
	if nullable && (bytes.Equal(raw, []byte("null")) || bytes.Equal(raw, []byte(`""`))) {
		return "", nil
	}
	value, err := rawString(raw, false)
	if err != nil || (!nullable && value == "") || utf8.RuneCountInString(value) > maximum || strings.ContainsRune(value, 0) || (!multiline && strings.ContainsAny(value, "\r\n")) {
		return "", fmt.Errorf("text")
	}
	return value, nil
}

func rawNullableString(raw json.RawMessage) (string, error) {
	if bytes.Equal(raw, []byte("null")) {
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	return value, nil
}

func partialDate(value string) (any, any, error) {
	if value == "" {
		return nil, nil, nil
	}
	parts := strings.Split(value, "-")
	if len(parts) < 1 || len(parts) > 3 || len(parts[0]) != 4 {
		return nil, nil, fmt.Errorf("date")
	}
	year, err := parseDecimal(parts[0])
	if err != nil || year < 1 || year > 9999 {
		return nil, nil, fmt.Errorf("date")
	}
	if len(parts) >= 2 {
		if len(parts[1]) != 2 {
			return nil, nil, fmt.Errorf("date")
		}
		month, err := parseDecimal(parts[1])
		if err != nil || month < 1 || month > 12 {
			return nil, nil, fmt.Errorf("date")
		}
		if len(parts) == 3 {
			if len(parts[2]) != 2 {
				return nil, nil, fmt.Errorf("date")
			}
			day, err := parseDecimal(parts[2])
			if err != nil {
				return nil, nil, fmt.Errorf("date")
			}
			days := []int{31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31}
			if year%400 == 0 || (year%4 == 0 && year%100 != 0) {
				days[1] = 29
			}
			if day < 1 || day > days[month-1] {
				return nil, nil, fmt.Errorf("date")
			}
		}
	}
	return value, len(parts), nil
}

func parseDecimal(value string) (int, error) {
	result := 0
	for _, r := range value {
		if r < '0' || r > '9' {
			return 0, fmt.Errorf("decimal")
		}
		result = result*10 + int(r-'0')
	}
	return result, nil
}
func strconvItoa(value int) string { return fmt.Sprintf("%d", value) }

func recordIdentity(source string, record map[string]json.RawMessage) (string, error) {
	get := func(key string) (int64, error) { return rawInt(record[key], 1, maxJSONSafeInteger) }
	if source == "subject.jsonlines" || source == "person.jsonlines" || source == "character.jsonlines" {
		id, err := get("id")
		return fmt.Sprint(id), err
	}
	subject, err := get("subject_id")
	if err != nil {
		return "", err
	}
	switch source {
	case "subject-persons.jsonlines":
		person, e := get("person_id")
		if e != nil {
			return "", e
		}
		position, e := get("position")
		return fmt.Sprintf("%d:%d:%d", subject, person, position), e
	case "subject-characters.jsonlines":
		character, e := get("character_id")
		return fmt.Sprintf("%d:%d", subject, character), e
	case "person-characters.jsonlines":
		character, e := get("character_id")
		if e != nil {
			return "", e
		}
		person, e := get("person_id")
		return fmt.Sprintf("%d:%d:%d", subject, character, person), e
	default:
		related, e := get("related_subject_id")
		if e != nil {
			return "", e
		}
		relation, e := get("relation_type")
		return fmt.Sprintf("%d:%d:%d", subject, related, relation), e
	}
}

func (p *sourceProcessor) apply(source string, record map[string]json.RawMessage) (string, error) {
	switch source {
	case "subject.jsonlines":
		return "imported", p.insertSubject(record)
	case "person.jsonlines":
		return "imported", p.insertPerson(record)
	case "character.jsonlines":
		return "imported", p.insertCharacter(record)
	}
	subjectID, _ := rawInt(record["subject_id"], 1, maxJSONSafeInteger)
	var subjectType string
	if err := p.tx.QueryRowContext(p.ctx, "SELECT subject_type FROM temp.entity_subject WHERE subject_id = ?", subjectID).Scan(&subjectType); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return "invalid", nil
		}
		return "", failure("SQLITE_BUILD_FAILED", err)
	}
	switch source {
	case "subject-persons.jsonlines":
		personID, _ := rawInt(record["person_id"], 1, maxJSONSafeInteger)
		if !p.exists("person", "person_id", personID) {
			return "invalid", nil
		}
		positionID, _ := rawInt(record["position"], 1, maxJSONSafeInteger)
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO staff_credit VALUES (?, ?, ?, ?)", subjectType, subjectID, personID, positionID); err != nil {
			return "", failure("SOURCE_DUPLICATE_CONFLICT", err)
		}
		if _, err := p.tx.ExecContext(p.ctx, "INSERT OR IGNORE INTO temp.eligible_staff_person VALUES (?)", personID); err != nil {
			return "", failure("SQLITE_BUILD_FAILED", err)
		}
		if _, ok := p.commonIdentities[subjectType+":"+fmt.Sprint(positionID)]; ok {
			return "imported", nil
		}
		return "unresolved", nil
	case "subject-characters.jsonlines":
		characterID, _ := rawInt(record["character_id"], 1, maxJSONSafeInteger)
		if !p.exists("character", "character_id", characterID) {
			return "invalid", nil
		}
		role, _ := rawInt(record["type"], 1, 6)
		order, _ := rawInt(record["order"], 0, maxJSONSafeInteger)
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO temp.source_subject_character VALUES (?, ?, ?, ?)", subjectID, characterID, role, order); err != nil {
			return "", failure("SOURCE_DUPLICATE_CONFLICT", err)
		}
		return "imported", nil
	case "person-characters.jsonlines":
		characterID, _ := rawInt(record["character_id"], 1, maxJSONSafeInteger)
		personID, _ := rawInt(record["person_id"], 1, maxJSONSafeInteger)
		if !p.exists("person", "person_id", personID) || !p.exists("character", "character_id", characterID) {
			return "invalid", nil
		}
		var role, order int64
		if err := p.tx.QueryRowContext(p.ctx, "SELECT role_type, sort_order FROM temp.source_subject_character WHERE subject_id = ? AND character_id = ?", subjectID, characterID).Scan(&role, &order); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "invalid", nil
			}
			return "", failure("SQLITE_BUILD_FAILED", err)
		}
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO temp.exact_cast_edge VALUES (?, ?, ?, ?, ?, ?)", subjectType, subjectID, personID, characterID, role, order); err != nil {
			return "", failure("SOURCE_DUPLICATE_CONFLICT", err)
		}
		var eligible int
		if err := p.tx.QueryRowContext(p.ctx, "SELECT 1 FROM temp.eligible_staff_person WHERE person_id = ?", personID).Scan(&eligible); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "imported", nil
			}
			return "", failure("SQLITE_BUILD_FAILED", err)
		}
		if p.governed && subjectType != "anime" && subjectType != "game" {
			return "imported", nil
		}
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO cast_credit VALUES (?, ?, ?, ?, ?, ?, 1, 'exact')", subjectType, subjectID, personID, characterID, role, order); err != nil {
			return "", failure("SOURCE_DUPLICATE_CONFLICT", err)
		}
		return "imported", nil
	default:
		relatedID, _ := rawInt(record["related_subject_id"], 1, maxJSONSafeInteger)
		var relatedType string
		if err := p.tx.QueryRowContext(p.ctx, "SELECT subject_type FROM temp.entity_subject WHERE subject_id = ?", relatedID).Scan(&relatedType); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "invalid", nil
			}
			return "", failure("SQLITE_BUILD_FAILED", err)
		}
		relation, _ := rawInt(record["relation_type"], 1, maxJSONSafeInteger)
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO subject_relation VALUES (?, ?, ?, ?, ?)", subjectType, subjectID, relatedType, relatedID, relation); err != nil {
			return "", failure("SOURCE_DUPLICATE_CONFLICT", err)
		}
		return "imported", nil
	}
}

func (p *sourceProcessor) exists(table, column string, id int64) bool {
	var value int
	err := p.tx.QueryRowContext(p.ctx, "SELECT 1 FROM "+table+" WHERE "+column+" = ?", id).Scan(&value)
	return err == nil
}

func (p *sourceProcessor) insertSubject(record map[string]json.RawMessage) error {
	id, _ := rawInt(record["id"], 1, maxJSONSafeInteger)
	code, _ := rawInt(record["type"], 1, maxJSONSafeInteger)
	subjectType, _ := subjectTypeFromCode(code)
	name, _ := validatedText(record["name"], 4096, false, false)
	nameCN, _ := validatedText(record["name_cn"], 4096, true, false)
	nsfw, _ := rawBool(record["nsfw"])
	date, _ := rawNullableString(record["date"])
	airDate, precision, _ := partialDate(date)
	var score any
	if raw, ok := record["score"]; ok && !bytes.Equal(raw, []byte("null")) {
		value, _ := rawFloat(raw, 0, 10)
		score = value
	}
	var votes int64
	if raw, ok := record["score_details"]; ok {
		details, _ := decodeStrictObject(raw)
		for rating := 1; rating <= 10; rating++ {
			count, _ := rawInt(details[strconvItoa(rating)], 0, math.MaxUint32)
			votes += count
		}
	}
	if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO subject VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", subjectType, id, name, nullableString(nameCN), boolInt(nsfw), airDate, precision, score, votes); err != nil {
		return failure("SOURCE_DUPLICATE_CONFLICT", err)
	}
	if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO temp.entity_subject VALUES (?, ?)", id, subjectType); err != nil {
		return failure("SOURCE_DUPLICATE_CONFLICT", err)
	}
	if raw, ok := record["score_details"]; ok {
		details, _ := decodeStrictObject(raw)
		for rating := 1; rating <= 10; rating++ {
			count, _ := rawInt(details[strconvItoa(rating)], 0, math.MaxUint32)
			if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO subject_rating_bucket VALUES (?, ?, ?, ?)", subjectType, id, rating, count); err != nil {
				return failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	if raw, ok := record["tags"]; ok {
		var values []json.RawMessage
		_ = json.Unmarshal(raw, &values)
		for _, item := range values {
			object, _ := decodeStrictObject(item)
			name, _ := validatedText(object["name"], 255, false, false)
			if _, err := p.tx.ExecContext(p.ctx, "INSERT OR IGNORE INTO subject_tag VALUES (?, ?, 'public', ?)", subjectType, id, name); err != nil {
				return failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	if raw, ok := record["meta_tags"]; ok {
		var values []string
		_ = json.Unmarshal(raw, &values)
		for _, name := range values {
			if _, err := p.tx.ExecContext(p.ctx, "INSERT OR IGNORE INTO subject_tag VALUES (?, ?, 'meta', ?)", subjectType, id, name); err != nil {
				return failure("SQLITE_BUILD_FAILED", err)
			}
		}
	}
	return nil
}

func (p *sourceProcessor) insertPerson(record map[string]json.RawMessage) error {
	id, _ := rawInt(record["id"], 1, maxJSONSafeInteger)
	name, _ := validatedText(record["name"], 4096, false, false)
	nameCN := entityNameCN(record)
	if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO person VALUES (?, ?, ?, NULL)", id, name, nullableString(nameCN)); err != nil {
		return failure("SOURCE_DUPLICATE_CONFLICT", err)
	}
	var values []string
	_ = json.Unmarshal(record["career"], &values)
	sort.Strings(values)
	previous := ""
	for _, career := range values {
		if career == previous {
			continue
		}
		if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO person_career VALUES (?, ?)", id, career); err != nil {
			return failure("SQLITE_BUILD_FAILED", err)
		}
		previous = career
	}
	return nil
}
func (p *sourceProcessor) insertCharacter(record map[string]json.RawMessage) error {
	id, _ := rawInt(record["id"], 1, maxJSONSafeInteger)
	name, _ := validatedText(record["name"], 4096, false, false)
	nameCN := entityNameCN(record)
	if _, err := p.tx.ExecContext(p.ctx, "INSERT INTO character VALUES (?, ?, ?)", id, name, nullableString(nameCN)); err != nil {
		return failure("SOURCE_DUPLICATE_CONFLICT", err)
	}
	return nil
}

func splitInfoboxLines(value string) []string {
	lines := make([]string, 0, strings.Count(value, "\n")+1)
	start := 0
	for index := 0; index < len(value); {
		lineBreak, size := utf8.DecodeRuneInString(value[index:])
		if !isInfoboxLineBreak(lineBreak) {
			index += size
			continue
		}
		lines = append(lines, value[start:index])
		index += size
		if lineBreak == '\r' && index < len(value) && value[index] == '\n' {
			index++
		}
		start = index
	}
	if start < len(value) {
		lines = append(lines, value[start:])
	}
	return lines
}

func isInfoboxLineBreak(value rune) bool {
	switch value {
	case '\n', '\r', '\v', '\f', '\u001c', '\u001d', '\u001e', '\u0085', '\u2028', '\u2029':
		return true
	default:
		return false
	}
}

func infoboxFieldValues(infobox, target string) []string {
	values := make([]string, 0, 1)
	active := false
	activeKey := ""
	activeLines := []string(nil)
	blockDepth := 0
	finishField := func() {
		if active && activeKey == target {
			values = append(values, strings.Join(activeLines, "\n"))
		}
	}
	closed := false
	for _, rawLine := range splitInfoboxLines(infobox) {
		line := strings.TrimSpace(rawLine)
		if blockDepth == 0 && line == "}}" {
			finishField()
			active = false
			activeKey = ""
			activeLines = nil
			closed = true
			break
		}
		if blockDepth == 0 && strings.HasPrefix(line, "|") {
			finishField()
			assignment := line[1:]
			equals := strings.IndexByte(assignment, '=')
			if equals < 0 {
				active = false
				activeKey = ""
				activeLines = nil
				continue
			}
			active = true
			activeKey = strings.TrimSpace(assignment[:equals])
			initial := strings.TrimSpace(assignment[equals+1:])
			activeLines = []string{initial}
			blockDepth = max(0, strings.Count(initial, "{")-strings.Count(initial, "}"))
			continue
		}
		if active {
			activeLines = append(activeLines, line)
			blockDepth = max(0, blockDepth+strings.Count(line, "{")-strings.Count(line, "}"))
		}
	}
	if !closed {
		finishField()
	}
	return values
}

func parseInfoboxName(value string) (string, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return "", false
	}
	if !strings.HasPrefix(text, "{") {
		if strings.ContainsRune(text, '\n') || strings.HasPrefix(text, "|") {
			return "", false
		}
		return text, true
	}
	if !strings.HasSuffix(text, "}") {
		return "", false
	}

	candidate := ""
	found := false
	for _, rawEntry := range splitInfoboxLines(text[1 : len(text)-1]) {
		entry := strings.TrimSpace(rawEntry)
		if entry == "" {
			continue
		}
		if !strings.HasPrefix(entry, "[") || !strings.HasSuffix(entry, "]") {
			return "", false
		}
		content := strings.TrimSpace(entry[1 : len(entry)-1])
		if _, suffix, ok := strings.Cut(content, "|"); ok {
			content = strings.TrimSpace(suffix)
		}
		if content == "" {
			continue
		}
		if found && content != candidate {
			return "", false
		}
		candidate = content
		found = true
	}
	return candidate, found
}

func entityNameCN(record map[string]json.RawMessage) string {
	if raw, ok := record["name_cn"]; ok && !bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		value, _ := validatedText(raw, 4096, true, false)
		return value
	}
	raw, ok := record["infobox"]
	if !ok {
		return ""
	}
	var infobox string
	if json.Unmarshal(raw, &infobox) != nil {
		return ""
	}
	values := infoboxFieldValues(infobox, "简体中文名")
	if len(values) == 0 {
		return ""
	}
	name := ""
	for index, rawValue := range values {
		value, valid := parseInfoboxName(rawValue)
		if !valid || (index > 0 && value != name) {
			return ""
		}
		name = value
	}
	if utf8.RuneCountInString(name) > 4096 || strings.ContainsRune(name, 0) || strings.ContainsAny(name, "\r\n") {
		return ""
	}
	return name
}

package archivebuild

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"sort"
	"strings"
)

type orderedField struct {
	Name  string
	Value any
}
type orderedObject []orderedField

func (o orderedObject) MarshalJSON() ([]byte, error) {
	var output bytes.Buffer
	output.WriteByte('{')
	for index, field := range o {
		if index > 0 {
			output.WriteByte(',')
		}
		name, _ := json.Marshal(field.Name)
		output.Write(name)
		output.WriteByte(':')
		value, err := marshalCompact(field.Value)
		if err != nil {
			return nil, err
		}
		output.Write(value)
	}
	output.WriteByte('}')
	return output.Bytes(), nil
}
func marshalCompact(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return bytes.TrimSuffix(output.Bytes(), []byte("\n")), nil
}

func tableCounts(ctx context.Context, connection *sql.Conn) (map[string]int64, error) {
	result := make(map[string]int64, len(TableNames))
	for _, name := range TableNames {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		var count int64
		if err := connection.QueryRowContext(ctx, "SELECT COUNT(*) FROM "+name).Scan(&count); err != nil {
			return nil, failure("SQLITE_SCHEMA_FAILED", err)
		}
		result[name] = count
	}
	return result, nil
}

func compileQuality(ctx context.Context, connection *sql.Conn, governed bool, unresolved int64) (map[string]any, map[string]int64, error) {
	if !governed {
		var noCharacters, noCast, filtered int64
		if err := connection.QueryRowContext(ctx, "SELECT COUNT(*) FROM subject s WHERE NOT EXISTS (SELECT 1 FROM temp.source_subject_character c WHERE c.subject_id = s.subject_id)").Scan(&noCharacters); err != nil {
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		if err := connection.QueryRowContext(ctx, "SELECT COUNT(*) FROM subject s WHERE NOT EXISTS (SELECT 1 FROM cast_credit c WHERE c.subject_type = s.subject_type AND c.subject_id = s.subject_id)").Scan(&noCast); err != nil {
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		if err := connection.QueryRowContext(ctx, "SELECT COUNT(*) FROM temp.exact_cast_edge e LEFT JOIN temp.eligible_staff_person v ON v.person_id=e.person_id WHERE v.person_id IS NULL").Scan(&filtered); err != nil {
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		return nil, map[string]int64{"NO_CHARACTERS": noCharacters, "NO_CAST_RELATIONS": noCast, "FILTERED_BY_VALID_CV": filtered, "UNKNOWN_STAFF_POSITION": unresolved}, nil
	}
	noCharacters, err := subjectSamples(ctx, connection, "SELECT 1 FROM temp.source_subject_character c WHERE c.subject_id = s.subject_id")
	if err != nil {
		return nil, nil, err
	}
	noCast, err := subjectSamples(ctx, connection, "SELECT 1 FROM temp.exact_cast_edge e WHERE e.subject_type=s.subject_type AND e.subject_id=s.subject_id")
	if err != nil {
		return nil, nil, err
	}
	filteredRows, err := connection.QueryContext(ctx, "SELECT e.subject_type,e.subject_id,e.character_id,e.person_id,e.role_type FROM temp.exact_cast_edge e LEFT JOIN temp.eligible_staff_person v ON v.person_id=e.person_id WHERE e.subject_type IN ('anime','game') AND v.person_id IS NULL ORDER BY CASE e.subject_type WHEN 'anime' THEN 1 WHEN 'game' THEN 3 ELSE 5 END,e.subject_id,e.character_id,e.person_id,e.role_type,e.sort_order LIMIT 100")
	if err != nil {
		return nil, nil, failure("SQLITE_BUILD_FAILED", err)
	}
	filteredSamples := []any{}
	for filteredRows.Next() {
		var subjectType string
		var subjectID, characterID, personID, role int64
		if err := filteredRows.Scan(&subjectType, &subjectID, &characterID, &personID, &role); err != nil {
			filteredRows.Close()
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		filteredSamples = append(filteredSamples, map[string]any{"subjectType": subjectType, "subjectId": subjectID, "characterId": characterID, "personId": personID, "roleType": role})
	}
	filteredRows.Close()
	var filteredCount int64
	if err := connection.QueryRowContext(ctx, "SELECT COUNT(*) FROM temp.exact_cast_edge e LEFT JOIN temp.eligible_staff_person v ON v.person_id=e.person_id WHERE e.subject_type IN ('anime','game') AND v.person_id IS NULL").Scan(&filteredCount); err != nil {
		return nil, nil, failure("SQLITE_BUILD_FAILED", err)
	}
	roleInventory := []any{}
	rows, err := connection.QueryContext(ctx, "SELECT role_type,COUNT(*) FROM temp.source_subject_character GROUP BY role_type ORDER BY role_type")
	if err != nil {
		return nil, nil, failure("SQLITE_BUILD_FAILED", err)
	}
	for rows.Next() {
		var role, count int64
		if err := rows.Scan(&role, &count); err != nil {
			rows.Close()
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		roleInventory = append(roleInventory, map[string]any{"roleType": role, "count": count})
	}
	rows.Close()
	unknown := []any{}
	rows, err = connection.QueryContext(ctx, "SELECT c.subject_type,c.position_id,COUNT(*) FROM staff_credit c LEFT JOIN staff_position p ON p.subject_type=c.subject_type AND p.position_id=c.position_id WHERE p.position_id IS NULL GROUP BY c.subject_type,c.position_id ORDER BY CASE c.subject_type WHEN 'book' THEN 0 WHEN 'anime' THEN 1 WHEN 'music' THEN 2 WHEN 'game' THEN 3 WHEN 'real' THEN 4 ELSE 5 END,c.position_id")
	if err != nil {
		return nil, nil, failure("SQLITE_BUILD_FAILED", err)
	}
	for rows.Next() {
		var subjectType string
		var positionID, count int64
		if err := rows.Scan(&subjectType, &positionID, &count); err != nil {
			rows.Close()
			return nil, nil, failure("SQLITE_BUILD_FAILED", err)
		}
		unknown = append(unknown, map[string]any{"subjectType": subjectType, "positionId": positionID, "count": count})
	}
	rows.Close()
	if len(unknown) > 1000 {
		return nil, nil, failure("QUALITY_UNKNOWN_POSITION_BOUND_EXCEEDED", nil)
	}
	report := map[string]any{"schemaVersion": int64(1), "counts": map[string]any{"NO_CHARACTERS": int64(len(noCharacters)), "NO_CAST_RELATIONS": int64(len(noCast)), "FILTERED_BY_VALID_CV": filteredCount}, "samples": map[string]any{"NO_CHARACTERS": noCharacters, "NO_CAST_RELATIONS": noCast, "FILTERED_BY_VALID_CV": filteredSamples}, "roleInventory": roleInventory, "unknownStaffPositionIds": unknown, "blockingErrors": []any{}}
	summary := map[string]int64{"NO_CHARACTERS": int64(len(noCharacters)), "NO_CAST_RELATIONS": int64(len(noCast)), "FILTERED_BY_VALID_CV": filteredCount, "UNKNOWN_STAFF_POSITION": unresolved}
	return report, summary, nil
}

func subjectSamples(ctx context.Context, connection *sql.Conn, absence string) ([]any, error) {
	query := "SELECT s.subject_type,s.subject_id FROM subject s WHERE s.subject_type IN ('anime','game') AND NOT EXISTS (" + absence + ") ORDER BY CASE s.subject_type WHEN 'anime' THEN 1 WHEN 'game' THEN 3 ELSE 5 END,s.subject_id LIMIT 100"
	rows, err := connection.QueryContext(ctx, query)
	if err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	defer rows.Close()
	result := []any{}
	for rows.Next() {
		var subjectType string
		var id int64
		if err := rows.Scan(&subjectType, &id); err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		result = append(result, map[string]any{"subjectType": subjectType, "subjectId": id})
	}
	return result, nil
}

type projectionWriter struct {
	hash  hashWriter
	first bool
	count int
}
type hashWriter interface{ Write([]byte) (int, error) }

func newProjectionWriter() (*projectionWriter, hashWriter) {
	hash := sha256.New()
	hash.Write([]byte("[\n"))
	return &projectionWriter{hash: hash, first: true}, hash
}
func (w *projectionWriter) add(value orderedObject) error {
	if !w.first {
		w.hash.Write([]byte(",\n"))
	}
	data, err := prettyCanonicalJSON(value)
	if err != nil {
		return err
	}
	data = bytes.TrimSuffix(data, []byte("\n"))
	lines := bytes.Split(data, []byte("\n"))
	w.hash.Write([]byte("  "))
	w.hash.Write(bytes.Join(lines, []byte("\n  ")))
	w.first = false
	w.count++
	return nil
}
func (w *projectionWriter) finish() string {
	if w.first {
		return digestBytes([]byte("[]\n"))
	}
	w.hash.Write([]byte("\n]\n"))
	if hash, ok := w.hash.(interface{ Sum([]byte) []byte }); ok {
		return "sha256:" + hex.EncodeToString(hash.Sum(nil))
	}
	panic("hash")
}

func logicalDigests(ctx context.Context, connection *sql.Conn, catalog compiledCatalog) (map[string]string, error) {
	result := map[string]string{"algorithm": LogicalRowsAlgorithm}
	projections := []struct {
		name, query string
		scan        func(*sql.Rows) (orderedObject, error)
	}{
		{"subject", "SELECT subject_type,subject_id,name,name_cn,nsfw,air_date,air_date_precision FROM subject ORDER BY subject_type COLLATE BINARY,subject_id", scanSubject},
		{"person", "SELECT p.person_id,p.name,p.name_cn,COALESCE((SELECT group_concat(career,char(31)) FROM person_career pc WHERE pc.person_id=p.person_id ORDER BY career),''),p.summary FROM person p ORDER BY p.person_id", scanPerson},
		{"character", "SELECT character_id,name,name_cn FROM character ORDER BY character_id", scanCharacter},
		{"subjectRelation", "SELECT subject_type,subject_id,related_subject_type,related_subject_id,relation_type FROM subject_relation ORDER BY subject_type COLLATE BINARY,subject_id,related_subject_type COLLATE BINARY,related_subject_id,relation_type", scanRelation},
		{"staffPosition", "SELECT subject_type,position_id,name_cn,name_en,name_jp,categories,sort_order,status FROM staff_position ORDER BY subject_type COLLATE BINARY,position_id", scanStaffPosition},
		{"staffCredit", "SELECT c.subject_type,c.subject_id,c.person_id,c.position_id,p.position_id IS NOT NULL,COALESCE(p.status='selectable',0) FROM staff_credit c LEFT JOIN staff_position p ON p.subject_type=c.subject_type AND p.position_id=c.position_id ORDER BY c.subject_type COLLATE BINARY,c.subject_id,c.person_id,c.position_id", scanStaffCredit},
		{"castCredit", "SELECT subject_type,subject_id,person_id,character_id,role_type,eligible,provenance FROM cast_credit ORDER BY subject_type COLLATE BINARY,subject_id,person_id,character_id", scanCastCredit},
	}
	for _, projection := range projections {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		rows, err := connection.QueryContext(ctx, projection.query)
		if err != nil {
			return nil, failure("SQLITE_BUILD_FAILED", err)
		}
		writer, _ := newProjectionWriter()
		for rows.Next() {
			value, err := projection.scan(rows)
			if err != nil {
				rows.Close()
				return nil, err
			}
			if err = writer.add(value); err != nil {
				rows.Close()
				return nil, err
			}
		}
		rows.Close()
		result[projection.name] = writer.finish()
	}
	positions := append([]compiledPosition(nil), catalog.Positions...)
	sort.Slice(positions, func(i, j int) bool {
		if positions[i].DisplayOrder != positions[j].DisplayOrder {
			return positions[i].DisplayOrder < positions[j].DisplayOrder
		}
		return positions[i].PositionKey < positions[j].PositionKey
	})
	writer, _ := newProjectionWriter()
	for _, position := range positions {
		value := orderedObject{{"positionKey", position.PositionKey}, {"subjectType", position.SubjectType}, {"positionKind", position.PositionKind}, {"label", position.Label}, {"displayOrder", position.DisplayOrder}, {"selectable", position.Selectable}, {"capabilities", position.Capabilities}, {"selectionRule", position.LogicalRule}}
		if err := writer.add(value); err != nil {
			return nil, err
		}
	}
	result["catalogPosition"] = writer.finish()
	return result, nil
}

func scanSubject(rows *sql.Rows) (orderedObject, error) {
	var subjectType, name string
	var id int64
	var nameCN, airDate sql.NullString
	var nsfw int
	var precision sql.NullInt64
	if err := rows.Scan(&subjectType, &id, &name, &nameCN, &nsfw, &airDate, &precision); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"subjectType", subjectType}, {"subjectId", id}, {"name", name}, {"nameCn", nullString(nameCN)}, {"nsfw", nsfw != 0}, {"airDate", nullString(airDate)}, {"airDatePrecision", nullInt(precision)}}, nil
}
func scanPerson(rows *sql.Rows) (orderedObject, error) {
	var id int64
	var name, careerText string
	var nameCN, summary sql.NullString
	if err := rows.Scan(&id, &name, &nameCN, &careerText, &summary); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	careers := []string{}
	if careerText != "" {
		careers = strings.Split(careerText, string(rune(31)))
		sort.Strings(careers)
	}
	return orderedObject{{"personId", id}, {"name", name}, {"nameCn", nullString(nameCN)}, {"careers", careers}, {"summary", nullString(summary)}}, nil
}
func scanCharacter(rows *sql.Rows) (orderedObject, error) {
	var id int64
	var name string
	var nameCN sql.NullString
	if err := rows.Scan(&id, &name, &nameCN); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"characterId", id}, {"name", name}, {"nameCn", nullString(nameCN)}}, nil
}
func scanRelation(rows *sql.Rows) (orderedObject, error) {
	var a, c string
	var b, d, e int64
	if err := rows.Scan(&a, &b, &c, &d, &e); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"subjectType", a}, {"subjectId", b}, {"relatedSubjectType", c}, {"relatedSubjectId", d}, {"relationType", e}}, nil
}
func scanStaffPosition(rows *sql.Rows) (orderedObject, error) {
	var subjectType, categories string
	var id, order int64
	var cn, en, jp sql.NullString
	var status string
	if err := rows.Scan(&subjectType, &id, &cn, &en, &jp, &categories, &order, &status); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	var categoryValues []string
	if err := json.Unmarshal([]byte(categories), &categoryValues); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"subjectType", subjectType}, {"positionId", id}, {"nameCn", nullString(cn)}, {"nameEn", nullString(en)}, {"nameJp", nullString(jp)}, {"categories", categoryValues}, {"sortOrder", order}, {"status", status}}, nil
}
func scanStaffCredit(rows *sql.Rows) (orderedObject, error) {
	var subjectType string
	var subjectID, personID, positionID int64
	var resolved, selectable int
	if err := rows.Scan(&subjectType, &subjectID, &personID, &positionID, &resolved, &selectable); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"subjectType", subjectType}, {"subjectId", subjectID}, {"personId", personID}, {"positionId", positionID}, {"resolved", resolved != 0}, {"selectable", selectable != 0}}, nil
}
func scanCastCredit(rows *sql.Rows) (orderedObject, error) {
	var subjectType, provenance string
	var subjectID, personID, characterID, role int64
	var eligible int
	if err := rows.Scan(&subjectType, &subjectID, &personID, &characterID, &role, &eligible, &provenance); err != nil {
		return nil, failure("SQLITE_BUILD_FAILED", err)
	}
	return orderedObject{{"subjectType", subjectType}, {"subjectId", subjectID}, {"personId", personID}, {"characterId", characterID}, {"roleType", role}, {"eligible", eligible != 0}, {"provenance", provenance}}, nil
}
func nullString(value sql.NullString) any {
	if !value.Valid {
		return nil
	}
	return value.String
}
func nullInt(value sql.NullInt64) any {
	if !value.Valid {
		return nil
	}
	return value.Int64
}

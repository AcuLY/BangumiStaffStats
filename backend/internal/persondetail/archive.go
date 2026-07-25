package persondetail

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strconv"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

const (
	selectPersonDetailAuthority = `SELECT position.position_key,
       position.subject_type,
       position.position_kind,
       position.selectable,
       COALESCE(capability.supported, 0)
FROM catalog_position AS position
LEFT JOIN catalog_capability AS capability
  ON capability.position_key = position.position_key
 AND capability.capability = 'personDetail'
ORDER BY position.subject_type, position.display_order, position.position_key`
	selectDetailPerson = `SELECT person_id, name, name_cn
FROM person
WHERE person_id = ?`
	selectDetailCareers = `SELECT career
FROM person_career
WHERE person_id = ?
ORDER BY career`
	selectDetailSubjectsPrefix = `SELECT subject_id, name, name_cn, air_date
FROM subject
WHERE subject_type = ? AND subject_id IN (`
	selectDetailCharacters = `SELECT DISTINCT character.character_id,
       character.name,
       character.name_cn
FROM cast_credit
JOIN character ON character.character_id = cast_credit.character_id
WHERE cast_credit.subject_type = ?
  AND cast_credit.person_id = ?
  AND cast_credit.eligible = 1
  AND cast_credit.provenance = 'exact'
ORDER BY character.character_id`
)

const subjectReferenceQueryChunkSize = 400

// Authority is the narrow catalog projection needed before evaluation.
type Authority struct {
	Context                query.CatalogContext
	PersonDetailByPosition map[string]bool
	CastByPosition         map[string]bool
}

// LoadAuthority reads the selectable/catalog capability projection from one
// immutable Archive version.
func LoadAuthority(ctx context.Context, store *archive.Store) (Authority, error) {
	if err := contextError(ctx); err != nil {
		return Authority{}, err
	}
	if store == nil {
		return Authority{}, notReady()
	}
	rows, err := store.QueryContext(ctx, selectPersonDetailAuthority)
	if err != nil {
		return Authority{}, sourceFailure(ctx, err)
	}
	defer rows.Close()
	result := Authority{
		Context: query.CatalogContext{
			Positions: make([]query.CatalogPosition, 0),
		},
		PersonDetailByPosition: make(map[string]bool),
		CastByPosition:         make(map[string]bool),
	}
	for rows.Next() {
		if err := contextError(ctx); err != nil {
			return Authority{}, err
		}
		var position query.CatalogPosition
		var positionKind string
		var selectable, supported int64
		if err := rows.Scan(
			&position.Key,
			&position.SubjectType,
			&positionKind,
			&selectable,
			&supported,
		); err != nil {
			return Authority{}, sourceFailure(ctx, err)
		}
		switch positionKind {
		case "staff", "staffSet":
			result.CastByPosition[position.Key] = false
		case "cast":
			result.CastByPosition[position.Key] = true
		default:
			return Authority{}, sourceFailure(
				ctx,
				errors.New("persondetail: invalid catalog position kind"),
			)
		}
		position.Selectable = selectable == 1
		result.Context.Positions = append(result.Context.Positions, position)
		result.PersonDetailByPosition[position.Key] = supported == 1
	}
	if err := rows.Err(); err != nil {
		return Authority{}, sourceFailure(ctx, err)
	}
	return result, nil
}

// LoadArchiveEvidence returns only bounded profile/entity facts. It does not
// load aliases, arbitrary URLs, relationship graphs, or unbounded biography
// text.
func LoadArchiveEvidence(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	personID int64,
	subjectIDs []int64,
) (ArchiveEvidence, error) {
	if err := contextError(ctx); err != nil {
		return ArchiveEvidence{}, err
	}
	if store == nil {
		return ArchiveEvidence{}, notReady()
	}
	if personID <= 0 || personID > maxJSONSafeInteger {
		return ArchiveEvidence{}, fieldError("/input/personId")
	}
	person, found, err := loadPerson(ctx, store, personID)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	if !found {
		return ArchiveEvidence{}, fail(
			CodeEntityNotFound,
			"person not found",
			"",
			"",
			false,
			nil,
		)
	}
	careers, err := loadCareers(ctx, store, personID)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	person.Careers = careers
	subjects, err := loadSubjectReferences(ctx, store, subjectType, subjectIDs)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	characters, err := loadCharacterReferences(ctx, store, subjectType, personID)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	return ArchiveEvidence{
		Person:     person,
		Subjects:   subjects,
		Characters: characters,
	}, nil
}

func loadPerson(
	ctx context.Context,
	store *archive.Store,
	personID int64,
) (PersonProfile, bool, error) {
	rows, err := store.QueryContext(ctx, selectDetailPerson, personID)
	if err != nil {
		return PersonProfile{}, false, sourceFailure(ctx, err)
	}
	defer rows.Close()
	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return PersonProfile{}, false, sourceFailure(ctx, err)
		}
		return PersonProfile{}, false, nil
	}
	var result PersonProfile
	var nameCN sql.NullString
	if err := rows.Scan(&result.ID, &result.Name, &nameCN); err != nil {
		return PersonProfile{}, false, sourceFailure(ctx, err)
	}
	if nameCN.Valid {
		result.NameCN = cloneString(&nameCN.String)
	}
	if rows.Next() {
		return PersonProfile{}, false, sourceFailure(
			ctx,
			errors.New("persondetail: duplicate person"),
		)
	}
	if err := rows.Err(); err != nil {
		return PersonProfile{}, false, sourceFailure(ctx, err)
	}
	return result, true, nil
}

func loadCareers(
	ctx context.Context,
	store *archive.Store,
	personID int64,
) ([]string, error) {
	rows, err := store.QueryContext(ctx, selectDetailCareers, personID)
	if err != nil {
		return nil, sourceFailure(ctx, err)
	}
	defer rows.Close()
	result := make([]string, 0)
	for rows.Next() {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		var career string
		if err := rows.Scan(&career); err != nil {
			return nil, sourceFailure(ctx, err)
		}
		result = append(result, career)
	}
	if err := rows.Err(); err != nil {
		return nil, sourceFailure(ctx, err)
	}
	return result, nil
}

func loadSubjectReferences(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	subjectIDs []int64,
) ([]SubjectReference, error) {
	ids, err := normalizeSubjectReferenceIDs(subjectIDs)
	if err != nil {
		return nil, err
	}
	result := make([]SubjectReference, 0)
	for offset := 0; offset < len(ids); offset += subjectReferenceQueryChunkSize {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		end := min(offset+subjectReferenceQueryChunkSize, len(ids))
		chunk := ids[offset:end]
		placeholders := make([]string, len(chunk))
		arguments := make([]any, 0, len(chunk)+1)
		arguments = append(arguments, subjectType)
		for index, subjectID := range chunk {
			placeholders[index] = "?"
			arguments = append(arguments, subjectID)
		}
		queryText := selectDetailSubjectsPrefix +
			strings.Join(placeholders, ",") +
			`) ORDER BY subject_id`
		rows, queryErr := store.QueryContext(ctx, queryText, arguments...)
		if queryErr != nil {
			return nil, sourceFailure(ctx, queryErr)
		}
		for rows.Next() {
			if err := contextError(ctx); err != nil {
				_ = rows.Close()
				return nil, err
			}
			var value SubjectReference
			var nameCN, date sql.NullString
			if err := rows.Scan(&value.ID, &value.Name, &nameCN, &date); err != nil {
				_ = rows.Close()
				return nil, sourceFailure(ctx, err)
			}
			if nameCN.Valid {
				value.NameCN = cloneString(&nameCN.String)
			}
			if date.Valid {
				value.Date = cloneString(&date.String)
			}
			result = append(result, value)
		}
		if err := rows.Err(); err != nil {
			_ = rows.Close()
			return nil, sourceFailure(ctx, err)
		}
		if err := rows.Close(); err != nil {
			return nil, sourceFailure(ctx, err)
		}
	}
	return result, nil
}

func normalizeSubjectReferenceIDs(subjectIDs []int64) ([]int64, error) {
	seen := make(map[int64]struct{}, len(subjectIDs))
	result := make([]int64, 0, len(subjectIDs))
	for _, subjectID := range subjectIDs {
		if subjectID <= 0 || subjectID > maxJSONSafeInteger {
			return nil, fieldError("")
		}
		if _, exists := seen[subjectID]; exists {
			continue
		}
		seen[subjectID] = struct{}{}
		result = append(result, subjectID)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left] < result[right]
	})
	return result, nil
}

func loadCharacterReferences(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	personID int64,
) ([]CharacterReference, error) {
	rows, err := store.QueryContext(ctx, selectDetailCharacters, subjectType, personID)
	if err != nil {
		return nil, sourceFailure(ctx, err)
	}
	defer rows.Close()
	result := make([]CharacterReference, 0)
	for rows.Next() {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		var id int64
		var value CharacterReference
		var nameCN sql.NullString
		if err := rows.Scan(&id, &value.Name, &nameCN); err != nil {
			return nil, sourceFailure(ctx, err)
		}
		value.ID = &id
		value.Key = "character:" + strconv.FormatInt(id, 10)
		if nameCN.Valid {
			value.NameCN = cloneString(&nameCN.String)
		}
		result = append(result, value)
	}
	if err := rows.Err(); err != nil {
		return nil, sourceFailure(ctx, err)
	}
	return result, nil
}

func sourceFailure(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return fail(CodeCanceled, "person detail request was canceled", "", "", false, cause)
	}
	return fail(CodeInternal, "person detail is unavailable", "", "", true, err)
}

func notReady() error {
	return fail(CodeNotReady, "person detail is not ready", "", "", true, nil)
}

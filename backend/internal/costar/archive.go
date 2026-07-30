package costar

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

const (
	selectCoStarCatalogContext = `SELECT position.position_key,
       position.subject_type,
       position.selectable,
       COALESCE(capability.supported, 0)
FROM catalog_position AS position
LEFT JOIN catalog_capability AS capability
  ON capability.position_key = position.position_key
 AND capability.capability = 'coStar'
ORDER BY position.subject_type, position.display_order, position.position_key`
	selectCoStarPeoplePrefix = `SELECT person_id, name, name_cn
FROM person
WHERE person_id IN (`
	selectCoStarSubjectsPrefix = `SELECT subject_id, name, name_cn, air_date
FROM subject
WHERE subject_type = ? AND subject_id IN (`
	selectCoStarCharactersPrefix = `SELECT character_id, name, name_cn
FROM character
WHERE character_id IN (`
)

const archiveReferenceQueryChunkSize = 400

type catalogAuthority struct {
	Context          query.CatalogContext
	CoStarByPosition map[string]bool
}

func loadCatalogAuthority(
	ctx context.Context,
	store *archive.Store,
) (catalogAuthority, error) {
	if ctx == nil || store == nil {
		return catalogAuthority{}, errors.New("costar: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectCoStarCatalogContext)
	if err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	defer rows.Close()

	result := catalogAuthority{
		Context: query.CatalogContext{
			Positions: make([]query.CatalogPosition, 0),
		},
		CoStarByPosition: make(map[string]bool),
	}
	for rows.Next() {
		if cause := context.Cause(ctx); cause != nil {
			return catalogAuthority{}, cause
		}
		var position query.CatalogPosition
		var selectable, supported int64
		if err := rows.Scan(
			&position.Key,
			&position.SubjectType,
			&selectable,
			&supported,
		); err != nil {
			return catalogAuthority{}, sourceError(ctx, err)
		}
		if (selectable != 0 && selectable != 1) ||
			(supported != 0 && supported != 1) {
			return catalogAuthority{}, errors.New("costar: invalid catalog capability")
		}
		position.Selectable = selectable == 1
		result.Context.Positions = append(result.Context.Positions, position)
		result.CoStarByPosition[position.Key] = supported == 1
	}
	if err := rows.Err(); err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	return result, nil
}

func loadArchiveEvidence(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	people []PersonReference,
	subjectIDs []int64,
	characterIDs []int64,
) (evidence ArchiveEvidence, err error) {
	started := time.Now()
	defer func() {
		querytiming.ObserveSQLiteFromContext(ctx, time.Since(started), err)
	}()
	if ctx == nil || store == nil {
		return ArchiveEvidence{}, errors.New("costar: nil Archive store")
	}
	subjects, err := loadSubjectReferences(ctx, store, subjectType, subjectIDs)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	characters, err := loadCharacterReferences(ctx, store, characterIDs)
	if err != nil {
		return ArchiveEvidence{}, err
	}
	return ArchiveEvidence{
		People:     clonePeople(people),
		Subjects:   subjects,
		Characters: characters,
	}, nil
}

func clonePeople(values []PersonReference) []PersonReference {
	result := make([]PersonReference, len(values))
	for index, value := range values {
		result[index] = clonePerson(value)
	}
	return result
}

func loadPeople(
	ctx context.Context,
	store *archive.Store,
	personIDs []int64,
) ([]PersonReference, error) {
	ids, err := normalizeReferenceIDs(personIDs)
	if err != nil {
		return nil, err
	}
	result := make([]PersonReference, 0, len(ids))
	for offset := 0; offset < len(ids); offset += archiveReferenceQueryChunkSize {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		end := min(offset+archiveReferenceQueryChunkSize, len(ids))
		chunk := ids[offset:end]
		rows, err := queryReferenceChunk(
			ctx,
			store,
			selectCoStarPeoplePrefix,
			chunk,
			nil,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			if cause := context.Cause(ctx); cause != nil {
				_ = rows.Close()
				return nil, cause
			}
			var person PersonReference
			var nameCN sql.NullString
			if err := rows.Scan(&person.ID, &person.Name, &nameCN); err != nil {
				_ = rows.Close()
				return nil, sourceError(ctx, err)
			}
			if person.ID <= 0 || person.ID > maxJSONSafeInteger || person.Name == "" {
				_ = rows.Close()
				return nil, errors.New("costar: invalid Archive person reference")
			}
			if nameCN.Valid {
				person.NameCN = cloneString(&nameCN.String)
			}
			result = append(result, person)
		}
		if err := closeRows(ctx, rows); err != nil {
			return nil, err
		}
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].ID < result[right].ID
	})
	return result, nil
}

func loadSubjectReferences(
	ctx context.Context,
	store *archive.Store,
	subjectType string,
	subjectIDs []int64,
) ([]SubjectReference, error) {
	ids, err := normalizeReferenceIDs(subjectIDs)
	if err != nil {
		return nil, err
	}
	result := make([]SubjectReference, 0, len(ids))
	for offset := 0; offset < len(ids); offset += archiveReferenceQueryChunkSize {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		end := min(offset+archiveReferenceQueryChunkSize, len(ids))
		chunk := ids[offset:end]
		rows, err := queryReferenceChunk(
			ctx,
			store,
			selectCoStarSubjectsPrefix,
			chunk,
			[]any{subjectType},
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			if cause := context.Cause(ctx); cause != nil {
				_ = rows.Close()
				return nil, cause
			}
			var subject SubjectReference
			var nameCN, date sql.NullString
			if err := rows.Scan(&subject.ID, &subject.Name, &nameCN, &date); err != nil {
				_ = rows.Close()
				return nil, sourceError(ctx, err)
			}
			if subject.ID <= 0 || subject.ID > maxJSONSafeInteger || subject.Name == "" {
				_ = rows.Close()
				return nil, errors.New("costar: invalid Archive subject reference")
			}
			if nameCN.Valid {
				subject.NameCN = cloneString(&nameCN.String)
			}
			if date.Valid {
				subject.Date = cloneString(&date.String)
			}
			result = append(result, subject)
		}
		if err := closeRows(ctx, rows); err != nil {
			return nil, err
		}
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left].ID < result[right].ID
	})
	return result, nil
}

func loadCharacterReferences(
	ctx context.Context,
	store *archive.Store,
	characterIDs []int64,
) ([]CharacterReference, error) {
	ids, err := normalizeReferenceIDs(characterIDs)
	if err != nil {
		return nil, err
	}
	result := make([]CharacterReference, 0, len(ids))
	for offset := 0; offset < len(ids); offset += archiveReferenceQueryChunkSize {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		end := min(offset+archiveReferenceQueryChunkSize, len(ids))
		chunk := ids[offset:end]
		rows, err := queryReferenceChunk(
			ctx,
			store,
			selectCoStarCharactersPrefix,
			chunk,
			nil,
		)
		if err != nil {
			return nil, err
		}
		for rows.Next() {
			if cause := context.Cause(ctx); cause != nil {
				_ = rows.Close()
				return nil, cause
			}
			var id int64
			var name string
			var nameCN sql.NullString
			if err := rows.Scan(&id, &name, &nameCN); err != nil {
				_ = rows.Close()
				return nil, sourceError(ctx, err)
			}
			if id <= 0 || id > maxJSONSafeInteger || name == "" {
				_ = rows.Close()
				return nil, errors.New("costar: invalid Archive character reference")
			}
			character := CharacterReference{
				Key:  fmt.Sprintf("character:%d", id),
				ID:   cloneInt64(&id),
				Name: name,
			}
			if nameCN.Valid {
				character.NameCN = cloneString(&nameCN.String)
			}
			result = append(result, character)
		}
		if err := closeRows(ctx, rows); err != nil {
			return nil, err
		}
	}
	sort.Slice(result, func(left, right int) bool {
		return *result[left].ID < *result[right].ID
	})
	return result, nil
}

func queryReferenceChunk(
	ctx context.Context,
	store *archive.Store,
	prefix string,
	ids []int64,
	leading []any,
) (*archive.Rows, error) {
	if len(ids) == 0 {
		return nil, errors.New("costar: empty reference chunk")
	}
	placeholders := make([]string, len(ids))
	arguments := append([]any{}, leading...)
	for index, id := range ids {
		placeholders[index] = "?"
		arguments = append(arguments, id)
	}
	rows, err := store.QueryContext(
		ctx,
		prefix+strings.Join(placeholders, ",")+`) ORDER BY 1`,
		arguments...,
	)
	if err != nil {
		return nil, sourceError(ctx, err)
	}
	return rows, nil
}

func closeRows(ctx context.Context, rows *archive.Rows) error {
	if err := rows.Err(); err != nil {
		_ = rows.Close()
		return sourceError(ctx, err)
	}
	if err := rows.Close(); err != nil {
		return sourceError(ctx, err)
	}
	return nil
}

func normalizeReferenceIDs(values []int64) ([]int64, error) {
	seen := make(map[int64]struct{}, len(values))
	result := make([]int64, 0, len(values))
	for _, value := range values {
		if value <= 0 || value > maxJSONSafeInteger {
			return nil, errors.New("costar: invalid required reference")
		}
		if _, duplicate := seen[value]; duplicate {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	sort.Slice(result, func(left, right int) bool {
		return result[left] < result[right]
	})
	return result, nil
}

func sourceError(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return fmt.Errorf("costar: Archive source unavailable: %w", err)
}

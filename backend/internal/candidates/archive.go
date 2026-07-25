package candidates

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

const (
	selectCandidateCatalogContext = `SELECT position.position_key,
       position.subject_type,
       position.selectable,
       COALESCE(capability.supported, 0)
FROM catalog_position AS position
LEFT JOIN catalog_capability AS capability
  ON capability.position_key = position.position_key
 AND capability.capability = 'candidates'
ORDER BY position.subject_type, position.display_order, position.position_key`
	selectCandidatePeople = `SELECT person_id, name, name_cn
FROM person
ORDER BY person_id`
)

type catalogAuthority struct {
	Context              query.CatalogContext
	CandidatesByPosition map[string]bool
}

func loadCatalogAuthority(
	ctx context.Context,
	store *archive.Store,
) (catalogAuthority, error) {
	if store == nil {
		return catalogAuthority{}, errors.New("candidates: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectCandidateCatalogContext)
	if err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	defer rows.Close()

	result := catalogAuthority{
		Context: query.CatalogContext{
			Positions: make([]query.CatalogPosition, 0),
		},
		CandidatesByPosition: make(map[string]bool),
	}
	for rows.Next() {
		if cause := context.Cause(ctx); cause != nil {
			return catalogAuthority{}, cause
		}
		var position query.CatalogPosition
		var selectable, candidatesSupported int64
		if err := rows.Scan(
			&position.Key,
			&position.SubjectType,
			&selectable,
			&candidatesSupported,
		); err != nil {
			return catalogAuthority{}, sourceError(ctx, err)
		}
		if (selectable != 0 && selectable != 1) ||
			(candidatesSupported != 0 && candidatesSupported != 1) {
			return catalogAuthority{}, errors.New("candidates: invalid catalog capability")
		}
		position.Selectable = selectable == 1
		result.Context.Positions = append(result.Context.Positions, position)
		result.CandidatesByPosition[position.Key] = candidatesSupported == 1
	}
	if err := rows.Err(); err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	return result, nil
}

func loadPeople(
	ctx context.Context,
	store *archive.Store,
) ([]PersonReference, error) {
	if store == nil {
		return nil, errors.New("candidates: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectCandidatePeople)
	if err != nil {
		return nil, sourceError(ctx, err)
	}
	defer rows.Close()

	result := make([]PersonReference, 0)
	var previousID int64
	for rows.Next() {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		var id int64
		var name string
		var nameCN sql.NullString
		if err := rows.Scan(&id, &name, &nameCN); err != nil {
			return nil, sourceError(ctx, err)
		}
		if id <= previousID || name == "" {
			return nil, errors.New("candidates: invalid Archive person")
		}
		previousID = id
		person := PersonReference{ID: id, Name: name}
		if nameCN.Valid {
			value := nameCN.String
			person.NameCN = &value
		}
		result = append(result, person)
	}
	if err := rows.Err(); err != nil {
		return nil, sourceError(ctx, err)
	}
	return result, nil
}

func sourceError(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return fmt.Errorf("candidates: Archive source unavailable: %w", err)
}

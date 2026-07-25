package ranking

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

const (
	selectCatalogContext = `SELECT position.position_key,
       position.subject_type,
       position.selectable,
       COALESCE(capability.supported, 0)
FROM catalog_position AS position
LEFT JOIN catalog_capability AS capability
  ON capability.position_key = position.position_key
 AND capability.capability = 'rankings'
ORDER BY position.subject_type, position.display_order, position.position_key`
	selectPeople = `SELECT person_id, name, name_cn
FROM person
ORDER BY person_id`
)

type catalogAuthority struct {
	Context            query.CatalogContext
	RankingsByPosition map[string]bool
}

func loadCatalogContext(
	ctx context.Context,
	store *archive.Store,
) (catalogAuthority, error) {
	if store == nil {
		return catalogAuthority{}, errors.New("ranking: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectCatalogContext)
	if err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	defer rows.Close()

	result := catalogAuthority{
		Context: query.CatalogContext{
			Positions: make([]query.CatalogPosition, 0),
		},
		RankingsByPosition: make(map[string]bool),
	}
	for rows.Next() {
		if cause := context.Cause(ctx); cause != nil {
			return catalogAuthority{}, cause
		}
		var position query.CatalogPosition
		var selectable, rankingsSupported int64
		if err := rows.Scan(
			&position.Key,
			&position.SubjectType,
			&selectable,
			&rankingsSupported,
		); err != nil {
			return catalogAuthority{}, sourceError(ctx, err)
		}
		if (selectable != 0 && selectable != 1) ||
			(rankingsSupported != 0 && rankingsSupported != 1) {
			return catalogAuthority{}, errors.New("ranking: invalid catalog capability value")
		}
		position.Selectable = selectable == 1
		result.Context.Positions = append(result.Context.Positions, position)
		result.RankingsByPosition[position.Key] = rankingsSupported == 1
	}
	if err := rows.Err(); err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	return result, nil
}

func loadPeople(
	ctx context.Context,
	store *archive.Store,
) (map[int64]PersonReference, error) {
	if store == nil {
		return nil, errors.New("ranking: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectPeople)
	if err != nil {
		return nil, sourceError(ctx, err)
	}
	defer rows.Close()

	result := make(map[int64]PersonReference)
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
		if id <= 0 || name == "" {
			return nil, errors.New("ranking: invalid Archive person")
		}
		person := PersonReference{ID: id, Name: name}
		if nameCN.Valid {
			value := nameCN.String
			person.NameCN = &value
		}
		if _, duplicate := result[id]; duplicate {
			return nil, fmt.Errorf("ranking: duplicate person %d", id)
		}
		result[id] = person
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
	return fmt.Errorf("ranking: Archive source unavailable: %w", err)
}

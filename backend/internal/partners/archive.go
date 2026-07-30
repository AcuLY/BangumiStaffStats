package partners

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

const (
	selectPartnerCatalogContext = `SELECT position.position_key,
       position.subject_type,
       position.selectable,
       COALESCE(capability.supported, 0)
FROM catalog_position AS position
LEFT JOIN catalog_capability AS capability
  ON capability.position_key = position.position_key
 AND capability.capability = 'partners'
ORDER BY position.subject_type, position.display_order, position.position_key`
	selectPartnerPeoplePrefix = `SELECT person_id, name, name_cn
FROM person
WHERE person_id IN (`
)

const partnerPeopleQueryChunkSize = 400

type catalogAuthority struct {
	Context            query.CatalogContext
	PartnersByPosition map[string]bool
}

func loadCatalogAuthority(
	ctx context.Context,
	store *archive.Store,
) (catalogAuthority, error) {
	if store == nil {
		return catalogAuthority{}, errors.New("partners: nil Archive store")
	}
	rows, err := store.QueryContext(ctx, selectPartnerCatalogContext)
	if err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	defer rows.Close()

	result := catalogAuthority{
		Context: query.CatalogContext{
			Positions: make([]query.CatalogPosition, 0),
		},
		PartnersByPosition: make(map[string]bool),
	}
	for rows.Next() {
		if cause := context.Cause(ctx); cause != nil {
			return catalogAuthority{}, cause
		}
		var position query.CatalogPosition
		var selectable, partnersSupported int64
		if err := rows.Scan(
			&position.Key,
			&position.SubjectType,
			&selectable,
			&partnersSupported,
		); err != nil {
			return catalogAuthority{}, sourceError(ctx, err)
		}
		if (selectable != 0 && selectable != 1) ||
			(partnersSupported != 0 && partnersSupported != 1) {
			return catalogAuthority{}, errors.New("partners: invalid catalog capability")
		}
		position.Selectable = selectable == 1
		result.Context.Positions = append(result.Context.Positions, position)
		result.PartnersByPosition[position.Key] = partnersSupported == 1
	}
	if err := rows.Err(); err != nil {
		return catalogAuthority{}, sourceError(ctx, err)
	}
	return result, nil
}

func loadPeople(
	ctx context.Context,
	store *archive.Store,
	personIDs []int64,
) ([]PersonReference, error) {
	if ctx == nil || store == nil {
		return nil, errors.New("partners: nil Archive store")
	}
	ids, err := normalizePartnerPersonIDs(personIDs)
	if err != nil {
		return nil, err
	}
	result := make([]PersonReference, 0, len(ids))
	var previousID int64
	for offset := 0; offset < len(ids); offset += partnerPeopleQueryChunkSize {
		if cause := context.Cause(ctx); cause != nil {
			return nil, cause
		}
		end := min(offset+partnerPeopleQueryChunkSize, len(ids))
		chunk := ids[offset:end]
		placeholders := make([]string, len(chunk))
		arguments := make([]any, len(chunk))
		for index, personID := range chunk {
			placeholders[index] = "?"
			arguments[index] = personID
		}
		queryText := selectPartnerPeoplePrefix +
			strings.Join(placeholders, ",") +
			`) ORDER BY person_id`
		rows, queryErr := store.QueryContext(ctx, queryText, arguments...)
		if queryErr != nil {
			return nil, sourceError(ctx, queryErr)
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
			if id <= previousID || id > maxJSONSafeInteger || name == "" {
				_ = rows.Close()
				return nil, errors.New("partners: invalid Archive person")
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
			_ = rows.Close()
			return nil, sourceError(ctx, err)
		}
		if err := rows.Close(); err != nil {
			return nil, sourceError(ctx, err)
		}
	}
	return result, nil
}

func normalizePartnerPersonIDs(personIDs []int64) ([]int64, error) {
	seen := make(map[int64]struct{}, len(personIDs))
	result := make([]int64, 0, len(personIDs))
	for _, personID := range personIDs {
		if personID <= 0 || personID > maxJSONSafeInteger {
			return nil, errors.New("partners: invalid required person")
		}
		if _, exists := seen[personID]; exists {
			continue
		}
		seen[personID] = struct{}{}
		result = append(result, personID)
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
	return fmt.Errorf("partners: Archive source unavailable: %w", err)
}

package statistics

import (
	"context"
	"database/sql"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

const (
	selectSeriesSubjects = `SELECT subject_type, subject_id, air_date
FROM subject
ORDER BY subject_type, subject_id`
	selectSeriesRelations = `SELECT subject_type, subject_id, related_subject_type, related_subject_id, relation_type
FROM subject_relation
ORDER BY subject_type, subject_id, related_subject_type, related_subject_id, relation_type`
)

// LoadSeriesIndex reads the complete immutable relation view using only fixed,
// argument-free SELECT statements and binds the result to Store.Identity.
func LoadSeriesIndex(ctx context.Context, store *archive.Store) (*SeriesIndex, error) {
	if err := contextError(ctx); err != nil {
		return nil, err
	}
	if store == nil {
		return nil, outcome(CodeInputInvalid)
	}
	subjects, err := loadSeriesSubjects(ctx, store)
	if err != nil {
		return nil, err
	}
	relations, err := loadSeriesRelations(ctx, store)
	if err != nil {
		return nil, err
	}
	identity := store.Identity()
	if !validDataVersion(identity.DataVersion) {
		return nil, outcome(CodeVersionMismatch)
	}
	return BuildSeriesIndex(ctx, identity.DataVersion, subjects, relations)
}

func loadSeriesSubjects(ctx context.Context, store *archive.Store) ([]SeriesSubject, error) {
	rows, err := store.QueryContext(ctx, selectSeriesSubjects)
	if err != nil {
		return nil, sourceError(ctx, err)
	}
	defer rows.Close()
	result := make([]SeriesSubject, 0)
	for rows.Next() {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		var subject SeriesSubject
		var date sql.NullString
		if err := rows.Scan(&subject.SubjectType, &subject.SubjectID, &date); err != nil {
			return nil, sourceError(ctx, err)
		}
		if date.Valid {
			subject.AirDate = cloneString(&date.String)
		}
		result = append(result, subject)
	}
	if err := rows.Err(); err != nil {
		return nil, sourceError(ctx, err)
	}
	return result, nil
}

func loadSeriesRelations(ctx context.Context, store *archive.Store) ([]Relation, error) {
	rows, err := store.QueryContext(ctx, selectSeriesRelations)
	if err != nil {
		return nil, sourceError(ctx, err)
	}
	defer rows.Close()
	result := make([]Relation, 0)
	for rows.Next() {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		var relation Relation
		if err := rows.Scan(
			&relation.SourceType,
			&relation.SourceID,
			&relation.TargetType,
			&relation.TargetID,
			&relation.RelationID,
		); err != nil {
			return nil, sourceError(ctx, err)
		}
		result = append(result, relation)
	}
	if err := rows.Err(); err != nil {
		return nil, sourceError(ctx, err)
	}
	return result, nil
}

func sourceError(ctx context.Context, cause error) error {
	if err := contextError(ctx); err != nil {
		return err
	}
	return outcomeCause(CodeSourceUnavailable, cause)
}

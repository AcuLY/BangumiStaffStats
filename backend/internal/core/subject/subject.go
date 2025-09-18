package subject

import (
	"context"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/bloom"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/db"
)

func Get(ctx context.Context, ids []model.SubjectID) ([]*model.Subject, error) {
	subjectIDs := make([]model.SubjectID, 0, len(ids))
	for _, id := range ids {
		if bloom.SubjectExists(id) {
			subjectIDs = append(subjectIDs, id)
		}
	}

	sql := `
		SELECT * FROM subjects
		WHERE subject_id IN ?
	`

	return store.DBReadThrough[model.SubjectID, *model.Subject](ctx, subjectIDs, sql, []any{ids})
}

func GetGlobal(ctx context.Context) ([]*model.Subject, error) {
	sql := "SELECT * FROM subjects"

	return db.DBRaw[*model.Subject](ctx, sql)
}

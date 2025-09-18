package bloom

import (
	"context"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/db"
	"github.com/bits-and-blooms/bloom/v3"
)

var SubjectFilter *bloom.BloomFilter

func Init() error {
	sql := "SELECT subject_id from subjects"

	ids, err := db.DBRaw[int](context.Background(), sql)
	if err != nil {
		return err
	}

	n := uint(len(ids))
	fp := 0.001
	SubjectFilter = bloom.NewWithEstimates(n, fp)

	for _, id := range ids {
		SubjectFilter.Add(fmt.Append(nil, id))
	}

	return nil
}

func SubjectExists(id model.SubjectID) bool {
	return SubjectFilter.Test(fmt.Append(nil, id))
}
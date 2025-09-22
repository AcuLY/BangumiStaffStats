package sequel

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/subject"
	m "github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

func ExtractMains(ctx context.Context, subjs []*m.Subject, perToSubjs map[*m.Person][]*m.Subject) (map[*m.Person][]*m.Subject, int, error) {
	seqs := buildSequels(subjs)
	if err := load(ctx, &seqs); err != nil {
		return nil, 0, err
	}

	seriesCnt := countSeries(seqs)

	perToMains := make(map[*m.Person][]*m.Subject, len(perToSubjs))
	for per, subjs := range perToSubjs {
		mains := mainSubjects(subjs, seqs)
		perToMains[per] = mains
	}

	return perToMains, seriesCnt, nil
}

func buildSequels(subjs []*m.Subject) []*m.Sequel {
	seqs := make([]*m.Sequel, 0, len(subjs))
	for _, subj := range subjs {
		seqs = append(seqs, &m.Sequel{SubjectID: subj.ID})
	}
	return seqs
}

func countSeries(seqs []*m.Sequel) int {
	seriesSet := make(map[int]struct{}, len(seqs))
	for _, seq := range seqs {
		seriesSet[seq.SeriesID] = struct{}{}
	}
	return len(seriesSet)
}

func mainSubjects(subjs []*m.Subject, seqs []*m.Sequel) []*m.Subject {
	subjToSeq := m.ToIDMap(seqs)
	subjsBySeries := make(map[int][]*m.Subject, len(subjs)) // 按系列聚合
	for _, subj := range subjs {
		ser := subjToSeq[subj.ID]
		subjsBySeries[ser.SeriesID] = append(subjsBySeries[ser.SeriesID], subj)
	}

	mainSubjs := make([]*m.Subject, 0, len(subjs))
	for _, subjs := range subjsBySeries {
		sort.Slice(subjs, func(i, j int) bool {
			return subjToSeq[subjs[i].ID].Order < subjToSeq[subjs[j].ID].Order
		})

		mainSubjs = append(mainSubjs, &m.Subject{
			ID:       subjs[0].ID,
			Name:     subjs[0].Name,
			NameCN:   subjs[0].NameCN,
			Favorite: subjs[0].Favorite,
			Image:    subjs[0].Image,
			Rate:     subject.CalcAverage(subjs),
		})
	}

	return mainSubjs
}

func load(ctx context.Context, seqs *[]*m.Sequel) error {
	sql := `
		SELECT * FROM sequels
		WHERE subject_id IN ?
	`
	condFunc := func(seqs []*m.Sequel) []any {
		return []any{m.ToIDs(seqs)}
	}

	return store.DBReadThrough(ctx, seqs, sql, condFunc)
}

package sequel

import (
	"context"

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

	subjToSeq := m.ToIDMap(seqs)
	perToMains := make(map[*m.Person][]*m.Subject, len(perToSubjs))
	for per, subjs := range perToSubjs {
		mains := mainSubjects(subjs, subjToSeq)
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

func mainSubjects(subjs []*m.Subject, subjToSeq map[int]*m.Sequel) []*m.Subject {
	subjsBySeries := make(map[int][]*m.Subject, len(subjs)) // 按系列聚合
	for _, subj := range subjs {
		ser := subjToSeq[subj.ID]
		subjsBySeries[ser.SeriesID] = append(subjsBySeries[ser.SeriesID], subj)
	}

	mainSubjs := make([]*m.Subject, 0, len(subjs))
	for _, subjs := range subjsBySeries {
		mainSubj := subjs[0]
		for _, subj := range subjs {
			if subjToSeq[subj.ID].Order < subjToSeq[mainSubj.ID].Order {
				mainSubj = subj
			}
		}

		mainSubjs = append(mainSubjs, &m.Subject{
			ID:       mainSubj.ID,
			Name:     mainSubj.Name,
			NameCN:   mainSubj.NameCN,
			Favorite: mainSubj.Favorite,
			Image:    mainSubj.Image,
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

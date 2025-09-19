package sequel

import (
	"context"
	"sort"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/subject"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store"
)

type (
	Subject = model.Subject
	Person  = model.Person
	Sequel  = model.Sequel
)

func ExtractMains(ctx context.Context, subjs []*Subject, perToSubjs map[*Person][]*Subject) (map[*Person][]*Subject, int, error) {
	seqs := buildSequels(subjs)
	if err := load(ctx, &seqs); err != nil {
		return nil, 0, err
	}

	seriesCnt := countSeries(seqs)

	perToMains := make(map[*Person][]*Subject, len(perToSubjs))
	for per, subjs := range perToSubjs {
		mains := mainSubjects(subjs, seqs)
		perToMains[per] = mains
	}

	return perToMains, seriesCnt, nil
}

func buildSequels(subjs []*Subject) []*Sequel {
	seqs := make([]*Sequel, 0, len(subjs))
	for _, subj := range subjs {
		seqs = append(seqs, &Sequel{SubjectID: subj.ID})
	}
	return seqs
}

func countSeries(seqs []*Sequel) int {
	seriesSet := make(map[int]struct{}, len(seqs))
	for _, seq := range seqs {
		seriesSet[seq.SeriesID] = struct{}{}
	}
	return len(seriesSet)
}

func mainSubjects(subjs []*Subject, seqs []*Sequel) []*Subject {
	subjToSeq := model.ToIDMap(seqs)
	subjsBySeries := make(map[int][]*Subject, len(subjs)) // 按系列聚合
	for _, subj := range subjs {
		ser := subjToSeq[subj.ID]
		subjsBySeries[ser.SeriesID] = append(subjsBySeries[ser.SeriesID], subj)
	}

	mainSubjs := make([]*Subject, 0, len(subjs))
	for _, subjs := range subjsBySeries {
		sort.Slice(subjs, func(i, j int) bool {
			return subjToSeq[subjs[i].ID].Order < subjToSeq[subjs[j].ID].Order
		})

		mainSubjs = append(mainSubjs, &Subject{
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

func load(ctx context.Context, seqs *[]*Sequel) error {
	sql := `
		SELECT * FROM sequels
		WHERE subject_id IN ?
	`
	condFunc := func(seqs []*Sequel) []any {
		return []any{model.ToIDs(seqs)}
	}

	return store.DBReadThrough(ctx, seqs, sql, condFunc)
}

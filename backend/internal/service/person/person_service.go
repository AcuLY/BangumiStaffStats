package person

import (
	"context"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	repository "github.com/AcuLY/BangumiStaffStats/backend/internal/repository/person"
	"golang.org/x/sync/errgroup"
)

// PersonSubjectsMap 创建一个人物到其参与的作品列表的映射
func PersonSubjectsMap(ctx context.Context, subjects []*model.Subject, positionIDs []int) (map[*model.Person][]*model.Subject, error) {
	peronIDToSubjects := make(map[int][]*model.Subject)
	idToPerson := make(map[int]*model.Person)

	g := new(errgroup.Group)
	var mu sync.Mutex

	for _, s := range subjects {
		g.Go(func() error {
			people, err := repository.FindBySubjectAndPosition(ctx, s, positionIDs)
			if err != nil {
				return err
			}

			mu.Lock()
			for _, p := range people {
				peronIDToSubjects[p.ID] = append(peronIDToSubjects[p.ID], s)
				idToPerson[p.ID] = p
			}
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	personSubjects := make(map[*model.Person][]*model.Subject)
	for id, subjects := range peronIDToSubjects {
		person := idToPerson[id]
		personSubjects[person] = subjects
	}

	return personSubjects, nil
}

// LoadInfos 加载人物的完整信息
func LoadInfos(ctx context.Context, personSubjects map[*model.Person][]*model.Subject) error {
	g := new(errgroup.Group)

	for p := range personSubjects {
		g.Go(func() error {
			return repository.Find(ctx, p)
		})
	}

	return g.Wait()
}

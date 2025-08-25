package character

import (
	"context"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	repository "github.com/AcuLY/BangumiStaffStats/backend/internal/repository/character"
	"golang.org/x/sync/errgroup"
)

// findByPerson 获取人物在每个条目中出演的角色
func findByPerson(ctx context.Context, p *model.Person, subjects []*model.Subject, positionIDs []int) ([]*model.Character, error) {
	characterSubject := make(map[model.Character]*model.Subject)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for _, s := range subjects {
		g.Go(func() error {
			charactersBySubject, err := repository.FindByPersonAndSubject(ctx, p, s, positionIDs)
			if err != nil {
				return err
			}

			mu.Lock()
			for _, c := range charactersBySubject {
				if _, exists := characterSubject[c]; !exists {
					characterSubject[c] = s
					continue
				}

				if s.SeriesOrder < characterSubject[c].SeriesOrder {
					characterSubject[c] = s
				}
			}
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	characters := make([]*model.Character, 0, len(characterSubject))
	for c, s := range characterSubject {
		c.BelongingSubject = s
		characters = append(characters, &c)
	}

	return characters, nil
}

// PersonCharactersMap 创建一个人物到其出演的角色列表的映射
func PersonCharactersMap(ctx context.Context, personSubjects map[*model.Person][]*model.Subject, positionIDs []int) (map[*model.Person][]*model.Character, error) {
	personCharacters := make(map[*model.Person][]*model.Character)
	g := new(errgroup.Group)
	var mu sync.Mutex

	for p, subjects := range personSubjects {
		g.Go(func() error {
			characters, err := findByPerson(ctx, p, subjects, positionIDs)
			if err != nil {
				return err
			}

			mu.Lock()
			personCharacters[p] = characters
			mu.Unlock()

			return nil
		})
	}

	if err := g.Wait(); err != nil {
		return nil, err
	}

	return personCharacters, nil
}

// LoadInfos 加载人物出演角色的完整信息
func LoadInfos(ctx context.Context, personCharacters map[*model.Person][]*model.Character) error {
	g := new(errgroup.Group)

	for _, characters := range personCharacters {
		for _, c := range characters {
			g.Go(func() error {
				return repository.Find(ctx, c)
			})
		}
	}

	return g.Wait()
}

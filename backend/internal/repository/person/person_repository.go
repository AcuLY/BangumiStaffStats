package person

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/person"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

// FindBySubjectAndPosition 根据 Subject 和 Position 获取所有的 Person
func FindBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int) ([]*model.Person, error) {
	var people []*model.Person
	var err error
	people, err = cache.FindBySubjectAndPosition(ctx, s, positionIDs)
	if err == nil {
		return people, nil
	} else if err != redis.Nil {
		return nil, err
	}

	var ids []int

	query := `
		SELECT DISTINCT person_id 
		FROM subject_person 
		WHERE subject_id = ? AND position in (?)
	`
	err = repository.DB.
		WithContext(ctx).
		Raw(query, s.ID, positionIDs).
		Scan(&ids).
		Error
	if err != nil {
		logger.Warn("Failed to find person by subject and position: "+err.Error(), repository.DBStats())
		return nil, err
	}

	for _, id := range ids {
		person := &model.Person{ID: id}
		people = append(people, person)
	}

	go func() {
		if err := cache.SaveBySubjectAndPosition(context.Background(), s, positionIDs, people); err != nil {
			logger.Warn("Failed to set subject position cache: " + err.Error())
		}
	}()

	return people, nil
}

// Find 填充 Person 的完整信息
func Find(ctx context.Context, p *model.Person) error {
	if err := cache.Find(ctx, p); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	err := repository.DB.
		WithContext(ctx).
		Table("people").
		Where("person_id = ?", p.ID).
		First(p).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find person: "+err.Error(), 
			logger.Field("person_id", p.ID),
			repository.DBStats(),
		)
		return nil
	}

	go func() {
		if err := cache.Save(context.Background(), p); err != nil {
			logger.Warn("Failed to set person cache: " + err.Error())
		}
	}()

	return nil
}

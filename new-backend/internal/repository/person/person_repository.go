package person

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/internal/cache/person"
	"github.com/AcuLY/BangumiStaffStats/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
	"github.com/redis/go-redis/v9"
)

func FindPeopleBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int) ([]*model.Person, error) {
	var people []*model.Person
	var err error
	people, err = cache.GetPeopleBySubjectAndPosition(ctx, s, positionIDs)
	if err == nil {
		return people, nil
	} else if err != redis.Nil {
		return nil, err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	var ids []int
	err = repository.DB.WithContext(ctx).Raw("SELECT person_id FROM subject_person WHERE subject_id = ? AND position in (?)", s.ID, positionIDs).Scan(&ids).Error
	if err != nil {
		return nil, err
	}

	for _, id := range ids {
		person := &model.Person{ID: id}
		people = append(people, person)
	}

	go func() {
		if err := cache.SetPeopleBySubjectAndPosition(context.Background(), s, positionIDs, people); err != nil {
			logger.Warn("Failed to set subject position cache: " + err.Error())
		}
	}()

	return people, nil
}

func FindPerson(ctx context.Context, p *model.Person) error {
	if err := cache.GetPerson(ctx, p); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	if err := repository.DB.WithContext(ctx).Table("people").Where("person_id = ?", p.ID).First(p).Error; err != nil {
		logger.Warn("Person not found.", logger.Field("person_id", p.ID))
		return nil
	}

	go func() {
		if err := cache.SetPerson(context.Background(), p); err != nil {
			logger.Warn("Failed to set person cache: " + err.Error())
		}
	}()

	return nil
}
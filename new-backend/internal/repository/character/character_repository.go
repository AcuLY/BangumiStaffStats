package character

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/internal/cache/character"
	"github.com/AcuLY/BangumiStaffStats/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
	"github.com/redis/go-redis/v9"
)

func FindCharactersByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject) ([]model.Character, error) {
	characters, err := cache.GetCharactersByPersonAndSubject(ctx, p, s)
	if err == nil {
		return characters, nil
	} else if err != redis.Nil {
		return nil, err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	var ids []int
	err = repository.DB.WithContext(ctx).Raw("SELECT character_id FROM person_character WHERE subject_id = ? AND person_id = ?", s.ID, p.ID).Scan(&ids).Error
	if err != nil {
		logger.Warn("Character not found.", logger.Field("subject_id", s.ID), logger.Field("person_id", p.ID))
		return nil, nil
	}
	
	characters = make([]model.Character, 0, len(ids))
	for _, id := range ids {
		character := model.Character{ID: id}
		characters = append(characters, character)
	}

	go func() {
		if err := cache.SetCharactersByPersonAndSubject(context.Background(), p, s, characters); err != nil {
			logger.Warn("Failed to set person character cache: " + err.Error())
		}
	}()

	return characters, nil
}

func FindCharacter(ctx context.Context, c *model.Character) error {
	if err := cache.GetCharacter(ctx, c); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	repository.Semaphore <- struct{}{}
	defer func() { <-repository.Semaphore }()

	if err := repository.DB.WithContext(ctx).Table("characters").Where("character_id = ?", c.ID).First(&c).Error; err != nil {
		logger.Warn("Character not found.", logger.Field("character_id", c.ID))
		return nil
	}

	go func() {
		if err := cache.SetCharacter(context.Background(), c); err != nil {
			logger.Warn("Failed to set character: " + err.Error())
		}
	}()

	return nil
}
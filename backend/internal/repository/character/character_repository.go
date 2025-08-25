package character

import (
	"context"

	cache "github.com/AcuLY/BangumiStaffStats/backend/internal/cache/character"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

// FindByPersonAndSubject 根据传入的 Person 与 Subject 查找所有 Character，返回含 ID 的 Character 列表
func FindByPersonAndSubject(ctx context.Context, p *model.Person, s *model.Subject, positionIDs []int) ([]model.Character, error) {
	characters, err := cache.FindByPersonAndSubject(ctx, p, s)
	if err == nil {
		return characters, nil
	} else if err != redis.Nil {
		return nil, err
	}

	var characterAndPosition []struct {
		CharacterID int
		Position  int
	}

	query := `
		SELECT character_id, position 
		FROM person_character 
		WHERE subject_id = ? AND person_id = ?
	`
	err = repository.DB.
		WithContext(ctx).
		Raw(query, s.ID, p.ID).
		Scan(&characterAndPosition).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find character by person and subject: "+err.Error(),
			logger.Field("subject_id", s.ID),
			logger.Field("person_id", p.ID),
			repository.DBStats(),
		)
		return nil, nil
	}

	characters = make([]model.Character, 0, len(characterAndPosition))
	for _, item := range characterAndPosition {
		for _, positionID := range positionIDs {
			if positionID == item.Position {
				character := model.Character{ID: item.CharacterID}
				characters = append(characters, character)
			}
		}
	}

	go func() {
		if err := cache.SaveByPersonAndSubject(context.Background(), p, s, characters); err != nil {
			logger.Warn("Failed to set person character cache: " + err.Error())
		}
	}()

	return characters, nil
}

// Find 填充传入的 Character 的完整信息
func Find(ctx context.Context, c *model.Character) error {
	if err := cache.Find(ctx, c); err == nil {
		return nil
	} else if err != redis.Nil {
		return err
	}

	err := repository.DB.
		WithContext(ctx).
		Table("characters").
		Where("character_id = ?", c.ID).
		First(&c).
		Error
	if err != nil {
		logger.Warn(
			"Failed to find character: "+err.Error(),
			logger.Field("character_id", c.ID),
			repository.DBStats(),
		)
		return nil
	}

	go func() {
		if err := cache.Save(context.Background(), c); err != nil {
			logger.Warn("Failed to set character: " + err.Error())
		}
	}()

	return nil
}

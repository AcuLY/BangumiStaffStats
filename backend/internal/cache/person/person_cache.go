package person

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
)

// subjectPeopleKey 创建 subject-person 对应的 Redis Key
func subjectPeopleKey(s *model.Subject, positionIDs []int) string {
	str := make([]string, len(positionIDs))
	for i, id := range positionIDs {
		str[i] = fmt.Sprint(id)
	}
	key := strings.Join(str, "_")
	return fmt.Sprintf("subject:people:%d:position:%s", s.ID, key)
}

// FindBySubjectAndPosition 从缓存根据 Subject 和 Position 获取所有的 Person
func FindBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int) ([]*model.Person, error) {
	key := subjectPeopleKey(s, positionIDs)
	val, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return nil, err
	}

	var ids []int
	err = json.Unmarshal([]byte(val), &ids)
	if err != nil {
		return nil, err
	}

	people := make([]*model.Person, 0, len(ids))
	for _, id := range ids {
		person := &model.Person{ID: id}
		people = append(people, person)
	}

	return people, nil
}

// SaveBySubjectAndPosition 将 Subject 和 Position 对应的所有 Person 存入缓存
func SaveBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int, people []*model.Person) error {
	key := subjectPeopleKey(s, positionIDs)
	ttl := config.Redis.TTL.SubjectPerson.Duration()

	personIDs := make([]int, 0, len(people))
	for _, p := range people {
		personIDs = append(personIDs, p.ID)
	}

	raw, err := json.Marshal(personIDs)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}

// personKey 创建 Person 对应的 Redis Key
func personKey(p *model.Person) string {
	return fmt.Sprintf("person:%d", p.ID)
}

// Find 从缓存填充完整的 Person 信息
func Find(ctx context.Context, p *model.Person) error {
	key := personKey(p)
	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if err := json.Unmarshal([]byte(raw), p); err != nil {
		return err
	}

	return nil
}

// Save 将 Person 的完整信息存入缓存
func Save(ctx context.Context, p *model.Person) error {
	key := personKey(p)
	ttl := config.Redis.TTL.Person.Duration()

	raw, err := json.Marshal(p)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}

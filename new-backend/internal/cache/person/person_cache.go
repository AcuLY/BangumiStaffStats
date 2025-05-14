package person

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/config"
	"github.com/AcuLY/BangumiStaffStats/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
)

func subjectPeopleKey(s *model.Subject, positionIDs []int) string {
	positionKey := strings.Trim(strings.Replace(fmt.Sprint(positionIDs), " ", "_", -1), "[]")
	return fmt.Sprintf("subject:people:%d:position:%s", s.ID, positionKey)
}

func GetPeopleBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int) ([]*model.Person, error) {
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

func SetPeopleBySubjectAndPosition(ctx context.Context, s *model.Subject, positionIDs []int, people []*model.Person) error {
	key := subjectPeopleKey(s, positionIDs)
	ttl := config.Redis.TTL.SubjectPerson.ToHour()
	personIDs := make([]int, 0, len(people))
	for _, p := range people {
		personIDs = append(personIDs, p.ID)
	}
	jsonData, err := json.Marshal(personIDs)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}

func personKey(p *model.Person) string {
	return fmt.Sprintf("person:%d", p.ID)
}

func GetPerson(ctx context.Context, p *model.Person) error {
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

func SetPerson(ctx context.Context, p *model.Person) error {
	key := personKey(p)
	ttl := config.Redis.TTL.Person.ToHour()
	jsonData, err := json.Marshal(p)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, jsonData, ttl).Err()
}
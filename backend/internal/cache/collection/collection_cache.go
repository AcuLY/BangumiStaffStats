package collection

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/redis/go-redis/v9"
)

// key 创建 collection 对应的 Redis Key
func key(query bangumi.CollectionQuery) string {
	return fmt.Sprintf("collection:%s:%d:%d", query.UserID, query.SubjectType, query.CollectionType)
}

// parse 将 Redis 中缓存的值解析为 Subject
func parse(v string) (*model.Subject, error) {
	split := strings.Split(v, ":")

	id, err1 := strconv.Atoi(split[0])
	rate, err2 := strconv.ParseFloat(split[1], 32)
	if err1 != nil || err2 != nil {
		return nil, errors.New("invalid collection cache: " + v)
	}

	userRate := float32(rate)
	subject := &model.Subject{
		ID:       id,
		UserRate: &userRate,
	}
	return subject, nil
}

// Find 查找 Redis 中的用户收藏数据。
func Find(ctx context.Context, query bangumi.CollectionQuery) ([]*model.Subject, error) {
	key := key(query)
	result, err := cache.RDB.LRange(ctx, key, 0, -1).Result()
	if err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return nil, redis.Nil
	}

	collections := make([]*model.Subject, 0, len(result))
	for _, raw := range result {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		subject, err := parse(raw)
		if err != nil {
			logger.Warn("Invalid collection cache", logger.Field("cache string", raw))
			continue
		}

		collections = append(collections, subject)
	}

	return collections, nil
}

// Save 将用户收藏数据存入 Redis。
//
//   - Redis 键格式：collection:<userID>:<subjectType>:<collectionType>
//
//   - Redis 值为一个列表，元素格式为：<subjectID>:<subjectRate>
//
//   - 仅保留条目的 ID 和用户评分（subjectRate 为用户实际打分）
func Save(ctx context.Context, query bangumi.CollectionQuery, collections []*model.Subject) error {
	if len(collections) == 0 {
		return nil
	}

	key := key(query)
	pipe := cache.RDB.TxPipeline()

	pipe.Del(ctx, key)

	values := make([]any, len(collections))
	for i, subject := range collections {
		if subject == nil {
			logger.Warn("Nil subject found when setting collection cache", logger.Field("collections", collections))
			continue
		}
		values[i] = fmt.Sprintf("%d:%2f", subject.ID, *subject.UserRate)
	}
	pipe.RPush(ctx, key, values...)

	ttl := config.Redis.TTL.UserCollection.Duration()
	pipe.Expire(ctx, key, ttl)

	_, err := pipe.Exec(ctx)
	return err
}

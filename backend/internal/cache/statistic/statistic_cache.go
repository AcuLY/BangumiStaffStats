package statistic

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/model"
)

// statisticKey 生成一次查询结果的 redis key
func statisticKey(r *model.Request) string {
	pureReq := clearPaginationFields(r)

	b, err := json.Marshal(pureReq)
	if err != nil {
		logger.Error("Failed to marshal request：" + err.Error())
		return ""
	}

	hash := sha256.Sum256(b)

	return fmt.Sprintf("statistic:%s", hex.EncodeToString(hash[:])[:16])
}

// GetStatistic 从缓存获取某次查询结果并填入传入的 full
func GetStatistic(ctx context.Context, r *model.Request, full *model.Statistics) error {
	key := statisticKey(r)

	raw, err := cache.RDB.Get(ctx, key).Result()
	if err != nil {
		return err
	}

	if err = json.Unmarshal([]byte(raw), full); err != nil {
		return err
	}

	return nil
}

// SetStatistic 将某次查询结果存入缓存
func SetStatistic(ctx context.Context, r *model.Request, full *model.Statistics) error {
	key := statisticKey(r)
	ttl := config.Redis.TTL.Statistic.ToDuration()

	raw, err := json.Marshal(full)
	if err != nil {
		return err
	}

	return cache.RDB.SetEx(ctx, key, raw, ttl).Err()
}

// ClearStatisticCache 去除请求中分页相关的字段，避免分页字段影响缓存的 key
func clearPaginationFields(r *model.Request) *model.Request {
	return &model.Request{
		UserID:          r.UserID,
		Position:        r.Position,
		SubjectType:     r.SubjectType,
		CollectionTypes: r.CollectionTypes,
		PositiveTags:    r.PositiveTags,
		NegativeTags:    r.NegativeTags,
		RateRange:       r.RateRange,
		FavoriteRange:   r.FavoriteRange,
		DateRange:       r.DateRange,
		ShowNSFW:        r.ShowNSFW,
	}
}

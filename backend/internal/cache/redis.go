package cache

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/redis/go-redis/v9"
)

var RDB *redis.Client
var Ctx = context.Background()

func Init() error {
	if config.Redis == nil {
		return errors.New("redis config not initialized")
	}

	RDB = redis.NewClient(&redis.Options{
		Addr:     fmt.Sprintf("%s:%d", config.Redis.Host, config.Redis.Port),
		Password: config.Redis.Password,
		DB:       config.Redis.Db,
		PoolTimeout: time.Minute,
	})

	return RDB.Ping(Ctx).Err()
}

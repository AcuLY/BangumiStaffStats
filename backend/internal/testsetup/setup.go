package testsetup

import (
	"log"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/mysql"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/redis"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/position"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/bloom"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
)

var initialized bool

func Init(configPath string) {
	if initialized {
		return
	}
	if err := config.Init(configPath); err != nil {
		log.Fatal(err.Error())
	}
	if err := logger.Init(); err != nil {
		log.Fatal(err.Error())
	}
	if err := position.Init(); err != nil {
		log.Fatal(err.Error())
	}
	if err := httpclient.Init(); err != nil {
		log.Fatal(err.Error())
	}
	if err := mysql.Init(); err != nil {
		log.Fatal(err.Error())
	}
	if err := redis.Init(); err != nil {
		log.Fatal(err.Error())
	}
	if err := bloom.Init(); err != nil {
		log.Fatal(err.Error())
	}
	initialized = true
}

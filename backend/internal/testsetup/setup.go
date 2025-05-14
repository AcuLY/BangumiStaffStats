package testsetup

import (
	"log"

	"github.com/AcuLY/BangumiStaffStats/config"
	"github.com/AcuLY/BangumiStaffStats/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
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
    if err := httpclient.Init(); err != nil {
		log.Fatal(err.Error())
	}
    if err := repository.Init(); err != nil {
		log.Fatal(err.Error())
	}
    if err := cache.Init(); err != nil {
		log.Fatal(err.Error())
	}
    initialized = true
}
package main

import (
	"log"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/mysql"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/conn/redis"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/core/position"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/handler"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/middleware"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/store/bloom"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func main() {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		log.Fatal("Failed to set local time: " + err.Error())
	}
	time.Local = loc

	if err := config.Init("../config/config.toml"); err != nil {
		log.Fatal("Failed to init config: " + err.Error())
	}
	if err := logger.Init(); err != nil {
		log.Fatal("Failed to init logger: " + err.Error())
	}
	if err := position.Init(); err != nil {
		logger.Fatal("Failed to init position: " + err.Error())
	}
	if err := httpclient.Init(); err != nil {
		logger.Fatal("Failed to init HTTP client: " + err.Error())
	}
	if err := redis.Init(); err != nil {
		logger.Fatal("Failed to init Redis: " + err.Error())
	}
	if err := mysql.Init(); err != nil {
		logger.Fatal("Failed to init MySQL: " + err.Error())
	}
	if err := bloom.Init(); err != nil {
		logger.Fatal("Failed to init Bloom: " + err.Error())
	}

	logger.Info("Initialization completed.")

	gin.SetMode(gin.ReleaseMode)

	r := gin.New()
	r.Use(gzip.Gzip(gzip.DefaultCompression))
	r.Use(gin.Recovery())
	r.Use(gin.LoggerWithWriter(&logger.TimeSlicingWriter{LogPath: config.Log.GinLogPath}))
	r.Use(cors.New(cors.Config{
		AllowOriginFunc: func(origin string) bool {
			return strings.HasPrefix(origin, "http://localhost:") || origin == "https://search.bgmss.fun"
		},
		AllowMethods:     []string{"POST", "OPTIONS"},
		AllowHeaders:     []string{"Content-Type"},
		AllowCredentials: true,
	}))
	r.Use(middleware.RequestTiming())

	r.POST("/statistics", handler.GetStatistics)

	r.Run("0.0.0.0:5000")
}

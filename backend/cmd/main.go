package main

import (
	"log"
	"strings"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/cache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/handler"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/repository"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/gin-contrib/cors"
	"github.com/gin-contrib/gzip"
	"github.com/gin-gonic/gin"
)

func main() {
	if err := config.Init("./config.toml"); err != nil {
		log.Fatal("Failed to init config: " + err.Error())
	}
	if err := logger.Init(); err != nil {
		log.Fatal("Failed to init logger: " + err.Error())
	}
	if err := httpclient.Init(); err != nil {
		logger.Fatal("Failed to init HTTP client: " + err.Error())
	}
	if err := cache.Init(); err != nil {
		logger.Fatal("Failed to init Redis: " + err.Error())
	}
	if err := repository.Init(); err != nil {
		logger.Fatal("Failed to init MySQL: " + err.Error())
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

	r.POST("/statistics", handler.GetStatistics)

	r.Run("0.0.0.0:5000")
}

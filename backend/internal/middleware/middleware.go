package middleware

import (
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/gin-gonic/gin"
)

func RequestTiming() gin.HandlerFunc {
	return func(c *gin.Context) {
		begin := time.Now()

		c.Next()

		timeCost := time.Since(begin)
		logger.Info("Time Cost", logger.Field("second", timeCost))
	}
}

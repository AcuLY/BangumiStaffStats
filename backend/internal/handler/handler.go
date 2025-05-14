package handler

import (
	"context"
	"errors"
	"time"

	"github.com/AcuLY/BangumiStaffStats/internal/service"
	"github.com/AcuLY/BangumiStaffStats/pkg/bangumi"
	"github.com/AcuLY/BangumiStaffStats/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/pkg/logger"
	"github.com/AcuLY/BangumiStaffStats/pkg/model"
	"github.com/gin-gonic/gin"
)

func GetStatistics(c *gin.Context) {
	req := new(model.Request)
	err := c.ShouldBindJSON(req)
	if err != nil {
		logger.Error("Failed to bind request: " + err.Error())
		c.JSON(400, gin.H{"error": "非法请求"})
		return
	}

	begin := time.Now()
	logger.Info("Receive Request.", logger.Field("request", req))

	resp, err := service.Statistics(context.Background(), req)
	if err != nil {
		switch {
		case errors.Is(err, bangumi.ErrInvalidUserID):
			c.JSON(404, gin.H{"error": "找不到用户，请输入正确的 UID"})
			logger.Info("Invalid UserID.", logger.Field("request", req))
		case errors.Is(err, httpclient.ErrNetworkFailed):
			c.JSON(500, gin.H{"error": "网络错误，请稍后再试"})
			logger.Warn("Network Error.")
		default:
			c.JSON(500, gin.H{"error": "未知服务器错误：" + err.Error()})
			logger.Error("Unexpected Error.", logger.Field("error", err.Error()))
		}
		return
	}

	logger.Info("Success.", logger.Field("request", req), logger.Field("time cost", time.Since(begin)), logger.Field("summary count", len(resp.PeopleSummary)))

	c.JSON(200, resp)
}

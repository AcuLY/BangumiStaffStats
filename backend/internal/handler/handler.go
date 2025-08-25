package handler

import (
	"errors"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/constant"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/model"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/service"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/bangumi"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/httpclient"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"github.com/gin-gonic/gin"
)

func GetStatistics(c *gin.Context) {
	req := new(model.Request)
	if err := c.ShouldBindJSON(req); err != nil {
		logger.Warn("Failed to bind request: " + err.Error())
		c.JSON(400, gin.H{"error": "非法请求：" + err.Error()})
		return
	}

	logger.Info("Receive Request.", logger.Field("request", req))

	constant.FillInDefaults(req)

	resp, err := service.Statistics(c.Request.Context(), req)
	if err != nil {
		switch {
		case errors.Is(err, bangumi.ErrInvalidUserID):
			logger.Info("Invalid UserID.", logger.Field("request", req))
			c.JSON(404, gin.H{"error": "找不到用户，请输入正确的 UID"})
		case errors.Is(err, service.ErrNoResultFound):
			logger.Info("No Result Found.", logger.Field("request", req))
			c.JSON(404, gin.H{"error": "找不到符合条件的条目"})
		case errors.Is(err, httpclient.ErrNetworkFailed):
			logger.Error("Network Failed.", logger.Field("error", err.Error()))
			c.JSON(500, gin.H{"error": "服务器网络错误，请稍后再试"})
		case errors.Is(err, service.ErrInvalidPagination):
			logger.Info("Invalid Pagination", logger.Field("request", req))
			c.JSON(404, gin.H{"error": "无效的分页"})
		default:
			logger.Error("Unknown Error.", logger.Field("error", err.Error()))
			c.JSON(500, gin.H{"error": "未知内部错误：" + err.Error()})
		}
		return
	}

	if req.Page == 1 {
		logger.Info(
			"Success.",
			logger.Field("summary count", resp.PersonCount),
			logger.Field("item count", resp.ItemCount),
		)
	}

	c.JSON(200, resp)
}

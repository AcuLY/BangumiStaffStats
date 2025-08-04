package repository

import (
	"errors"
	"fmt"
	"log"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	"go.uber.org/zap"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init() error {
	if config.Mysql == nil {
		return errors.New("MySQL config not initialized")
	}

	dsn := fmt.Sprintf(
		"%s:%s@tcp(%s:%d)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		config.Mysql.User,
		config.Mysql.Password,
		config.Mysql.Host,
		config.Mysql.Port,
		config.Mysql.DatabaseName,
	)

	var err error
	DB, err = gorm.Open(mysql.Open(dsn), &gorm.Config{
		PrepareStmt: true,
		Logger: gormlogger.New(
			log.New(&logger.TimeSlicingWriter{LogPath: config.Log.GormLogPath}, "[GORM] ", log.LstdFlags),
			gormlogger.Config{
				SlowThreshold: time.Second,
				LogLevel:      gormlogger.Warn,
			},
		),
	})
	if err != nil {
		return err
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}
	sqlDB.SetMaxOpenConns(config.Mysql.MaxOpenConnection)
	sqlDB.SetMaxIdleConns(config.Mysql.MaxIdleConnection)
	sqlDB.SetConnMaxLifetime(config.Mysql.MaxLifetime.Duration())

	return nil
}

func DBStats() zap.Field {
	sqlDB, err := DB.DB()
	if err != nil {
		return logger.Field("DB stats", "unable to connect db")
	}
	return logger.Field("DB stats", sqlDB.Stats())
}
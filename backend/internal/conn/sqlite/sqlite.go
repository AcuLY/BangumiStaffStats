package sqlite

import (
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/config"
	"github.com/AcuLY/BangumiStaffStats/backend/pkg/logger"
	sqlitedriver "github.com/glebarez/sqlite"
	"go.uber.org/zap"
	"gorm.io/gorm"
	gormlogger "gorm.io/gorm/logger"
)

var DB *gorm.DB

func Init() error {
	if config.SQLite == nil {
		return errors.New("SQLite config not initialized")
	}

	var err error
	DB, err = gorm.Open(sqlitedriver.Open(readOnlyDSN(config.SQLite.Path)), &gorm.Config{
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
	sqlDB.SetMaxOpenConns(config.SQLite.MaxOpenConnection)
	sqlDB.SetMaxIdleConns(config.SQLite.MaxIdleConnection)
	sqlDB.SetConnMaxLifetime(config.SQLite.MaxLifetime.Duration())

	return nil
}

func readOnlyDSN(path string) string {
	if strings.HasPrefix(path, "file:") {
		return path
	}

	abs, err := filepath.Abs(path)
	if err != nil {
		abs = path
	}
	return fmt.Sprintf(
		"file:%s?mode=ro&cache=shared&_pragma=busy_timeout(5000)&_pragma=query_only(1)",
		filepath.ToSlash(abs),
	)
}

func DBStats() zap.Field {
	sqlDB, err := DB.DB()
	if err != nil {
		return logger.Field("DB stats", "unable to connect db")
	}
	return logger.Field("DB stats", sqlDB.Stats())
}

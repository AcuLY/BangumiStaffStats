package repository

import (
	"errors"
	"fmt"

	"github.com/AcuLY/BangumiStaffStats/config"
	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB
var Semaphore chan struct{}

func Init() error {
	if config.Mysql == nil {
		return errors.New("MySQL config not initialized")
	}

	Semaphore = make(chan struct{}, config.Mysql.MaxConnection)

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
		Logger: logger.Default.LogMode(logger.Silent),
	})
	
	if err != nil {
		return err
	}

	return nil
}
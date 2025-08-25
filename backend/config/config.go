package config

import (
	"time"

	"github.com/BurntSushi/toml"
)

type ttlHour int

func (t ttlHour) Duration() time.Duration {
	return time.Duration(t) * time.Hour
}

type ttlMinute int

func (t ttlMinute) Duration() time.Duration {
	return time.Duration(t) * time.Minute
}

type mainConfig struct {
	AppName string `toml:"appName"`
	Host    string `toml:"host"`
	Port    int    `toml:"port"`
}

type httpConfig struct {
	Timeout       int    `toml:"timeout"`
	RetryWaitTime int    `toml:"retryWaitTime"`
	MaxRetries    int    `toml:"maxRetries"`
	UserAgent     string `toml:"userAgent"`
	RateLimit     int    `toml:"rateLimit"`
	Burst         int    `toml:"burst"`
}

type mysqlConfig struct {
	Host              string    `toml:"host"`
	Port              int       `toml:"port"`
	User              string    `toml:"user"`
	Password          string    `toml:"password"`
	DatabaseName      string    `toml:"databaseName"`
	MaxOpenConnection int       `toml:"maxOpenConnection"`
	MaxIdleConnection int       `toml:"maxIdleConnection"`
	MaxLifetime       ttlMinute `toml:"maxLifetime"`
}

type redisConfig struct {
	Host     string         `toml:"host"`
	Port     int            `toml:"port"`
	Password string         `toml:"password"`
	Db       int            `toml:"db"`
	TTL      redisTTLConfig `toml:"ttl"`
}

type redisTTLConfig struct {
	// 单位为小时
	UserCollection  ttlHour `toml:"userCollection"`
	Subject         ttlHour `toml:"subject"`
	Sequel          ttlHour `toml:"sequel"`
	Person          ttlHour `toml:"person"`
	SubjectPerson   ttlHour `toml:"subjectPerson"`
	Character       ttlHour `toml:"character"`
	PersonCharacter ttlHour `toml:"personCharacter"`
	// 单位为分钟
	Statistic ttlMinute `toml:"statistic"`
}

type logConfig struct {
	AppLogPath  string `toml:"appLogPath"`
	GinLogPath  string `toml:"ginLogPath"`
	GormLogPath string `toml:"gormLogPath"`
}

type rawConfig struct {
	Main  mainConfig  `toml:"main"`
	HTTP  httpConfig  `toml:"http"`
	Mysql mysqlConfig `toml:"mysql"`
	Redis redisConfig `toml:"redis"`
	Log   logConfig   `toml:"log"`
}

var (
	Main  *mainConfig
	HTTP  *httpConfig
	Mysql *mysqlConfig
	Redis *redisConfig
	Log   *logConfig
)

func Init(path string) error {
	var cfg rawConfig
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return err
	}

	Main = &cfg.Main
	HTTP = &cfg.HTTP
	Mysql = &cfg.Mysql
	Redis = &cfg.Redis
	Log = &cfg.Log

	return nil
}

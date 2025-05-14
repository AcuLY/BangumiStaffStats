package config

import (
	"time"

	"github.com/BurntSushi/toml"
)

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
	Host          string `toml:"host"`
	Port          int    `toml:"port"`
	User          string `toml:"user"`
	Password      string `toml:"password"`
	DatabaseName  string `toml:"databaseName"`
	MaxConnection int    `toml:"maxConnection"`
}

type redisConfig struct {
	Host     string         `toml:"host"`
	Port     int            `toml:"port"`
	Password string         `toml:"password"`
	Db       int            `toml:"db"`
	TTL      redisTTLConfig `toml:"ttl"`
}

// 过期时间
type ttl int

// ToHour 将小时数的原始值转为 time.Duration
func (t ttl) ToHour() time.Duration {
	return time.Duration(t) * time.Hour
}

type redisTTLConfig struct {
	// 单位为小时
	UserCollection  ttl `toml:"userCollection"`
	Subject         ttl `toml:"subject"`
	Sequel          ttl `toml:"sequel"`
	Person          ttl `toml:"person"`
	SubjectPerson   ttl `toml:"subjectPerson"`
	Character       ttl `toml:"character"`
	PersonCharacter ttl `toml:"personCharacter"`
}

type logConfig struct {
	AppLogPath string `toml:"appLogPath"`
	GinLogPath string `toml:"ginLogPath"`
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

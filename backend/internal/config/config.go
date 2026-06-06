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

type sqliteConfig struct {
	Path              string    `toml:"path"`
	MaxOpenConnection int       `toml:"maxOpenConnection"`
	MaxIdleConnection int       `toml:"maxIdleConnection"`
	MaxLifetime       ttlMinute `toml:"maxLifetime"`
}

type cacheConfig struct {
	MaxEntries int            `toml:"maxEntries"`
	TTL        cacheTTLConfig `toml:"ttl"`
}

type cacheTTLConfig struct {
	// 单位为小时
	Collection ttlHour `toml:"collection"`
	Subject    ttlHour `toml:"subject"`
	Sequel     ttlHour `toml:"sequel"`
	Person     ttlHour `toml:"person"`
	Credit     ttlHour `toml:"credit"`
	Character  ttlHour `toml:"character"`
	Cast       ttlHour `toml:"cast"`
	// 单位为分钟
	Statistic ttlMinute `toml:"statistic"`
}

type logConfig struct {
	AppLogPath  string `toml:"appLogPath"`
	GinLogPath  string `toml:"ginLogPath"`
	GormLogPath string `toml:"gormLogPath"`
}

type bloomConfig struct {
	FalsePositive float64 `toml:"falsePositive"`
}

type rawConfig struct {
	Main   mainConfig   `toml:"main"`
	HTTP   httpConfig   `toml:"http"`
	SQLite sqliteConfig `toml:"sqlite"`
	Cache  cacheConfig  `toml:"cache"`
	Bloom  bloomConfig  `toml:"bloom"`
	Log    logConfig    `toml:"log"`
}

var (
	Main   *mainConfig
	HTTP   *httpConfig
	SQLite *sqliteConfig
	Cache  *cacheConfig
	Bloom  *bloomConfig
	Log    *logConfig
)

func Init(path string) error {
	var cfg rawConfig
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return err
	}

	applyDefaults(&cfg)

	Main = &cfg.Main
	HTTP = &cfg.HTTP
	SQLite = &cfg.SQLite
	Cache = &cfg.Cache
	Bloom = &cfg.Bloom
	Log = &cfg.Log

	return nil
}

func applyDefaults(cfg *rawConfig) {
	if cfg.SQLite.Path == "" {
		cfg.SQLite.Path = "./data/bgmss.sqlite"
	}
	if cfg.SQLite.MaxOpenConnection == 0 {
		cfg.SQLite.MaxOpenConnection = 8
	}
	if cfg.SQLite.MaxIdleConnection == 0 {
		cfg.SQLite.MaxIdleConnection = 4
	}
	if cfg.SQLite.MaxLifetime == 0 {
		cfg.SQLite.MaxLifetime = 30
	}

	if cfg.Cache.MaxEntries == 0 {
		cfg.Cache.MaxEntries = 1024
	}
	if cfg.Cache.TTL.Collection == 0 {
		cfg.Cache.TTL.Collection = 24
	}
	if cfg.Cache.TTL.Subject == 0 {
		cfg.Cache.TTL.Subject = 168
	}
	if cfg.Cache.TTL.Sequel == 0 {
		cfg.Cache.TTL.Sequel = 168
	}
	if cfg.Cache.TTL.Person == 0 {
		cfg.Cache.TTL.Person = 168
	}
	if cfg.Cache.TTL.Credit == 0 {
		cfg.Cache.TTL.Credit = 168
	}
	if cfg.Cache.TTL.Character == 0 {
		cfg.Cache.TTL.Character = 168
	}
	if cfg.Cache.TTL.Cast == 0 {
		cfg.Cache.TTL.Cast = 168
	}
	if cfg.Cache.TTL.Statistic == 0 {
		cfg.Cache.TTL.Statistic = 10
	}
}

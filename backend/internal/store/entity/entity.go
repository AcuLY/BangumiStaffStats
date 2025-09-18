package entity

import "time"

type KeyObject interface {
	comparable
	Key() string
}

type CacheObject interface {
	comparable
	TTL() time.Duration
}

type DBCacheObject[T KeyObject] interface {
	CacheObject
	KeyObject() T
}
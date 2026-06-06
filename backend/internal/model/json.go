package model

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
)

type JSONRaw []byte

func (j *JSONRaw) Scan(value any) error {
	switch v := value.(type) {
	case nil:
		*j = nil
		return nil
	case []byte:
		*j = append((*j)[:0], v...)
	case string:
		*j = append((*j)[:0], v...)
	default:
		return fmt.Errorf("expected JSON string, got %T", value)
	}
	return nil
}

func (j JSONRaw) Value() (driver.Value, error) {
	if len(j) == 0 {
		return nil, nil
	}
	return string(j), nil
}

func (j JSONRaw) MarshalJSON() ([]byte, error) {
	if len(j) == 0 {
		return []byte("null"), nil
	}
	if json.Valid(j) {
		return j, nil
	}
	return json.Marshal(string(j))
}

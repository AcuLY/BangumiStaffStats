package archive

import (
	"bytes"
	"encoding/json"
	"io"
	"regexp"
	"unicode/utf8"
)

const (
	pointerSchemaVersion = 1
	sqliteFilename       = "bangumi.sqlite"
	maxPointerBytes      = 4096
)

var (
	dataVersionPattern = regexp.MustCompile(`^dv1-[0-9a-f]{64}$`)
	digestPattern      = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
)

type pointer struct {
	PointerSchemaVersion int64  `json:"pointerSchemaVersion"`
	DataVersion          string `json:"dataVersion"`
	ManifestDigest       string `json:"manifestDigest"`
}

func decodePointer(data []byte) (pointer, error) {
	var value pointer
	if len(data) == 0 || len(data) > maxPointerBytes || !utf8.Valid(data) {
		return pointer{}, outcome(CodeArchiveFileInvalid)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return pointer{}, outcome(CodeArchiveFileInvalid)
	}
	var trailing any
	if err := decoder.Decode(&trailing); err != io.EOF {
		return pointer{}, outcome(CodeArchiveFileInvalid)
	}
	if value.PointerSchemaVersion != pointerSchemaVersion ||
		!dataVersionPattern.MatchString(value.DataVersion) ||
		!digestPattern.MatchString(value.ManifestDigest) {
		return pointer{}, outcome(CodeArchiveFileInvalid)
	}
	return value, nil
}

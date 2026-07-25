package observability

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"math"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
)

const maxUpdateStatusBytes = 64 * 1024

var (
	// ErrUpdateStatusPath indicates an unsafe or ambiguous configured source.
	ErrUpdateStatusPath = errors.New("observability: invalid update status path")
	// ErrUpdateStatusInvalid intentionally collapses every file/content failure
	// so neither the configured path nor attacker-controlled content escapes.
	ErrUpdateStatusInvalid = errors.New("observability: invalid update status")

	updateTimeShape = regexp.MustCompile(
		`^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])T` +
			`([01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9]` +
			`(\.[0-9]{1,6})?Z$`,
	)
	updateErrorCodeShape = regexp.MustCompile(
		`^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$`,
	)
)

// UpdateStatus is one closed updater terminal status.
type UpdateStatus string

const (
	UpdateStatusFailed    UpdateStatus = "failed"
	UpdateStatusCanceled  UpdateStatus = "canceled"
	UpdateStatusNoChange  UpdateStatus = "no-change"
	UpdateStatusPublished UpdateStatus = "published"
)

// UpdatePhase is one closed updater phase.
type UpdatePhase string

const (
	UpdatePhasePreflight   UpdatePhase = "preflight"
	UpdatePhaseAcquisition UpdatePhase = "acquisition"
	UpdatePhaseIdentity    UpdatePhase = "identity"
	UpdatePhaseBuild       UpdatePhase = "build"
	UpdatePhaseManifest    UpdatePhase = "manifest"
	UpdatePhaseSmoke       UpdatePhase = "smoke"
	UpdatePhasePublication UpdatePhase = "publication"
	UpdatePhaseComplete    UpdatePhase = "complete"
)

// UpdateTerminalSnapshot deliberately excludes dataVersion and error code.
type UpdateTerminalSnapshot struct {
	Time            time.Time
	Status          UpdateStatus
	Phase           UpdatePhase
	DurationSeconds float64
}

// UpdateStatusSnapshot is the bounded metric-facing status projection.
type UpdateStatusSnapshot struct {
	LastAttempt UpdateTerminalSnapshot
	LastSuccess *UpdateTerminalSnapshot
}

// UpdateStatusReader owns one explicit read-only update-status.json source.
type UpdateStatusReader struct {
	path string
}

// NewUpdateStatusReader validates path shape without reading or creating it.
func NewUpdateStatusReader(path string) (*UpdateStatusReader, error) {
	if path == "" ||
		!filepath.IsAbs(path) ||
		filepath.Clean(path) != path ||
		filepath.Base(path) != "update-status.json" {
		return nil, ErrUpdateStatusPath
	}
	return &UpdateStatusReader{path: path}, nil
}

// Read samples, bounds, and validates the current source without retaining a
// previous value. Missing, replaced-during-read, linked, malformed, and
// unreadable files all fail closed for only the current scrape.
func (reader *UpdateStatusReader) Read() (UpdateStatusSnapshot, error) {
	if reader == nil {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	before, err := os.Lstat(reader.path)
	if err != nil ||
		before.Mode()&os.ModeSymlink != 0 ||
		!before.Mode().IsRegular() ||
		before.Size() < 0 ||
		before.Size() > maxUpdateStatusBytes {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}

	file, err := os.Open(reader.path)
	if err != nil {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	defer file.Close()
	opened, err := file.Stat()
	if err != nil ||
		!opened.Mode().IsRegular() ||
		opened.Size() < 0 ||
		opened.Size() > maxUpdateStatusBytes ||
		!os.SameFile(before, opened) {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	data, err := io.ReadAll(io.LimitReader(file, maxUpdateStatusBytes+1))
	if err != nil || len(data) == 0 || len(data) > maxUpdateStatusBytes {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	status, err := parseUpdateStatus(data)
	if err != nil {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	return status, nil
}

func parseUpdateStatus(data []byte) (UpdateStatusSnapshot, error) {
	if err := rejectDuplicateJSONKeys(data); err != nil {
		return UpdateStatusSnapshot{}, err
	}
	root, err := exactJSONObject(data, "last_attempt", "last_success")
	if err != nil {
		return UpdateStatusSnapshot{}, err
	}
	attempt, err := parseUpdateTerminal(root["last_attempt"])
	if err != nil {
		return UpdateStatusSnapshot{}, err
	}
	result := UpdateStatusSnapshot{LastAttempt: attempt.metricSnapshot}

	successData := bytes.TrimSpace(root["last_success"])
	if bytes.Equal(successData, []byte("null")) {
		return result, nil
	}
	success, err := parseUpdateTerminal(successData)
	if err != nil || !success.successful {
		return UpdateStatusSnapshot{}, ErrUpdateStatusInvalid
	}
	value := success.metricSnapshot
	result.LastSuccess = &value
	return result, nil
}

type parsedUpdateTerminal struct {
	metricSnapshot UpdateTerminalSnapshot
	successful     bool
}

func parseUpdateTerminal(data []byte) (parsedUpdateTerminal, error) {
	object, err := exactJSONObject(
		data,
		"time",
		"status",
		"phase",
		"duration_seconds",
		"dataVersion",
		"error_code",
	)
	if err != nil {
		return parsedUpdateTerminal{}, err
	}

	timeValue, err := strictJSONString(object["time"])
	if err != nil ||
		len(timeValue) < len("0000-01-01T00:00:00Z") ||
		strings.HasPrefix(timeValue, "0000") ||
		!updateTimeShape.MatchString(timeValue) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	parsedTime, err := time.Parse(time.RFC3339Nano, timeValue)
	if err != nil || parsedTime.Location() != time.UTC {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}

	statusValue, err := strictJSONString(object["status"])
	if err != nil {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	status := UpdateStatus(statusValue)
	if !validUpdateStatus(status) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	phaseValue, err := strictJSONString(object["phase"])
	if err != nil {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	phase := UpdatePhase(phaseValue)
	if !validUpdatePhase(phase) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	duration, err := strictJSONNumber(object["duration_seconds"])
	if err != nil || duration < 0 || math.IsNaN(duration) || math.IsInf(duration, 0) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}

	dataVersion, dataVersionNull, err := nullableJSONString(
		object["dataVersion"],
	)
	if err != nil ||
		!dataVersionNull && !validDataVersion(dataVersion) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}
	errorCode, errorCodeNull, err := nullableJSONString(object["error_code"])
	if err != nil ||
		!errorCodeNull &&
			(len(errorCode) > 64 || !updateErrorCodeShape.MatchString(errorCode)) {
		return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
	}

	successful := status == UpdateStatusNoChange ||
		status == UpdateStatusPublished
	switch status {
	case UpdateStatusFailed:
		if errorCodeNull || errorCode == "CANCELED" {
			return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
		}
	case UpdateStatusCanceled:
		if errorCodeNull || errorCode != "CANCELED" {
			return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
		}
	case UpdateStatusNoChange, UpdateStatusPublished:
		if !errorCodeNull {
			return parsedUpdateTerminal{}, ErrUpdateStatusInvalid
		}
	}
	return parsedUpdateTerminal{
		metricSnapshot: UpdateTerminalSnapshot{
			Time:            parsedTime,
			Status:          status,
			Phase:           phase,
			DurationSeconds: duration,
		},
		successful: successful,
	}, nil
}

func exactJSONObject(
	data []byte,
	fields ...string,
) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&object); err != nil || object == nil {
		return nil, ErrUpdateStatusInvalid
	}
	if err := requireJSONEOF(decoder); err != nil || len(object) != len(fields) {
		return nil, ErrUpdateStatusInvalid
	}
	for _, field := range fields {
		if _, present := object[field]; !present {
			return nil, ErrUpdateStatusInvalid
		}
	}
	return object, nil
}

func strictJSONString(data []byte) (string, error) {
	var value string
	decoder := json.NewDecoder(bytes.NewReader(data))
	if err := decoder.Decode(&value); err != nil {
		return "", ErrUpdateStatusInvalid
	}
	if err := requireJSONEOF(decoder); err != nil {
		return "", err
	}
	return value, nil
}

func nullableJSONString(data []byte) (string, bool, error) {
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		return "", true, nil
	}
	value, err := strictJSONString(data)
	return value, false, err
}

func strictJSONNumber(data []byte) (float64, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	var number json.Number
	if err := decoder.Decode(&number); err != nil {
		return 0, ErrUpdateStatusInvalid
	}
	if err := requireJSONEOF(decoder); err != nil {
		return 0, err
	}
	value, err := number.Float64()
	if err != nil {
		return 0, ErrUpdateStatusInvalid
	}
	return value, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var trailing json.RawMessage
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		return ErrUpdateStatusInvalid
	}
	return nil
}

func rejectDuplicateJSONKeys(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	if err := consumeJSONValue(decoder); err != nil {
		return ErrUpdateStatusInvalid
	}
	token, err := decoder.Token()
	if !errors.Is(err, io.EOF) || token != nil {
		return ErrUpdateStatusInvalid
	}
	return nil
}

func consumeJSONValue(decoder *json.Decoder) error {
	token, err := decoder.Token()
	if err != nil {
		return err
	}
	delimiter, structured := token.(json.Delim)
	if !structured {
		return nil
	}
	switch delimiter {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, keyErr := decoder.Token()
			if keyErr != nil {
				return keyErr
			}
			key, ok := keyToken.(string)
			if !ok {
				return ErrUpdateStatusInvalid
			}
			if _, duplicate := seen[key]; duplicate {
				return ErrUpdateStatusInvalid
			}
			seen[key] = struct{}{}
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return ErrUpdateStatusInvalid
		}
	case '[':
		for decoder.More() {
			if err := consumeJSONValue(decoder); err != nil {
				return err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return ErrUpdateStatusInvalid
		}
	default:
		return ErrUpdateStatusInvalid
	}
	return nil
}

func validUpdateStatus(status UpdateStatus) bool {
	switch status {
	case UpdateStatusFailed,
		UpdateStatusCanceled,
		UpdateStatusNoChange,
		UpdateStatusPublished:
		return true
	default:
		return false
	}
}

func validUpdatePhase(phase UpdatePhase) bool {
	switch phase {
	case UpdatePhasePreflight,
		UpdatePhaseAcquisition,
		UpdatePhaseIdentity,
		UpdatePhaseBuild,
		UpdatePhaseManifest,
		UpdatePhaseSmoke,
		UpdatePhasePublication,
		UpdatePhaseComplete:
		return true
	default:
		return false
	}
}

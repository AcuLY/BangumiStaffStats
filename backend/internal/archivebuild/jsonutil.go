package archivebuild

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"strconv"
	"strings"
)

const maxJSONSafeInteger int64 = 9_007_199_254_740_991

func decodeStrictObject(data []byte) (map[string]json.RawMessage, error) {
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.UseNumber()
	token, err := decoder.Token()
	if err != nil || token != json.Delim('{') {
		return nil, fmt.Errorf("object")
	}
	result := make(map[string]json.RawMessage)
	for decoder.More() {
		keyToken, keyErr := decoder.Token()
		key, ok := keyToken.(string)
		if keyErr != nil || !ok {
			return nil, fmt.Errorf("object key")
		}
		if _, exists := result[key]; exists {
			return nil, fmt.Errorf("duplicate key")
		}
		var value json.RawMessage
		if err := decoder.Decode(&value); err != nil {
			return nil, err
		}
		result[key] = bytes.Clone(value)
	}
	if token, err = decoder.Token(); err != nil || token != json.Delim('}') {
		return nil, fmt.Errorf("object end")
	}
	if err := requireJSONEOF(decoder); err != nil {
		return nil, err
	}
	return result, nil
}

func requireJSONEOF(decoder *json.Decoder) error {
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return fmt.Errorf("trailing JSON")
		}
		return err
	}
	return nil
}

func rawString(raw json.RawMessage, nullable bool) (string, error) {
	if nullable && bytes.Equal(raw, []byte("null")) {
		return "", nil
	}
	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", err
	}
	if strings.ContainsRune(value, 0) || !json.Valid(raw) {
		return "", fmt.Errorf("string")
	}
	return value, nil
}

func rawInt(raw json.RawMessage, minimum, maximum int64) (int64, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var number json.Number
	if err := decoder.Decode(&number); err != nil {
		return 0, err
	}
	if err := requireJSONEOF(decoder); err != nil {
		return 0, err
	}
	text := number.String()
	if strings.ContainsAny(text, ".eE+") || text == "-0" || (len(text) > 1 && text[0] == '0') || strings.HasPrefix(text, "-0") {
		return 0, fmt.Errorf("integer spelling")
	}
	value, err := strconv.ParseInt(text, 10, 64)
	if err != nil || value < minimum || value > maximum {
		return 0, fmt.Errorf("integer")
	}
	return value, nil
}

func rawFloat(raw json.RawMessage, minimum, maximum float64) (float64, error) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var number json.Number
	if err := decoder.Decode(&number); err != nil {
		return 0, err
	}
	if err := requireJSONEOF(decoder); err != nil {
		return 0, err
	}
	value, err := strconv.ParseFloat(number.String(), 64)
	if err != nil || math.IsNaN(value) || math.IsInf(value, 0) || value < minimum || value > maximum {
		return 0, fmt.Errorf("number")
	}
	return value, nil
}

func rawBool(raw json.RawMessage) (bool, error) {
	var value bool
	if err := json.Unmarshal(raw, &value); err != nil {
		return false, err
	}
	return value, nil
}

func hasOnlyKeys(value map[string]json.RawMessage, allowed map[string]struct{}) bool {
	for key := range value {
		if _, ok := allowed[key]; !ok {
			return false
		}
	}
	return true
}

func hasRequiredKeys(value map[string]json.RawMessage, required ...string) bool {
	for _, key := range required {
		if _, ok := value[key]; !ok {
			return false
		}
	}
	return true
}

func compactCanonicalJSON(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func prettyCanonicalJSON(value any) ([]byte, error) {
	var output bytes.Buffer
	encoder := json.NewEncoder(&output)
	encoder.SetEscapeHTML(false)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

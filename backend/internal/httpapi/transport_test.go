package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

type decoderFixture struct {
	Value string `json:"value"`
}

type nestedDecoderFixture struct {
	Required string  `json:"required"`
	Optional *string `json:"optional,omitempty"`
	Nested   struct {
		Name string `json:"name"`
	} `json:"nested"`
}

type permissiveCustomTarget struct {
	called bool
}

func (t *permissiveCustomTarget) UnmarshalJSON([]byte) error {
	t.called = true
	return nil
}

func TestDecodeStrictJSONAcceptsOneExactValue(t *testing.T) {
	body := " \n{\"value\":\"ok\"}\t "
	request := jsonRequest(body)
	contextKey := struct{}{}
	request = request.WithContext(context.WithValue(request.Context(), contextKey, "preserved"))

	var observedRaw string
	validator := func(raw json.RawMessage) error {
		observedRaw = string(raw)
		if err := validateDecoderFixture(raw); err != nil {
			return err
		}
		for index := range raw {
			raw[index] = ' '
		}
		return nil
	}
	var destination decoderFixture
	if transportError := DecodeStrictJSON(request, &destination, validator); transportError != nil {
		t.Fatalf("DecodeStrictJSON: %v", transportError)
	}
	if observedRaw != body {
		t.Fatalf("validator raw = %q, want exact %q", observedRaw, body)
	}
	if destination.Value != "ok" {
		t.Fatalf("value = %q", destination.Value)
	}
	if request.Context().Value(contextKey) != "preserved" {
		t.Fatal("request context was replaced")
	}
}

func TestDecodeStrictJSONClassifiesRejections(t *testing.T) {
	testCases := []struct {
		name        string
		body        string
		contentType string
		encoding    string
		destination any
		validator   JSONStructuralValidator
		wantStatus  int
		wantCode    string
	}{
		{name: "missing media", body: `{}`, destination: &decoderFixture{}, wantStatus: 415, wantCode: "UNSUPPORTED_MEDIA_TYPE"},
		{name: "other media", body: `{}`, contentType: "text/plain", destination: &decoderFixture{}, wantStatus: 415, wantCode: "UNSUPPORTED_MEDIA_TYPE"},
		{name: "parameterized media", body: `{}`, contentType: "application/json; charset=utf-8", destination: &decoderFixture{}, wantStatus: 415, wantCode: "UNSUPPORTED_MEDIA_TYPE"},
		{name: "encoded", body: `{}`, contentType: "application/json", encoding: "gzip", destination: &decoderFixture{}, wantStatus: 415, wantCode: "UNSUPPORTED_MEDIA_TYPE"},
		{name: "top-level null", body: `null`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "missing required", body: `{}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "required null", body: `{"value":null}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "empty", body: ``, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_JSON"},
		{name: "truncated", body: `{"value":`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_JSON"},
		{name: "trailing value", body: `{"value":"ok"} {}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_JSON"},
		{name: "unknown field", body: `{"value":"ok","attacker":"secret"}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "wrong type", body: `{"value":1}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "non finite", body: `{"value":NaN}`, contentType: "application/json", destination: &decoderFixture{}, wantStatus: 400, wantCode: "INVALID_JSON"},
		{name: "nil target", body: `{}`, contentType: "application/json", destination: nil, wantStatus: 400, wantCode: "INVALID_REQUEST"},
		{name: "nil validator", body: `{"value":"ok"}`, contentType: "application/json", destination: &decoderFixture{}, validator: nil, wantStatus: 400, wantCode: "INVALID_REQUEST"},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(testCase.body))
			if testCase.contentType != "" {
				request.Header.Set("Content-Type", testCase.contentType)
			}
			if testCase.encoding != "" {
				request.Header.Set("Content-Encoding", testCase.encoding)
			}
			validator := testCase.validator
			if testCase.name != "nil validator" {
				validator = validateDecoderFixture
			}
			transportError := DecodeStrictJSON(request, testCase.destination, validator)
			if transportError == nil {
				t.Fatal("DecodeStrictJSON accepted invalid input")
			}
			if transportError.Status() != testCase.wantStatus || transportError.Code() != testCase.wantCode {
				t.Fatalf(
					"classification = %d %s, want %d %s",
					transportError.Status(),
					transportError.Code(),
					testCase.wantStatus,
					testCase.wantCode,
				)
			}
			if strings.Contains(transportError.Error(), "attacker") ||
				strings.Contains(transportError.Error(), "secret") {
				t.Fatalf("error leaked input: %q", transportError.Error())
			}
		})
	}
}

func TestDecodeStrictJSONRejectsPresentEmptyContentEncoding(t *testing.T) {
	testCases := []struct {
		name   string
		header http.Header
	}{
		{name: "empty", header: http.Header{"Content-Encoding": []string{""}}},
		{name: "whitespace", header: http.Header{"Content-Encoding": []string{" \t "}}},
		{name: "nil values", header: http.Header{"Content-Encoding": nil}},
		{name: "duplicate empty", header: http.Header{"Content-Encoding": []string{"", ""}}},
		{name: "noncanonical key", header: http.Header{"content-encoding": []string{""}}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := jsonRequest(`{"value":"ok"}`)
			for name, values := range testCase.header {
				request.Header[name] = values
			}
			var destination decoderFixture
			if transportError := DecodeStrictJSON(request, &destination, validateDecoderFixture); transportError == nil ||
				transportError.Status() != http.StatusUnsupportedMediaType ||
				transportError.Code() != "UNSUPPORTED_MEDIA_TYPE" {
				t.Fatalf("header %#v classification = %#v", testCase.header, transportError)
			}
		})
	}
}

func TestDecodeStrictJSONRawValidatorOwnsPresenceAndNestedUnknownRules(t *testing.T) {
	validBody := `{"required":"ok","nested":{"name":"nested"}}`
	var validTarget nestedDecoderFixture
	if transportError := DecodeStrictJSON(
		jsonRequest(validBody),
		&validTarget,
		validateNestedDecoderFixture,
	); transportError != nil {
		t.Fatalf("valid nested shape: %v", transportError)
	}
	if validTarget.Required != "ok" || validTarget.Optional != nil ||
		validTarget.Nested.Name != "nested" {
		t.Fatalf("valid target = %#v", validTarget)
	}

	testCases := []struct {
		name string
		body string
	}{
		{name: "missing required", body: `{"nested":{"name":"nested"}}`},
		{name: "required null", body: `{"required":null,"nested":{"name":"nested"}}`},
		{name: "optional nonnullable null", body: `{"required":"ok","optional":null,"nested":{"name":"nested"}}`},
		{name: "nested unknown", body: `{"required":"ok","nested":{"name":"nested","attacker":"secret"}}`},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			destination := nestedDecoderFixture{Required: "unchanged"}
			destination.Nested.Name = "unchanged"
			transportError := DecodeStrictJSON(
				jsonRequest(testCase.body),
				&destination,
				validateNestedDecoderFixture,
			)
			if transportError == nil ||
				transportError.Status() != http.StatusBadRequest ||
				transportError.Code() != "INVALID_REQUEST" {
				t.Fatalf("classification = %#v", transportError)
			}
			if destination.Required != "unchanged" ||
				destination.Nested.Name != "unchanged" {
				t.Fatalf("validator rejection mutated destination: %#v", destination)
			}
		})
	}
}

func TestDecodeStrictJSONValidatorBlocksCustomUnmarshalBypass(t *testing.T) {
	rejection := errors.New("test structural rejection")
	custom := new(permissiveCustomTarget)
	transportError := DecodeStrictJSON(
		jsonRequest(`{"attacker":"secret"}`),
		custom,
		func(json.RawMessage) error { return rejection },
	)
	if transportError == nil || transportError.Code() != "INVALID_REQUEST" {
		t.Fatalf("custom target classification = %#v", transportError)
	}
	if custom.called {
		t.Fatal("custom UnmarshalJSON ran before validator acceptance")
	}

	var generatedUnion wire.SharedQueryV1
	before, err := json.Marshal(generatedUnion)
	if err != nil {
		t.Fatal(err)
	}
	validatorCalled := false
	transportError = DecodeStrictJSON(
		jsonRequest(`{"attacker":"secret"}`),
		&generatedUnion,
		func(raw json.RawMessage) error {
			validatorCalled = true
			return rejectUnknownTestFields(raw, "scope", "positionKeys", "subjectType")
		},
	)
	if transportError == nil || transportError.Code() != "INVALID_REQUEST" {
		t.Fatalf("generated union classification = %#v", transportError)
	}
	after, err := json.Marshal(generatedUnion)
	if err != nil {
		t.Fatal(err)
	}
	if !validatorCalled || !bytes.Equal(before, after) {
		t.Fatalf("generated union changed before acceptance: called=%t before=%s after=%s", validatorCalled, before, after)
	}
}

func TestDecodeStrictJSONMissingValidatorDoesNotMutateDestination(t *testing.T) {
	destination := decoderFixture{Value: "unchanged"}
	transportError := DecodeStrictJSON(
		jsonRequest(`{"value":"replacement"}`),
		&destination,
		nil,
	)
	if transportError == nil || transportError.Code() != "INVALID_REQUEST" {
		t.Fatalf("classification = %#v", transportError)
	}
	if destination.Value != "unchanged" {
		t.Fatalf("destination = %#v", destination)
	}
}

func TestDecodeStrictJSONSizeBoundaryAndBoundedRead(t *testing.T) {
	prefix := `{"value":"`
	suffix := `"}`
	validBody := prefix + strings.Repeat("a", MaxJSONBodyBytes-len(prefix)-len(suffix)) + suffix
	if len(validBody) != MaxJSONBodyBytes {
		t.Fatalf("valid body size = %d", len(validBody))
	}
	var destination decoderFixture
	if transportError := DecodeStrictJSON(
		jsonRequest(validBody),
		&destination,
		validateDecoderFixture,
	); transportError != nil {
		t.Fatalf("boundary body: %v", transportError)
	}

	oversized := jsonRequest(validBody + " ")
	if transportError := DecodeStrictJSON(oversized, &destination, validateDecoderFixture); transportError == nil ||
		transportError.Status() != http.StatusRequestEntityTooLarge ||
		transportError.Code() != "REQUEST_TOO_LARGE" {
		t.Fatalf("oversized body classification = %#v", transportError)
	}

	reader := &countingReader{remaining: MaxJSONBodyBytes * 4}
	request := httptest.NewRequest(http.MethodPost, "/", io.NopCloser(reader))
	request.ContentLength = -1
	request.Header.Set("Content-Type", "application/json")
	if transportError := DecodeStrictJSON(request, &destination, validateDecoderFixture); transportError == nil ||
		transportError.Code() != "REQUEST_TOO_LARGE" {
		t.Fatalf("stream classification = %#v", transportError)
	}
	if reader.read > MaxJSONBodyBytes+1 {
		t.Fatalf("decoder read %d bytes above cap", reader.read)
	}
}

func TestDecodeStrictJSONRejectsMultipleMediaHeaderValues(t *testing.T) {
	request := jsonRequest(`{"value":"ok"}`)
	request.Header.Add("Content-Type", "application/json")
	var destination decoderFixture
	if transportError := DecodeStrictJSON(request, &destination, validateDecoderFixture); transportError == nil ||
		transportError.Code() != "UNSUPPORTED_MEDIA_TYPE" {
		t.Fatalf("classification = %#v", transportError)
	}
}

func TestDecodeStrictJSONRejectsMalformedUTF8(t *testing.T) {
	request := httptest.NewRequest(
		http.MethodPost,
		"/",
		bytes.NewReader([]byte{'{', '"', 'v', 'a', 'l', 'u', 'e', '"', ':', '"', 0xff, '"', '}'}),
	)
	request.Header.Set("Content-Type", "application/json")
	var destination decoderFixture
	if transportError := DecodeStrictJSON(request, &destination, validateDecoderFixture); transportError == nil ||
		transportError.Code() != "INVALID_JSON" {
		t.Fatalf("classification = %#v", transportError)
	}
}

func TestTransportErrorEnvelopeIsGeneratedAndInitialized(t *testing.T) {
	recorder := httptest.NewRecorder()
	writeTransportError(recorder, "server-id", invalidRequestResponse())
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", recorder.Code)
	}
	if recorder.Header().Get("Content-Type") != "application/json" ||
		recorder.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("headers = %#v", recorder.Header())
	}
	var envelope wire.ErrorEnvelopeV1
	if err := json.Unmarshal(recorder.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Error.Code != codeInvalidRequest || envelope.Error.FieldErrors == nil {
		t.Fatalf("error = %#v", envelope.Error)
	}
	if envelope.Meta.RequestId != "server-id" || envelope.Meta.DataVersion != nil {
		t.Fatalf("meta = %#v", envelope.Meta)
	}
}

func FuzzDecodeStrictJSON(f *testing.F) {
	f.Add([]byte(`{"value":"ok"}`))
	f.Add([]byte(`{"unknown":"value"}`))
	f.Add([]byte(`{}`))
	f.Add([]byte(`{"value":null}`))
	f.Add([]byte(`{"value":`))
	f.Add([]byte(`{"value":NaN}`))
	f.Add([]byte(`{"value":"ok"} {}`))
	f.Add([]byte(`{"value":{"nested":{"attacker":"secret"}}}`))
	f.Add([]byte{0xff, 0x00, '{'})
	f.Fuzz(func(t *testing.T, data []byte) {
		if len(data) > MaxJSONBodyBytes+128 {
			data = data[:MaxJSONBodyBytes+128]
		}
		request := httptest.NewRequest(http.MethodPost, "/", bytes.NewReader(data))
		request.Header.Set("Content-Type", "application/json")
		var destination decoderFixture
		if transportError := DecodeStrictJSON(request, &destination, validateDecoderFixture); transportError != nil {
			switch transportError.Code() {
			case "INVALID_JSON", "INVALID_REQUEST", "REQUEST_TOO_LARGE":
			default:
				t.Fatalf("unexpected classification %q", transportError.Code())
			}
		}
	})
}

func validateDecoderFixture(raw json.RawMessage) error {
	object, err := testJSONObject(raw)
	if err != nil {
		return err
	}
	if err := rejectUnknownTestFields(raw, "value"); err != nil {
		return err
	}
	value, present := object["value"]
	if !present || testJSONNull(value) {
		return errors.New("test validator: value is required and non-null")
	}
	return nil
}

func validateNestedDecoderFixture(raw json.RawMessage) error {
	object, err := testJSONObject(raw)
	if err != nil {
		return err
	}
	if err := rejectUnknownTestFields(raw, "required", "optional", "nested"); err != nil {
		return err
	}
	required, present := object["required"]
	if !present || testJSONNull(required) {
		return errors.New("test validator: required is missing or null")
	}
	if optional, present := object["optional"]; present && testJSONNull(optional) {
		return errors.New("test validator: optional is non-nullable")
	}
	nestedRaw, present := object["nested"]
	if !present || testJSONNull(nestedRaw) {
		return errors.New("test validator: nested is missing or null")
	}
	nested, err := testJSONObject(nestedRaw)
	if err != nil {
		return err
	}
	if err := rejectUnknownTestFields(nestedRaw, "name"); err != nil {
		return err
	}
	name, present := nested["name"]
	if !present || testJSONNull(name) {
		return errors.New("test validator: nested name is missing or null")
	}
	return nil
}

func rejectUnknownTestFields(raw json.RawMessage, allowed ...string) error {
	object, err := testJSONObject(raw)
	if err != nil {
		return err
	}
	allowlist := make(map[string]struct{}, len(allowed))
	for _, name := range allowed {
		allowlist[name] = struct{}{}
	}
	for name := range object {
		if _, accepted := allowlist[name]; !accepted {
			return errors.New("test validator: unknown field")
		}
	}
	return nil
}

func testJSONObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var object map[string]json.RawMessage
	if err := json.Unmarshal(raw, &object); err != nil || object == nil {
		return nil, errors.New("test validator: object required")
	}
	return object, nil
}

func testJSONNull(raw json.RawMessage) bool {
	return bytes.Equal(bytes.TrimSpace(raw), []byte("null"))
}

func jsonRequest(body string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(body))
	request.Header.Set("Content-Type", "application/json")
	return request
}

type countingReader struct {
	remaining int
	read      int
}

func (r *countingReader) Read(destination []byte) (int, error) {
	if r.remaining == 0 {
		return 0, io.EOF
	}
	count := len(destination)
	if count > r.remaining {
		count = r.remaining
	}
	for index := 0; index < count; index++ {
		destination[index] = 'x'
	}
	r.remaining -= count
	r.read += count
	return count, nil
}

package wire

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type candidatesCasesFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Cases         []struct {
		ID       string          `json:"id"`
		Request  json.RawMessage `json:"request"`
		Expected struct {
			Status  int             `json:"status"`
			Headers json.RawMessage `json:"headers"`
			Body    json.RawMessage `json:"body"`
		} `json:"expected"`
		Assertions json.RawMessage `json:"assertions,omitempty"`
	} `json:"cases"`
}

type candidatesErrorCasesFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Cases         []struct {
		ID                 string `json:"id"`
		RequestSchemaValid bool   `json:"requestSchemaValid"`
		Request            struct {
			Method string          `json:"method"`
			Body   json.RawMessage `json:"body"`
		} `json:"request"`
		Expected struct {
			Status  int             `json:"status"`
			Headers json.RawMessage `json:"headers"`
			Body    json.RawMessage `json:"body"`
		} `json:"expected"`
	} `json:"cases"`
}

type generatedCandidatesErrorEnvelope struct {
	Error struct {
		Code        PostCandidatesV1400JSONResponseBodyErrorCode                     `json:"code"`
		Message     string                                                           `json:"message"`
		Retryable   bool                                                             `json:"retryable"`
		FieldErrors map[string][]PostCandidatesV1400JSONResponseBodyErrorFieldErrors `json:"fieldErrors"`
	} `json:"error"`
	Meta struct {
		RequestID   string  `json:"requestId"`
		DataVersion *string `json:"dataVersion,omitempty"`
	} `json:"meta"`
}

func TestCandidatesGeneratedWireDecodesSuccessGoldens(t *testing.T) {
	root := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"candidates",
		"cases",
	)
	for _, fixture := range []struct {
		filename string
		scope    string
	}{
		{filename: "global.json", scope: "global"},
		{filename: "personal.json", scope: "personal"},
	} {
		t.Run(fixture.scope, func(t *testing.T) {
			var cases candidatesCasesFile
			decodeCandidatesContractFile(
				t,
				filepath.Join(root, fixture.filename),
				&cases,
			)
			if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
				t.Fatalf("unexpected candidates golden wrapper: %#v", cases)
			}
			for _, selected := range cases.Cases {
				t.Run(selected.ID, func(t *testing.T) {
					if selected.Expected.Status != 200 {
						t.Fatalf("status = %d", selected.Expected.Status)
					}
					var request PostCandidatesV1JSONBody
					decodeCandidatesJSON(t, selected.Request, &request)
					if request.Input.PositionKey == "" {
						t.Fatalf("missing candidate input: %#v", request)
					}
					switch fixture.scope {
					case "global":
						query, err := request.Query.AsPostCandidatesV1JSONBodyQuery1()
						if err != nil || len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated global query = %#v, %v", query, err)
						}
					case "personal":
						query, err := request.Query.AsPostCandidatesV1JSONBodyQuery0()
						if err != nil || query.Uid == "" ||
							len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated personal query = %#v, %v", query, err)
						}
					}
					assertGeneratedCandidatesRoundTrip(t, selected.Request, request)

					var response PostCandidatesV1200JSONResponseBody
					decodeCandidatesJSON(t, selected.Expected.Body, &response)
					switch fixture.scope {
					case "global":
						envelope, err := response.AsPostCandidatesV1200JSONResponseBody1()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Data.WorkUnit.Valid() ||
							!envelope.Meta.Pagination.PageSize.Valid() ||
							len(envelope.Data.Items) > 20 {
							t.Fatalf("generated global response = %#v, %v", envelope, err)
						}
					case "personal":
						envelope, err := response.AsPostCandidatesV1200JSONResponseBody0()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Data.WorkUnit.Valid() ||
							!envelope.Meta.Pagination.PageSize.Valid() ||
							len(envelope.Data.Items) > 20 {
							t.Fatalf("generated personal response = %#v, %v", envelope, err)
						}
					}
					assertGeneratedCandidatesRoundTrip(
						t,
						selected.Expected.Body,
						response,
					)
				})
			}
		})
	}
}

func TestCandidatesGeneratedErrorEnumsDecodeEveryErrorGolden(t *testing.T) {
	filename := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"candidates",
		"cases",
		"errors.json",
	)
	var cases candidatesErrorCasesFile
	decodeCandidatesContractFile(t, filename, &cases)
	if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
		t.Fatalf("unexpected candidates error wrapper: %#v", cases)
	}
	for _, selected := range cases.Cases {
		t.Run(selected.ID, func(t *testing.T) {
			if selected.Expected.Status < 400 || selected.Expected.Status > 599 {
				t.Fatalf("status = %d", selected.Expected.Status)
			}
			var envelope generatedCandidatesErrorEnvelope
			decodeCandidatesJSON(t, selected.Expected.Body, &envelope)
			if !envelope.Error.Code.Valid() ||
				envelope.Error.Message == "" ||
				envelope.Meta.RequestID == "" ||
				envelope.Error.FieldErrors == nil {
				t.Fatalf("invalid generated candidate error: %#v", envelope)
			}
			for path, codes := range envelope.Error.FieldErrors {
				if path == "" || len(codes) == 0 {
					t.Fatalf("invalid field errors at %q: %#v", path, codes)
				}
				for _, code := range codes {
					if !code.Valid() {
						t.Fatalf("unknown generated field error %q", code)
					}
				}
			}
		})
	}
}

func decodeCandidatesContractFile(
	t *testing.T,
	filename string,
	target any,
) {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatalf("read %s: %v", filename, err)
	}
	decodeCandidatesJSON(t, data, target)
}

func decodeCandidatesJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode candidates contract: %v", err)
	}
}

func assertGeneratedCandidatesRoundTrip(
	t *testing.T,
	expected []byte,
	generated any,
) {
	t.Helper()
	actual, err := json.Marshal(generated)
	if err != nil {
		t.Fatalf("marshal generated candidates model: %v", err)
	}
	var expectedValue any
	var actualValue any
	if err := json.Unmarshal(expected, &expectedValue); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(actual, &actualValue); err != nil {
		t.Fatal(err)
	}
	expectedCanonical, err := json.Marshal(expectedValue)
	if err != nil {
		t.Fatal(err)
	}
	actualCanonical, err := json.Marshal(actualValue)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(expectedCanonical, actualCanonical) {
		t.Fatalf(
			"generated round trip changed JSON:\nwant %s\ngot  %s",
			expectedCanonical,
			actualCanonical,
		)
	}
}

package wire

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type rankingsSuccessCasesFile struct {
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

type rankingsErrorCasesFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Cases         []struct {
		ID       string          `json:"id"`
		Request  json.RawMessage `json:"request"`
		Fault    string          `json:"fault,omitempty"`
		Expected struct {
			Status  int             `json:"status"`
			Headers json.RawMessage `json:"headers"`
			Body    json.RawMessage `json:"body"`
		} `json:"expected"`
	} `json:"cases"`
}

type generatedRankingsErrorEnvelope struct {
	Error struct {
		Code        PostRankingsV1400JSONResponseBodyErrorCode                     `json:"code"`
		Message     string                                                         `json:"message"`
		Retryable   bool                                                           `json:"retryable"`
		FieldErrors map[string][]PostRankingsV1400JSONResponseBodyErrorFieldErrors `json:"fieldErrors"`
	} `json:"error"`
	Meta struct {
		RequestID   string  `json:"requestId"`
		DataVersion *string `json:"dataVersion,omitempty"`
	} `json:"meta"`
}

func TestRankingsGeneratedWireDecodesSuccessGoldens(t *testing.T) {
	root := filepath.Join(repositoryRoot(t), "contracts", "goldens", "api", "rankings", "cases")
	for _, fixture := range []struct {
		filename string
		kind     string
		scope    string
	}{
		{filename: "global.json", kind: "rankings-global-success-cases", scope: "global"},
		{filename: "personal.json", kind: "rankings-personal-success-cases", scope: "personal"},
	} {
		t.Run(fixture.scope, func(t *testing.T) {
			var cases rankingsSuccessCasesFile
			decodeRankingsContractFile(t, filepath.Join(root, fixture.filename), &cases)
			if cases.SchemaVersion != 1 || cases.Kind != fixture.kind || len(cases.Cases) == 0 {
				t.Fatalf("unexpected rankings golden wrapper: %#v", cases)
			}

			for _, selected := range cases.Cases {
				t.Run(selected.ID, func(t *testing.T) {
					if selected.Expected.Status != 200 {
						t.Fatalf("status = %d, want 200", selected.Expected.Status)
					}

					var request PostRankingsV1JSONBody
					decodeRankingsJSON(t, selected.Request, &request)
					switch fixture.scope {
					case "global":
						query, err := request.Query.AsPostRankingsV1JSONBodyQuery1()
						if err != nil {
							t.Fatalf("decode generated global query: %v", err)
						}
						if len(query.PositionKeys) == 0 || !query.SubjectType.Valid() {
							t.Fatalf("invalid generated global query: %#v", query)
						}
					case "personal":
						query, err := request.Query.AsPostRankingsV1JSONBodyQuery0()
						if err != nil {
							t.Fatalf("decode generated personal query: %v", err)
						}
						if query.Uid == "" || len(query.CollectionStatuses) == 0 ||
							len(query.PositionKeys) == 0 || !query.SubjectType.Valid() {
							t.Fatalf("invalid generated personal query: %#v", query)
						}
					default:
						t.Fatalf("unhandled scope %q", fixture.scope)
					}
					assertGeneratedRankingsRoundTrip(t, selected.Request, request)

					var response PostRankingsV1200JSONResponseBody
					decodeRankingsJSON(t, selected.Expected.Body, &response)
					switch fixture.scope {
					case "global":
						envelope, err := response.AsPostRankingsV1200JSONResponseBody1()
						if err != nil {
							t.Fatalf("decode generated global response: %v", err)
						}
						if envelope.Meta.RequestId == "" || !envelope.Data.Summary.WorkUnit.Valid() ||
							!envelope.Meta.Pagination.PageSize.Valid() {
							t.Fatalf("invalid generated global envelope: %#v", envelope)
						}
					case "personal":
						envelope, err := response.AsPostRankingsV1200JSONResponseBody0()
						if err != nil {
							t.Fatalf("decode generated personal response: %v", err)
						}
						if envelope.Meta.RequestId == "" || !envelope.Data.Summary.WorkUnit.Valid() ||
							!envelope.Meta.Pagination.PageSize.Valid() {
							t.Fatalf("invalid generated personal envelope: %#v", envelope)
						}
					}
					assertGeneratedRankingsRoundTrip(t, selected.Expected.Body, response)
				})
			}
		})
	}
}

func TestRankingsGeneratedErrorEnumsDecodeEveryErrorGolden(t *testing.T) {
	filename := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"rankings",
		"cases",
		"errors.json",
	)
	var cases rankingsErrorCasesFile
	decodeRankingsContractFile(t, filename, &cases)
	if cases.SchemaVersion != 1 || cases.Kind != "rankings-error-cases" || len(cases.Cases) == 0 {
		t.Fatalf("unexpected rankings error golden wrapper: %#v", cases)
	}

	for _, selected := range cases.Cases {
		t.Run(selected.ID, func(t *testing.T) {
			if selected.Expected.Status < 400 || selected.Expected.Status > 599 {
				t.Fatalf("error status = %d", selected.Expected.Status)
			}
			var envelope generatedRankingsErrorEnvelope
			decodeRankingsJSON(t, selected.Expected.Body, &envelope)
			if !envelope.Error.Code.Valid() || envelope.Error.Message == "" ||
				envelope.Meta.RequestID == "" || envelope.Error.FieldErrors == nil {
				t.Fatalf("invalid generated rankings error envelope: %#v", envelope)
			}
			for path, codes := range envelope.Error.FieldErrors {
				if path == "" || len(codes) == 0 {
					t.Fatalf("invalid field errors at %q: %#v", path, codes)
				}
				for _, code := range codes {
					if !code.Valid() {
						t.Fatalf("unknown generated field error code %q", code)
					}
				}
			}
			assertGeneratedRankingsRoundTrip(t, selected.Expected.Body, envelope)
		})
	}
}

func decodeRankingsContractFile(t *testing.T, filename string, target any) {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatalf("read %s: %v", filename, err)
	}
	decodeRankingsJSON(t, data, target)
}

func decodeRankingsJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode rankings contract: %v", err)
	}
}

func assertGeneratedRankingsRoundTrip(t *testing.T, expected []byte, generated any) {
	t.Helper()
	actual, err := json.Marshal(generated)
	if err != nil {
		t.Fatalf("marshal generated rankings model: %v", err)
	}
	var expectedValue any
	var actualValue any
	if err := json.Unmarshal(expected, &expectedValue); err != nil {
		t.Fatalf("decode expected JSON: %v", err)
	}
	if err := json.Unmarshal(actual, &actualValue); err != nil {
		t.Fatalf("decode generated JSON: %v", err)
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
		t.Fatalf("generated round trip changed JSON:\nwant %s\ngot  %s", expectedCanonical, actualCanonical)
	}
}

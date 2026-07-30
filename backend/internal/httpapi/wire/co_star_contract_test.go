package wire

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type coStarCasesFile struct {
	SchemaVersion int    `json:"schemaVersion"`
	Kind          string `json:"kind"`
	Cases         []struct {
		ID                 string          `json:"id"`
		RequestSchemaValid bool            `json:"requestSchemaValid,omitempty"`
		Request            json.RawMessage `json:"request"`
		Expected           struct {
			Status int             `json:"status"`
			Body   json.RawMessage `json:"body"`
		} `json:"expected"`
		Assertions json.RawMessage `json:"assertions,omitempty"`
	} `json:"cases"`
}

type generatedCoStarErrorEnvelope struct {
	Error struct {
		Code        PostCoStarV1400JSONResponseBodyErrorCode                     `json:"code"`
		Message     string                                                       `json:"message"`
		Retryable   bool                                                         `json:"retryable"`
		FieldErrors map[string][]PostCoStarV1400JSONResponseBodyErrorFieldErrors `json:"fieldErrors"`
	} `json:"error"`
	Meta struct {
		RequestID   string  `json:"requestId"`
		DataVersion *string `json:"dataVersion,omitempty"`
	} `json:"meta"`
}

func TestCoStarGeneratedWireDecodesEverySuccessGolden(t *testing.T) {
	root := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"co-star",
		"cases",
	)
	for _, fixture := range []struct {
		filename string
		scope    string
		kind     string
	}{
		{filename: "global.json", scope: "global", kind: "pair"},
		{filename: "group.json", scope: "global", kind: "group"},
		{filename: "personal.json", scope: "personal", kind: "pair"},
	} {
		t.Run(fixture.filename, func(t *testing.T) {
			var cases coStarCasesFile
			decodeCoStarContractFile(t, filepath.Join(root, fixture.filename), &cases)
			if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
				t.Fatalf("unexpected co-star golden wrapper: %#v", cases)
			}
			for _, selected := range cases.Cases {
				t.Run(selected.ID, func(t *testing.T) {
					if selected.Expected.Status != 200 {
						t.Fatalf("status = %d, want 200", selected.Expected.Status)
					}
					var request PostCoStarV1JSONBody
					decodeCoStarJSON(t, selected.Request, &request)
					if len(request.Input.Participants) < 2 {
						t.Fatalf("invalid generated co-star input: %#v", request.Input)
					}
					switch fixture.scope {
					case "global":
						query, err := request.Query.AsPostCoStarV1JSONBodyQuery1()
						if err != nil || len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated global query = %#v, %v", query, err)
						}
					case "personal":
						query, err := request.Query.AsPostCoStarV1JSONBodyQuery0()
						if err != nil || query.Uid == "" ||
							len(query.CollectionStatuses) == 0 ||
							len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated personal query = %#v, %v", query, err)
						}
					}
					assertGeneratedCoStarRoundTrip(t, selected.Request, request)

					var response PostCoStarV1200JSONResponseBody
					decodeCoStarJSON(t, selected.Expected.Body, &response)
					switch fixture.scope {
					case "global":
						envelope, err := response.AsPostCoStarV1200JSONResponseBody0()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Meta.Pagination.PageSize.Valid() {
							t.Fatalf("generated global response = %#v, %v", envelope, err)
						}
						assertCoStarGlobalKind(t, envelope.Data, fixture.kind)
					case "personal":
						envelope, err := response.AsPostCoStarV1200JSONResponseBody1()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Meta.Pagination.PageSize.Valid() ||
							envelope.Meta.Collection.FetchedAt.IsZero() {
							t.Fatalf("generated personal response = %#v, %v", envelope, err)
						}
						assertCoStarPersonalKind(t, envelope.Data, fixture.kind)
					}
					assertGeneratedCoStarRoundTrip(t, selected.Expected.Body, response)
				})
			}
		})
	}
}

func TestCoStarGeneratedErrorEnumsDecodeEveryErrorGolden(t *testing.T) {
	filename := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"co-star",
		"cases",
		"errors.json",
	)
	var cases coStarCasesFile
	decodeCoStarContractFile(t, filename, &cases)
	if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
		t.Fatalf("unexpected co-star error wrapper: %#v", cases)
	}
	for _, selected := range cases.Cases {
		t.Run(selected.ID, func(t *testing.T) {
			if selected.Expected.Status < 400 || selected.Expected.Status > 599 {
				t.Fatalf("status = %d", selected.Expected.Status)
			}
			var envelope generatedCoStarErrorEnvelope
			decodeCoStarJSON(t, selected.Expected.Body, &envelope)
			if !envelope.Error.Code.Valid() ||
				envelope.Error.Message == "" ||
				envelope.Meta.RequestID == "" ||
				envelope.Error.FieldErrors == nil {
				t.Fatalf("invalid generated co-star error: %#v", envelope)
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

func assertCoStarGlobalKind(
	t *testing.T,
	data PostCoStarV1200JSONResponseBody_0_Data,
	kind string,
) {
	t.Helper()
	switch kind {
	case "pair":
		pair, err := data.AsPostCoStarV1200JSONResponseBody0Data0()
		if err != nil || len(pair.Participants) != 2 || !pair.WorkUnit.Valid() {
			t.Fatalf("generated global pair = %#v, %v", pair, err)
		}
	case "group":
		group, err := data.AsPostCoStarV1200JSONResponseBody0Data1()
		if err != nil || len(group.Participants) < 3 || !group.WorkUnit.Valid() ||
			len(group.Matrix.Pairs) == 0 {
			t.Fatalf("generated global group = %#v, %v", group, err)
		}
	default:
		t.Fatalf("unknown co-star kind %q", kind)
	}
}

func assertCoStarPersonalKind(
	t *testing.T,
	data PostCoStarV1200JSONResponseBody_1_Data,
	kind string,
) {
	t.Helper()
	switch kind {
	case "pair":
		pair, err := data.AsPostCoStarV1200JSONResponseBody1Data0()
		if err != nil || len(pair.Participants) != 2 || !pair.WorkUnit.Valid() {
			t.Fatalf("generated personal pair = %#v, %v", pair, err)
		}
	case "group":
		group, err := data.AsPostCoStarV1200JSONResponseBody1Data1()
		if err != nil || len(group.Participants) < 3 || !group.WorkUnit.Valid() ||
			len(group.Matrix.Pairs) == 0 {
			t.Fatalf("generated personal group = %#v, %v", group, err)
		}
	default:
		t.Fatalf("unknown co-star kind %q", kind)
	}
}

func decodeCoStarContractFile(t *testing.T, filename string, target any) {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatalf("read %s: %v", filename, err)
	}
	decodeCoStarJSON(t, data, target)
}

func decodeCoStarJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode co-star contract: %v", err)
	}
}

func assertGeneratedCoStarRoundTrip(
	t *testing.T,
	expected []byte,
	generated any,
) {
	t.Helper()
	actual, err := json.Marshal(generated)
	if err != nil {
		t.Fatalf("marshal generated co-star model: %v", err)
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

package wire

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

type partnersCasesFile struct {
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

type generatedPartnersErrorEnvelope struct {
	Error struct {
		Code        PostPartnersV1400JSONResponseBodyErrorCode                     `json:"code"`
		Message     string                                                         `json:"message"`
		Retryable   bool                                                           `json:"retryable"`
		FieldErrors map[string][]PostPartnersV1400JSONResponseBodyErrorFieldErrors `json:"fieldErrors"`
	} `json:"error"`
	Meta struct {
		RequestID   string  `json:"requestId"`
		DataVersion *string `json:"dataVersion,omitempty"`
	} `json:"meta"`
}

func TestPartnersGeneratedWireDecodesSuccessGoldens(t *testing.T) {
	root := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"partners",
		"cases",
	)
	for _, fixture := range []struct {
		filename string
		scope    string
	}{
		{filename: "global.json", scope: "global"},
		{filename: "many-identities.json", scope: "global"},
		{filename: "personal.json", scope: "personal"},
	} {
		t.Run(fixture.filename, func(t *testing.T) {
			var cases partnersCasesFile
			decodePartnersContractFile(
				t,
				filepath.Join(root, fixture.filename),
				&cases,
			)
			if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
				t.Fatalf("unexpected partners golden wrapper: %#v", cases)
			}
			for _, selected := range cases.Cases {
				t.Run(selected.ID, func(t *testing.T) {
					if selected.Expected.Status != 200 {
						t.Fatalf("status = %d, want 200", selected.Expected.Status)
					}
					var request PostPartnersV1JSONBody
					decodePartnersJSON(t, selected.Request, &request)
					if request.Input.Source.PersonId <= 0 ||
						len(request.Input.Source.PositionKeys) == 0 {
						t.Fatalf("invalid generated partners input: %#v", request.Input)
					}
					switch fixture.scope {
					case "global":
						query, err := request.Query.AsPostPartnersV1JSONBodyQuery1()
						if err != nil || len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated global query = %#v, %v", query, err)
						}
					case "personal":
						query, err := request.Query.AsPostPartnersV1JSONBodyQuery0()
						if err != nil || query.Uid == "" ||
							len(query.CollectionStatuses) == 0 ||
							len(query.PositionKeys) == 0 ||
							!query.SubjectType.Valid() {
							t.Fatalf("generated personal query = %#v, %v", query, err)
						}
					}
					assertGeneratedPartnersRoundTrip(t, selected.Request, request)

					var response PostPartnersV1200JSONResponseBody
					decodePartnersJSON(t, selected.Expected.Body, &response)
					switch fixture.scope {
					case "global":
						envelope, err := response.AsPostPartnersV1200JSONResponseBody1()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Meta.Pagination.PageSize.Valid() ||
							!envelope.Data.WorkUnit.Valid() ||
							len(envelope.Data.Summary.Leaders) != 3 {
							t.Fatalf("generated global response = %#v, %v", envelope, err)
						}
					case "personal":
						envelope, err := response.AsPostPartnersV1200JSONResponseBody0()
						if err != nil || envelope.Meta.RequestId == "" ||
							!envelope.Meta.Pagination.PageSize.Valid() ||
							!envelope.Data.WorkUnit.Valid() ||
							len(envelope.Data.Summary.Leaders) != 4 {
							t.Fatalf("generated personal response = %#v, %v", envelope, err)
						}
					}
					assertGeneratedPartnersRoundTrip(t, selected.Expected.Body, response)
				})
			}
		})
	}
}

func TestPartnersGeneratedErrorEnumsDecodeEveryErrorGolden(t *testing.T) {
	filename := filepath.Join(
		repositoryRoot(t),
		"contracts",
		"goldens",
		"api",
		"partners",
		"cases",
		"errors.json",
	)
	var cases partnersCasesFile
	decodePartnersContractFile(t, filename, &cases)
	if cases.SchemaVersion != 1 || len(cases.Cases) == 0 {
		t.Fatalf("unexpected partners error wrapper: %#v", cases)
	}
	for _, selected := range cases.Cases {
		t.Run(selected.ID, func(t *testing.T) {
			if selected.Expected.Status < 400 || selected.Expected.Status > 599 {
				t.Fatalf("status = %d", selected.Expected.Status)
			}
			var envelope generatedPartnersErrorEnvelope
			decodePartnersJSON(t, selected.Expected.Body, &envelope)
			if !envelope.Error.Code.Valid() ||
				envelope.Error.Message == "" ||
				envelope.Meta.RequestID == "" ||
				envelope.Error.FieldErrors == nil {
				t.Fatalf("invalid generated partners error: %#v", envelope)
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

func decodePartnersContractFile(t *testing.T, filename string, target any) {
	t.Helper()
	data, err := os.ReadFile(filename)
	if err != nil {
		t.Fatalf("read %s: %v", filename, err)
	}
	decodePartnersJSON(t, data, target)
}

func decodePartnersJSON(t *testing.T, data []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatalf("decode partners contract: %v", err)
	}
}

func assertGeneratedPartnersRoundTrip(
	t *testing.T,
	expected []byte,
	generated any,
) {
	t.Helper()
	actual, err := json.Marshal(generated)
	if err != nil {
		t.Fatalf("marshal generated partners model: %v", err)
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

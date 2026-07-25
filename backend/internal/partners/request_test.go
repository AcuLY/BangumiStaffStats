package partners

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func TestNormalizeOperationExactIntegersAndDefaults(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:2"},
	}
	for _, number := range []string{"1", "1.0", "1e0"} {
		request := Request{
			Input: json.RawMessage(
				`{"source":{"personId":` + number + `,"positionKeys":["staff:anime:2"]}}`,
			),
			View: json.RawMessage(`{"page":` + number + `,"pageSize":10.0}`),
		}
		operation, err := normalizeOperationRequest(effective, request)
		if err != nil {
			t.Fatalf("%s: %v", number, err)
		}
		if operation.Input.Source.PersonID != 1 ||
			operation.View.Page != 1 ||
			operation.View.Sort != SortCount {
			t.Fatalf("%s operation = %+v", number, operation)
		}
	}
}

func TestNormalizeOperationRejectsFractionOverflowAndUnknownFields(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:2"},
	}
	cases := []struct {
		name  string
		input string
		view  string
		path  string
	}{
		{
			name:  "fraction person",
			input: `{"source":{"personId":1.5,"positionKeys":["staff:anime:2"]}}`,
			path:  "/input/source/personId",
		},
		{
			name:  "safe integer overflow",
			input: `{"source":{"personId":9007199254740992,"positionKeys":["staff:anime:2"]}}`,
			path:  "/input/source/personId",
		},
		{
			name:  "duplicate source identity",
			input: `{"source":{"personId":1,"positionKeys":["staff:anime:2","staff:anime:2"]}}`,
			path:  "/input/source/positionKeys/1",
		},
		{
			name:  "unknown nested field",
			input: `{"source":{"personId":1,"positionKeys":["staff:anime:2"],"extra":true}}`,
			path:  "/input/source/extra",
		},
		{
			name:  "fraction page",
			input: `{"source":{"personId":1,"positionKeys":["staff:anime:2"]}}`,
			view:  `{"page":1.25}`,
			path:  "/view/page",
		},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := normalizeOperationRequest(effective, Request{
				Input: json.RawMessage(testCase.input),
				View:  json.RawMessage(testCase.view),
			})
			var failure *Error
			if !errors.As(err, &failure) || failure.Path() != testCase.path {
				t.Fatalf("error = %#v", err)
			}
		})
	}
}

func TestNormalizeOperationValidatesMembershipAndScopeSort(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:2"},
	}
	_, err := normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(
			`{"source":{"personId":1,"positionKeys":["staff:anime:74"]}}`,
		),
	})
	var failure *Error
	if !errors.As(err, &failure) ||
		failure.Path() != "/input/source/positionKeys/0" {
		t.Fatalf("source membership = %v", err)
	}
	_, err = normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(
			`{"source":{"personId":1,"positionKeys":["staff:anime:2"]}}`,
		),
		View: json.RawMessage(`{"sort":"preference"}`),
	})
	if !errors.As(err, &failure) || failure.Path() != "/view/sort" {
		t.Fatalf("global preference = %v", err)
	}
}

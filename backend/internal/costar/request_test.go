package costar

import (
	"encoding/json"
	"errors"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

func TestNormalizeOperationEnforcesTopologyIdentityLimitAndDefaults(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:1", "staff:anime:2"},
	}
	operation, err := normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(`{"participants":[
			{"personId":1.0,"positionKeys":["staff:anime:1"]},
			{"personId":2e0,"positionKeys":["staff:anime:2"]}
		]}`),
	})
	if err != nil {
		t.Fatalf("normalize: %v", err)
	}
	if operation.View.Sort != SortGlobalScore ||
		operation.View.Order != OrderDescending ||
		operation.View.Page != 1 ||
		operation.View.PageSize != 10 {
		t.Fatalf("defaults = %+v", operation.View)
	}

	_, err = normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(`{"participants":[
			{"personId":1,"positionKeys":["staff:anime:1"]},
			{"personId":1,"positionKeys":["staff:anime:2"]}
		]}`),
	})
	var failure *Error
	if !errors.As(err, &failure) ||
		failure.Path() != "/input/participants/1/personId" ||
		failure.FieldCode() != "DUPLICATE" {
		t.Fatalf("duplicate person = %#v", err)
	}

	identities := `["staff:anime:1","staff:anime:2","a","b","c","d","e","f","g","h","i"]`
	_, err = normalizeOperationRequest(query.EffectiveQuery{
		Scope: "global",
		PositionKeys: []string{
			"staff:anime:1", "staff:anime:2",
			"a", "b", "c", "d", "e", "f", "g", "h", "i",
		},
	}, Request{
		Input: json.RawMessage(`{"participants":[
			{"personId":1,"positionKeys":` + identities + `},
			{"personId":2,"positionKeys":` + identities + `}
		]}`),
	})
	if !errors.As(err, &failure) ||
		failure.FieldCode() != string(CodeIdentityLimitExceeded) {
		t.Fatalf("identity limit = %#v", err)
	}
}

func TestNormalizeOperationRejectsUnknownMembershipAndCrossScopeSort(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:1", "staff:anime:2"},
	}
	_, err := normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(`{"participants":[
			{"personId":1,"positionKeys":["staff:anime:1"]},
			{"personId":2,"positionKeys":["staff:anime:99"]}
		]}`),
	})
	var failure *Error
	if !errors.As(err, &failure) ||
		failure.Path() != "/input/participants/1/positionKeys/0" ||
		failure.FieldCode() != string(CodePositionNotFound) {
		t.Fatalf("membership = %#v", err)
	}

	_, err = normalizeOperationRequest(effective, Request{
		Input: json.RawMessage(`{"participants":[
			{"personId":1,"positionKeys":["staff:anime:1"]},
			{"personId":2,"positionKeys":["staff:anime:2"]}
		]}`),
		View: json.RawMessage(`{"sort":"personalScore"}`),
	})
	if !errors.As(err, &failure) || failure.Path() != "/view/sort" {
		t.Fatalf("scope sort = %#v", err)
	}
}

func TestNormalizeOperationRejectsOneAndElevenParticipants(t *testing.T) {
	effective := query.EffectiveQuery{
		Scope:        "global",
		PositionKeys: []string{"staff:anime:1"},
	}
	for name, input := range map[string]string{
		"one": `{"participants":[{"personId":1,"positionKeys":["staff:anime:1"]}]}`,
		"eleven": `{"participants":[
			{"personId":1,"positionKeys":["staff:anime:1"]},
			{"personId":2,"positionKeys":["staff:anime:1"]},
			{"personId":3,"positionKeys":["staff:anime:1"]},
			{"personId":4,"positionKeys":["staff:anime:1"]},
			{"personId":5,"positionKeys":["staff:anime:1"]},
			{"personId":6,"positionKeys":["staff:anime:1"]},
			{"personId":7,"positionKeys":["staff:anime:1"]},
			{"personId":8,"positionKeys":["staff:anime:1"]},
			{"personId":9,"positionKeys":["staff:anime:1"]},
			{"personId":10,"positionKeys":["staff:anime:1"]},
			{"personId":11,"positionKeys":["staff:anime:1"]}
		]}`,
	} {
		t.Run(name, func(t *testing.T) {
			_, err := normalizeOperationRequest(effective, Request{
				Input: json.RawMessage(input),
			})
			var failure *Error
			if !errors.As(err, &failure) ||
				failure.FieldCode() != string(CodeParticipantLimitExceeded) {
				t.Fatalf("error = %#v", err)
			}
		})
	}
}

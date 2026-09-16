package candidates

import (
	"context"
	"encoding/json"
	"testing"
)

func TestUnrestrictedExplicitOperation(t *testing.T) {
	service := newCandidateService(t, loadCandidateArchive(t), nil)
	r := Request{Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`), Input: json.RawMessage(`{"positionKey":"cast:anime:all"}`)}
	result, err := service.Execute(context.Background(), r)
	if err != nil {
		failure, _ := ErrorDetails(err)
		t.Fatalf("%#v path=%s cause=%v", failure, failure.Path(), failure.cause)
	}
	if _, err = result.MarshalEnvelope("unrestricted"); err != nil {
		t.Fatal(err)
	}
}

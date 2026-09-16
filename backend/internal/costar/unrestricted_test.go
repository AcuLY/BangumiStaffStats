package costar

import (
	"context"
	"encoding/json"
	"testing"
)

func TestUnrestrictedExplicitOperation(t *testing.T) {
	service := newCoStarService(t, loadCoStarArchive(t), nil)
	r := Request{Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`), Input: json.RawMessage(`{"participants":[{"personId":100,"positionKeys":["staff:anime:2"]},{"personId":101,"positionKeys":["cast:anime:main"]}]}`)}
	result, err := service.Execute(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = result.MarshalEnvelope("unrestricted"); err != nil {
		t.Fatal(err)
	}
}

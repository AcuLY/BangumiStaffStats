package persondetail

import (
	"context"
	"encoding/json"
	"testing"
)

func TestUnrestrictedDetailAndExactIdentity(t *testing.T) {
	service := newPersonDetailService(t, loadPersonDetailArchive(t), nil)
	r := Request{Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`), Input: json.RawMessage(`{"personId":101}`)}
	all, err := service.Execute(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if !all.Core.CastApplicable || len(all.Works) == 0 {
		t.Fatalf("%+v", all)
	}
	r.Input = json.RawMessage(`{"personId":100,"positionKeys":["staff:anime:2"]}`)
	exact, err := service.Execute(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	if len(exact.Works) != 1 || exact.Core.CastApplicable || exact.Core.QueryDigest != all.Core.QueryDigest {
		t.Fatalf("%+v", exact)
	}
}

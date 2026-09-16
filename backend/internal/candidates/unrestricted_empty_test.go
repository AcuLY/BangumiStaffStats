package candidates

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"
)

func TestUnrestrictedCandidateBrowseEmptyStaffUniverse(t *testing.T) {
	for _, subjectType := range []string{"book", "music", "real"} {
		t.Run(subjectType, func(t *testing.T) {
			service := newCandidateService(t, loadCandidateArchive(t), nil)
			request := Request{
				Query: json.RawMessage(fmt.Sprintf(`{"scope":"global","subjectType":%q,"positionScope":"all","positionKeys":[]}`, subjectType)),
				Input: json.RawMessage(`{"positionKey":null}`),
			}
			got, err := service.Execute(context.Background(), request)
			if err != nil {
				t.Fatalf("empty factual universe must return zero candidates, not an error: %v", err)
			}
			if len(got.page.Items) != 0 {
				t.Fatalf("unexpected candidates without staff credits: %+v", got.page.Items)
			}
			if _, err := got.MarshalEnvelope("unrestricted-empty"); err != nil {
				t.Fatal(err)
			}

			request.Query = json.RawMessage(fmt.Sprintf(`{"scope":"global","subjectType":%q,"positionKeys":[]}`, subjectType))
			if _, err := service.Execute(context.Background(), request); err == nil {
				t.Fatal("ordinary shared query with empty positions was accepted")
			}
		})
	}
}

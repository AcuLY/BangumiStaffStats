package publiccollection

import (
	"context"
	"slices"
	"testing"
	"time"

	collection "github.com/AcuLY/bangumi-collection-go"
)

func TestWishFiveTypes(t *testing.T) {
	for _, typ := range []struct {
		name     string
		external collection.SubjectType
	}{
		{"book", collection.SubjectTypeBook},
		{"anime", collection.SubjectTypeAnime},
		{"music", collection.SubjectTypeMusic},
		{"game", collection.SubjectTypeGame},
		{"real", collection.SubjectTypeReal},
	} {
		for _, statuses := range []struct {
			name  string
			input []string
			want  []collection.CollectionType
		}{
			{"single", []string{"wish"}, []collection.CollectionType{collection.CollectionTypeWish}},
			{"duplicate", []string{"wish", "wish"}, []collection.CollectionType{collection.CollectionTypeWish, collection.CollectionTypeWish}},
		} {
			t.Run(typ.name+"/"+statuses.name, func(t *testing.T) {
				item := validSubject(1, typ.external, collection.CollectionTypeWish, time.Date(2026, time.July, 25, 0, 0, 0, 0, time.UTC))
				item.Rate = 0
				stub := &stubClient{subjects: []*collection.Subject{item}}
				got, err := newSource(stub).Fetch(context.Background(), "alice", typ.name, statuses.input)
				if err != nil {
					t.Fatal(err)
				}
				if stub.calls != 1 || stub.uid != "alice" || stub.subjectType != typ.external {
					t.Fatalf("outbound call: calls=%d uid=%q type=%v, want %v", stub.calls, stub.uid, stub.subjectType, typ.external)
				}
				if !slices.Equal(stub.statuses, statuses.want) {
					t.Fatalf("outbound statuses=%v, want %v", stub.statuses, statuses.want)
				}
				if len(got.Items) != 1 || got.Items[0].Status != "wish" || got.Items[0].Rate != 0 {
					t.Fatalf("%+v", got)
				}
			})
		}
	}
}

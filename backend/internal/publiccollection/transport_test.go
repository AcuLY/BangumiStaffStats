package publiccollection

import (
	"context"
	"fmt"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"reflect"
	"testing"
	"time"

	collection "github.com/AcuLY/bangumi-collection-go"
)

type requestObservation struct {
	method        string
	path          string
	query         url.Values
	authorization string
	cookie        string
	userAgent     string
	accept        string
}

func TestAnonymousSourceUsesLoopbackWithoutCredentials(t *testing.T) {
	t.Parallel()

	requests := make(chan requestObservation, 1)
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- requestObservation{
			method:        request.Method,
			path:          request.URL.Path,
			query:         request.URL.Query(),
			authorization: request.Header.Get("Authorization"),
			cookie:        request.Header.Get("Cookie"),
			userAgent:     request.Header.Get("User-Agent"),
			accept:        request.Header.Get("Accept"),
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(writer, `{
			"data": [{
				"subject_id": 42,
				"subject_type": 2,
				"type": 2,
				"rate": 9,
				"comment": "loopback",
				"tags": ["verified"],
				"updated_at": "2026-07-25T01:02:03Z",
				"vol_status": 5,
				"ep_status": 13,
				"private": false,
				"subject": {
					"id": 42,
					"type": 2,
					"name": "Name",
					"name_cn": "名称"
				}
			}],
			"total": 1,
			"limit": 50,
			"offset": 0
		}`)
	}))
	defer server.Close()

	jar, err := cookiejar.New(nil)
	if err != nil {
		t.Fatalf("cookiejar.New() error = %v", err)
	}
	serverURL, err := url.Parse(server.URL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	jar.SetCookies(serverURL, []*http.Cookie{{
		Name:  "session",
		Value: "must-not-leave-client",
	}})
	httpClient := &http.Client{Jar: jar}
	source := newAnonymousSource(
		collection.WithEndpoint(server.URL),
		collection.WithHTTPClient(httpClient),
		collection.WithMaxRetries(0),
		collection.WithRateLimit(1_000, 100),
	)

	snapshot, err := source.Fetch(
		context.Background(),
		" Alice ",
		"anime",
		[]string{"completed"},
	)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	wantSnapshot := []struct {
		subjectID       int64
		status          string
		rate            int
		comment         string
		tags            []string
		volumeProgress  int
		episodeProgress int
		private         bool
		updatedAt       time.Time
	}{
		{
			subjectID:       42,
			status:          "completed",
			rate:            9,
			comment:         "loopback",
			tags:            []string{"verified"},
			volumeProgress:  5,
			episodeProgress: 13,
			private:         false,
			updatedAt:       time.Date(2026, time.July, 25, 1, 2, 3, 0, time.UTC),
		},
	}
	if len(snapshot.Items) != 1 {
		t.Fatalf("snapshot item count = %d, want 1", len(snapshot.Items))
	}
	item := snapshot.Items[0]
	actualSnapshot := []struct {
		subjectID       int64
		status          string
		rate            int
		comment         string
		tags            []string
		volumeProgress  int
		episodeProgress int
		private         bool
		updatedAt       time.Time
	}{
		{
			subjectID:       item.SubjectID,
			status:          item.Status,
			rate:            item.Rate,
			comment:         item.Comment,
			tags:            item.Tags,
			volumeProgress:  item.VolumeProgress,
			episodeProgress: item.EpisodeProgress,
			private:         item.Private,
			updatedAt:       item.UpdatedAt,
		},
	}
	if !reflect.DeepEqual(actualSnapshot, wantSnapshot) {
		t.Fatalf("snapshot = %#v, want %#v", actualSnapshot, wantSnapshot)
	}

	select {
	case request := <-requests:
		if request.method != http.MethodGet ||
			request.path != "/v0/users/Alice/collections" ||
			request.query.Get("subject_type") != "2" ||
			request.query.Get("type") != "2" ||
			request.query.Get("limit") != "50" ||
			request.query.Get("offset") != "0" {
			t.Fatalf("unexpected upstream request: %#v", request)
		}
		if request.authorization != "" || request.cookie != "" {
			t.Fatalf(
				"anonymous request sent credentials: Authorization=%q Cookie=%q",
				request.authorization,
				request.cookie,
			)
		}
		if request.userAgent != userAgent || request.accept != "application/json" {
			t.Fatalf(
				"request identity = User-Agent:%q Accept:%q",
				request.userAgent,
				request.accept,
			)
		}
	default:
		t.Fatal("loopback server did not observe a request")
	}
}

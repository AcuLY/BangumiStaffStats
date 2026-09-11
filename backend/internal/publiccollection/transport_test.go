package publiccollection

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
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

type deadlineTransport func(*http.Request) (*http.Response, error)

func (transport deadlineTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return transport(request)
}

func TestProductionSourceBoundsEachPageAttempt(t *testing.T) {
	// Exercise New itself without sending public requests. This test is serial
	// because the production client's default transport is process-wide.
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	var observed time.Duration
	http.DefaultTransport = deadlineTransport(func(request *http.Request) (*http.Response, error) {
		deadline, ok := request.Context().Deadline()
		if !ok {
			return nil, fmt.Errorf("page attempt has no deadline")
		}
		observed = time.Until(deadline)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     http.Header{"Content-Type": []string{"application/json"}},
			Body:       io.NopCloser(strings.NewReader(`{"data":[],"total":0,"limit":50,"offset":0}`)),
		}, nil
	})
	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	if _, err := New().Fetch(ctx, "Alice", "anime", []string{"completed"}); err != nil {
		t.Fatal(err)
	}
	if observed <= 9*time.Second || observed > 10*time.Second {
		t.Fatalf("outbound attempt budget = %s, want at most 10s independent of the 90s load", observed)
	}
}

func TestAnonymousSourcePreservesCollectionTypeWhenMetadataDiffers(t *testing.T) {
	t.Parallel()
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(writer, `{
			"data": [{
				"subject_id": 631949, "subject_type": 2, "type": 2,
				"rate": 8, "comment": null, "tags": [],
				"updated_at": "2026-09-07T01:02:03Z",
				"vol_status": 0, "ep_status": 7, "private": false,
				"subject": {"id": 631949, "type": 6, "name": "fixture", "name_cn": "fixture"}
			}], "total": 1, "limit": 50, "offset": 0
		}`)
	}))
	defer server.Close()
	source := newAnonymousSource(collection.WithEndpoint(server.URL))
	snapshot, err := source.Fetch(context.Background(), "fixture-user", "anime", []string{"completed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Items) != 1 {
		t.Fatalf("item count = %d", len(snapshot.Items))
	}
	item := snapshot.Items[0]
	if item.SubjectID != 631949 || item.SubjectType != "anime" ||
		item.Status != "completed" || item.Rate != 8 || item.EpisodeProgress != 7 ||
		item.Comment != "" || item.Tags == nil || len(item.Tags) != 0 {
		t.Fatalf("collection record changed: %+v", item)
	}
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

func TestAnonymousSourceNormalizesNullCommentIntoCompleteSnapshot(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(writer, `{
			"data": [{
				"subject_id": 84,
				"subject_type": 2,
				"type": 2,
				"rate": 8,
				"comment": null,
				"tags": ["synthetic"],
				"updated_at": "2026-07-30T04:05:06Z",
				"vol_status": 3,
				"ep_status": 12,
				"private": false,
				"subject": {
					"id": 84,
					"type": 2,
					"name": "Synthetic fixture",
					"name_cn": "合成测试条目"
				}
			}],
			"total": 1,
			"limit": 50,
			"offset": 0
		}`)
	}))
	defer server.Close()

	source := newAnonymousSource(
		collection.WithEndpoint(server.URL),
		collection.WithHTTPClient(server.Client()),
		collection.WithMaxRetries(0),
		collection.WithRateLimit(1_000, 100),
	)
	snapshot, err := source.Fetch(
		context.Background(),
		"__synthetic_null_comment_fixture__",
		"anime",
		[]string{"completed"},
	)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if len(snapshot.Items) != 1 {
		t.Fatalf("snapshot item count = %d, want 1", len(snapshot.Items))
	}

	item := snapshot.Items[0]
	actualSnapshot := struct {
		subjectID       int64
		subjectType     string
		status          string
		rate            int
		comment         string
		tags            []string
		volumeProgress  int
		episodeProgress int
		private         bool
		updatedAt       time.Time
	}{
		subjectID:       item.SubjectID,
		subjectType:     item.SubjectType,
		status:          item.Status,
		rate:            item.Rate,
		comment:         item.Comment,
		tags:            item.Tags,
		volumeProgress:  item.VolumeProgress,
		episodeProgress: item.EpisodeProgress,
		private:         item.Private,
		updatedAt:       item.UpdatedAt,
	}
	wantSnapshot := struct {
		subjectID       int64
		subjectType     string
		status          string
		rate            int
		comment         string
		tags            []string
		volumeProgress  int
		episodeProgress int
		private         bool
		updatedAt       time.Time
	}{
		subjectID:       84,
		subjectType:     "anime",
		status:          "completed",
		rate:            8,
		comment:         "",
		tags:            []string{"synthetic"},
		volumeProgress:  3,
		episodeProgress: 12,
		private:         false,
		updatedAt:       time.Date(2026, time.July, 30, 4, 5, 6, 0, time.UTC),
	}
	if !reflect.DeepEqual(actualSnapshot, wantSnapshot) {
		t.Fatalf("snapshot = %#v, want %#v", actualSnapshot, wantSnapshot)
	}
}

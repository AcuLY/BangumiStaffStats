package httpapi

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

func TestProgressFlushesBeforeQueryCompletesAndPreservesError(t *testing.T) {
	release := make(chan struct{})
	handler := progressMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		querytiming.Report(r.Context(), "collection_page", "正在获取收藏第 1 页")
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		w.Header().Set("X-Request-ID", "synthetic-id")
		w.Header().Set("Retry-After", "5")
		w.Header().Set("Set-Cookie", "must-not-leak")
		w.WriteHeader(503)
		fmt.Fprint(w, `{"error":{"code":"UPSTREAM_UNAVAILABLE"}}`)
	}))
	server := httptest.NewServer(handler)
	defer server.Close()
	req, _ := http.NewRequest(http.MethodPost, server.URL+routeRankings, strings.NewReader(`{}`))
	req.Header.Set("Accept", "text/event-stream")
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	var received strings.Builder
	for !strings.Contains(received.String(), "collection_page") {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatal(err)
		}
		received.WriteString(line)
	}
	close(release)
	rest, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	received.Write(rest)
	text := received.String()
	if strings.Count(text, "event: result") != 1 || strings.Contains(text, "must-not-leak") || strings.Contains(text, `"phase":"complete"`) {
		t.Fatal(text)
	}
	for _, frame := range strings.Split(text, "\n\n") {
		if !strings.HasPrefix(frame, "event: result\ndata: ") {
			continue
		}
		var result struct {
			Status  int
			Headers map[string]string
			Body    json.RawMessage
		}
		if err := json.Unmarshal([]byte(strings.TrimPrefix(frame, "event: result\ndata: ")), &result); err != nil {
			t.Fatal(err)
		}
		if result.Status != 503 || result.Headers["Retry-After"] != "5" || !strings.Contains(string(result.Body), "UPSTREAM_UNAVAILABLE") {
			t.Fatalf("%+v", result)
		}
	}
}

func TestProgressHTTP1PreservesBodyAfterFirstFrame(t *testing.T) {
	release := make(chan struct{})
	server := httptest.NewServer(progressMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		body, err := io.ReadAll(r.Body)
		if err != nil {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, `{"error":"body closed before handler read"}`)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(body)
	})))
	defer server.Close()
	payload := `{"query":{"scope":"global","subjectType":"anime"}}`
	req, _ := http.NewRequest(http.MethodPost, server.URL+routeRankings, strings.NewReader(payload))
	req.Header.Set("Accept", "text/event-stream")
	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Do(req)
	if err != nil {
		close(release)
		t.Fatal(err)
	}
	defer response.Body.Close()
	reader := bufio.NewReader(response.Body)
	first, err := reader.ReadString('\n')
	close(release)
	if err != nil || first != "event: progress\n" {
		t.Fatalf("first frame: %q, %v", first, err)
	}
	rest, err := io.ReadAll(reader)
	if err != nil || !strings.Contains(string(rest), `"status":200`) || !strings.Contains(string(rest), `"body":`+payload) {
		t.Fatalf("request body lost after early flush: %s, %v", rest, err)
	}
}

func TestProgressDisconnectCancelsWaiterAndJSONRemainsDefault(t *testing.T) {
	canceled := make(chan struct{})
	server := httptest.NewServer(progressMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if querytiming.ProgressObserver(r.Context()) == nil {
			fmt.Fprint(w, `{"data":{}}`)
			return
		}
		<-r.Context().Done()
		close(canceled)
	})))
	defer server.Close()
	ctx, cancel := context.WithCancel(context.Background())
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, server.URL+routeRankings, strings.NewReader(`{}`))
	req.Header.Set("Accept", "text/event-stream")
	response, err := server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	cancel()
	response.Body.Close()
	select {
	case <-canceled:
	case <-time.After(time.Second):
		t.Fatal("disconnected waiter remains active")
	}
	req, _ = http.NewRequest(http.MethodPost, server.URL+routeRankings, strings.NewReader(`{}`))
	response, err = server.Client().Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if string(body) != `{"data":{}}` {
		t.Fatal(string(body))
	}
}

func TestProgressWrapsRuntimeValidationAndDeadline(t *testing.T) {
	for _, tc := range []struct {
		name    string
		handler http.Handler
		timeout time.Duration
		code    string
	}{
		{"validation", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { writeError(w, "test", rankingsInvalidResponse) }), time.Second, "INVALID_REQUEST"},
		{"timeout", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { <-r.Context().Done() }), 5 * time.Millisecond, "UPSTREAM_TIMEOUT"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler := progressMiddleware(runtimeMiddleware(tc.handler, middlewareOptions{requestTimeout: tc.timeout}))
			req := httptest.NewRequest(http.MethodPost, routeRankings, strings.NewReader(`{}`))
			req.Header.Set("Accept", "text/event-stream")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, req)
			if !strings.Contains(response.Body.String(), tc.code) || strings.Count(response.Body.String(), "event: result") != 1 {
				t.Fatal(response.Body.String())
			}
		})
	}
}

type blockedProgressWriter struct {
	header  http.Header
	entered chan struct{}
	release chan struct{}
}

func (w *blockedProgressWriter) Header() http.Header { return w.header }
func (w *blockedProgressWriter) WriteHeader(int)     {}
func (w *blockedProgressWriter) Flush()              {}
func (w *blockedProgressWriter) Write(p []byte) (int, error) {
	select {
	case <-w.entered:
	default:
		close(w.entered)
	}
	<-w.release
	return len(p), nil
}

func TestSlowProgressConsumerDoesNotBlockComputation(t *testing.T) {
	computed := make(chan struct{})
	handler := progressMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for i := 0; i < 10000; i++ {
			querytiming.ReportCount(r.Context(), "compute", "正在分析", i, 10000)
		}
		fmt.Fprint(w, `{"data":{}}`)
		close(computed)
	}))
	writer := &blockedProgressWriter{header: make(http.Header), entered: make(chan struct{}), release: make(chan struct{})}
	req := httptest.NewRequest(http.MethodPost, routeRankings, strings.NewReader(`{}`))
	req.Header.Set("Accept", "text/event-stream")
	done := make(chan struct{})
	go func() { defer close(done); handler.ServeHTTP(writer, req) }()
	<-writer.entered
	select {
	case <-computed:
	case <-time.After(time.Second):
		t.Fatal("slow client blocked worker")
	}
	close(writer.release)
	<-done
}

package httpapi

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/imageproxy"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

func TestImageRouteStreamsExactResponseAndOnlyReviewedRequestMetadata(t *testing.T) {
	var captured imageproxy.Request
	fetcher := imageFetcherFunc(func(_ context.Context, request imageproxy.Request) (*imageproxy.Response, error) {
		captured = request
		return &imageproxy.Response{
			Status:        http.StatusOK,
			ContentType:   "image/jpeg",
			ContentLength: 5,
			ETag:          `"image-v1"`,
			LastModified:  "Wed, 21 Oct 2015 07:28:00 GMT",
			CacheControl:  "public, max-age=60",
			Body:          io.NopCloser(strings.NewReader("image")),
		}, nil
	})
	metrics := newTestMetrics(t)
	handler := imageTestHandler(t, fetcher, metrics)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/images/bangumi/persons/42?type=medium",
		nil,
	)
	request.Header.Set("If-None-Match", `"image-v1"`)
	request.Header.Set("If-Modified-Since", "Wed, 21 Oct 2015 07:28:00 GMT")
	request.Header.Set("Cookie", "secret=1")
	request.Header.Set("Authorization", "Bearer private")
	request.Header.Set("X-Forwarded-Host", "127.0.0.1")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK || response.Body.String() != "image" {
		t.Fatalf("response = %d %q", response.Code, response.Body.String())
	}
	if response.Header().Get("Content-Type") != "image/jpeg" ||
		response.Header().Get("Content-Length") != "5" ||
		response.Header().Get("ETag") != `"image-v1"` ||
		response.Header().Get("Last-Modified") != "Wed, 21 Oct 2015 07:28:00 GMT" ||
		response.Header().Get("Cache-Control") != "public, max-age=60" ||
		response.Header().Get(requestIDHeader) != "router-id" {
		t.Fatalf("response headers = %#v", response.Header())
	}
	if captured.Resource != imageproxy.ResourcePersons || captured.ID != 42 ||
		captured.Type != imageproxy.TypeMedium ||
		captured.IfNoneMatch != `"image-v1"` ||
		captured.IfModifiedSince != "Wed, 21 Oct 2015 07:28:00 GMT" {
		t.Fatalf("proxy request = %#v", captured)
	}

	rendered, err := metrics.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	metricsText := string(rendered)
	if !strings.Contains(
		metricsText,
		`bgmss_http_requests_total{method="GET",operation="image",outcome="success",route="image",status_class="2xx"} 1`,
	) {
		t.Fatalf("image metric missing:\n%s", metricsText)
	}
	if !strings.Contains(
		metricsText,
		`bgmss_upstream_request_experiences_total{outcome="success",upstream="image"} 1`,
	) {
		t.Fatalf("image upstream metric missing:\n%s", metricsText)
	}
	for _, forbidden := range []string{
		"persons", "medium", "secret", "private", "127.0.0.1",
		"person_id", "subject_id", "character_id", "raw_path",
	} {
		if strings.Contains(metricsText, forbidden) {
			t.Fatalf("metric leaked %q:\n%s", forbidden, metricsText)
		}
	}
}

func TestImageUpstreamOutcomeMappingIsClosed(t *testing.T) {
	testCases := map[observability.ImageOutcome]observability.DependencyOutcome{
		observability.ImageOutcomeSuccess:     observability.DependencyOutcomeSuccess,
		observability.ImageOutcomeRejected:    observability.DependencyOutcomeError,
		observability.ImageOutcomeBusy:        observability.DependencyOutcomeRateLimited,
		observability.ImageOutcomeNotFound:    observability.DependencyOutcomeNotFound,
		observability.ImageOutcomeTimeout:     observability.DependencyOutcomeTimeout,
		observability.ImageOutcomeCanceled:    observability.DependencyOutcomeCanceled,
		observability.ImageOutcomeUnavailable: observability.DependencyOutcomeNetworkError,
		observability.ImageOutcomeProtocol:    observability.DependencyOutcomeDecodeError,
		observability.ImageOutcomeStreamError: observability.DependencyOutcomeUpstreamError,
	}
	for input, want := range testCases {
		if got := imageDependencyOutcome(input); got != want {
			t.Fatalf("outcome %q = %q, want %q", input, got, want)
		}
	}
	if got := imageDependencyOutcome(
		observability.ImageOutcome("attacker-value"),
	); got != observability.DependencyOutcomeError {
		t.Fatalf("unknown outcome = %q", got)
	}
}

func TestImageRouteRejectsInvalidShapesBeforeFetch(t *testing.T) {
	var calls atomic.Int64
	handler := imageTestHandler(t, imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
		calls.Add(1)
		return nil, imageproxy.ErrProtocol
	}), newTestMetrics(t))
	invalidPaths := []string{
		"/api/v1/images/bangumi/subjects/0?type=small",
		"/api/v1/images/bangumi/subjects/01?type=small",
		"/api/v1/images/bangumi/subjects/-1?type=small",
		"/api/v1/images/bangumi/subjects/+1?type=small",
		"/api/v1/images/bangumi/subjects/9223372036854775808?type=small",
		"/api/v1/images/bangumi/subjects/1/",
		"/api/v1/images/bangumi/subjects/1/extra?type=small",
		"/api/v1/images/bangumi/users/1?type=small",
		"/api/v1/images/bangumi/subjects/1",
		"/api/v1/images/bangumi/subjects/1?",
		"/api/v1/images/bangumi/subjects/1?type=",
		"/api/v1/images/bangumi/subjects/1?type=original",
		"/api/v1/images/bangumi/subjects/1?type=small&type=large",
		"/api/v1/images/bangumi/subjects/1?type=small&url=http://169.254.169.254",
		"/api/v1/images/bangumi/subjects/1?host=127.0.0.1&type=small",
		"/api/v1/images/bangumi/subjects%2F1?type=small",
		"/api/v1/images/bangumi/subjects/%31?type=small",
	}
	for _, path := range invalidPaths {
		t.Run(path, func(t *testing.T) {
			response := performRequest(handler, http.MethodGet, path)
			assertErrorResponse(t, response, http.StatusBadRequest, codeInvalidRequest, false)
		})
	}

	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/images/bangumi/characters/1?type=common",
		nil,
	)
	request.Header["If-None-Match"] = []string{`"one"`, `"two"`}
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	assertErrorResponse(t, response, http.StatusBadRequest, codeInvalidRequest, false)

	if calls.Load() != 0 {
		t.Fatalf("invalid requests reached fetcher %d times", calls.Load())
	}
}

func TestImageRouteRejectsWrongMethodAndKeepsOtherPathsClosed(t *testing.T) {
	var calls atomic.Int64
	handler := imageTestHandler(t, imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
		calls.Add(1)
		return nil, imageproxy.ErrProtocol
	}), newTestMetrics(t))
	for _, method := range []string{http.MethodPost, http.MethodHead, http.MethodPut, http.MethodOptions} {
		response := performRequest(
			handler,
			method,
			"/api/v1/images/bangumi/subjects/1?type=small",
		)
		assertErrorResponse(t, response, http.StatusMethodNotAllowed, codeInvalidRequest, false)
		if response.Header().Get("Allow") != http.MethodGet {
			t.Fatalf("Allow = %q", response.Header().Get("Allow"))
		}
	}
	for _, path := range []string{
		"/api/v1/images/bangumi",
		"/api/v1/images/bangumix/subjects/1?type=small",
		"/api/v1/images/other/subjects/1?type=small",
		"/api/v1/proxy?url=https://api.bgm.tv/v0/subjects/1/image",
	} {
		response := performRequest(handler, http.MethodGet, path)
		assertErrorResponse(t, response, http.StatusNotFound, codeEntityNotFound, false)
	}
	if calls.Load() != 0 {
		t.Fatalf("rejected requests reached fetcher %d times", calls.Load())
	}
}

func TestImageRouteMapsOnlyStableSafeFailures(t *testing.T) {
	testCases := []struct {
		name      string
		err       error
		status    int
		code      errorCode
		retryable bool
		retry     string
	}{
		{name: "invalid", err: imageproxy.ErrInvalidRequest, status: 400, code: codeInvalidRequest},
		{name: "busy", err: imageproxy.ErrBusy, status: 503, code: codeServerBusy, retryable: true, retry: "1"},
		{name: "not found", err: imageproxy.ErrNotFound, status: 404, code: codeEntityNotFound},
		{name: "timeout", err: imageproxy.ErrTimeout, status: 504, code: codeUpstreamTimeout, retryable: true},
		{name: "active cancellation becomes unavailable", err: imageproxy.ErrCanceled, status: 503, code: codeUpstreamUnavailable, retryable: true},
		{name: "unavailable", err: imageproxy.ErrUnavailable, status: 503, code: codeUpstreamUnavailable, retryable: true},
		{name: "protocol", err: imageproxy.ErrProtocol, status: 502, code: codeUpstreamProtocol, retryable: true},
		{name: "unknown", err: errors.New("private upstream body and URL"), status: 502, code: codeUpstreamProtocol, retryable: true},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			handler := imageTestHandler(t, imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
				return nil, testCase.err
			}), newTestMetrics(t))
			response := performRequest(
				handler,
				http.MethodGet,
				"/api/v1/images/bangumi/subjects/1?type=grid",
			)
			assertErrorResponse(t, response, testCase.status, testCase.code, testCase.retryable)
			if response.Header().Get("Retry-After") != testCase.retry {
				t.Fatalf("Retry-After = %q", response.Header().Get("Retry-After"))
			}
			if strings.Contains(response.Body.String(), "private") ||
				strings.Contains(response.Body.String(), "upstream body") ||
				strings.Contains(response.Body.String(), "URL") {
				t.Fatalf("safe error leaked detail: %q", response.Body.String())
			}
		})
	}
}

func TestImageRouteForwardsReviewed304WithoutBody(t *testing.T) {
	handler := imageTestHandler(t, imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
		return &imageproxy.Response{
			Status:       http.StatusNotModified,
			ETag:         `"image-v1"`,
			CacheControl: "public, max-age=60",
			Body:         http.NoBody,
		}, nil
	}), newTestMetrics(t))
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/v1/images/bangumi/characters/9?type=common",
		nil,
	)
	request.Header.Set("If-None-Match", `"image-v1"`)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNotModified || response.Body.Len() != 0 ||
		response.Header().Get("ETag") != `"image-v1"` ||
		response.Header().Get("Cache-Control") != "public, max-age=60" {
		t.Fatalf("304 response = %d %#v %q", response.Code, response.Header(), response.Body.String())
	}
}

func TestImageRouteEmitsOneClosedTerminalEvent(t *testing.T) {
	var events bytes.Buffer
	metrics := newTestMetrics(t)
	handler := newHandler(nil, metrics, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "image-event-id" },
		metrics:        metrics,
		images: imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
			return &imageproxy.Response{
				Status:        http.StatusOK,
				ContentType:   "image/jpeg",
				ContentLength: 5,
				Body:          io.NopCloser(strings.NewReader("image")),
			}, nil
		}),
		events: observability.NewEventSink(&events),
	})
	response := performRequest(
		handler,
		http.MethodGet,
		"/api/v1/images/bangumi/subjects/42?type=large",
	)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d", response.Code)
	}
	event := events.String()
	for _, required := range []string{
		`"event":"image_proxy_completed"`,
		`"channel":"app"`,
		`"request_id":"image-event-id"`,
		`"operation":"image"`,
		`"outcome":"success"`,
		`"status":200`,
		`"response_bytes":5`,
	} {
		if !strings.Contains(event, required) {
			t.Fatalf("event missing %q: %q", required, event)
		}
	}
	for _, forbidden := range []string{
		"subjects", "large", "/api/", "api.bgm.tv", "type=", "upstream",
		`"resource":`, `"entity_id":`, `"image_type":`,
	} {
		if strings.Contains(event, forbidden) {
			t.Fatalf("event leaked %q: %q", forbidden, event)
		}
	}
	if strings.Count(event, "\n") != 1 {
		t.Fatalf("event count = %q", event)
	}
}

func TestImageRouteAbortsLateStreamingFailureWithoutJSONAppend(t *testing.T) {
	handler := imageTestHandler(t, imageFetcherFunc(func(context.Context, imageproxy.Request) (*imageproxy.Response, error) {
		return &imageproxy.Response{
			Status:        http.StatusOK,
			ContentType:   "image/png",
			ContentLength: -1,
			Body: &readSequence{
				data: []byte("partial"),
				err:  imageproxy.ErrBodyTooLarge,
			},
		}, nil
	}), newTestMetrics(t))
	response := httptest.NewRecorder()
	func() {
		defer func() {
			if recovered := recover(); !errors.Is(panicAsError(recovered), http.ErrAbortHandler) {
				t.Fatalf("panic = %#v", recovered)
			}
		}()
		handler.ServeHTTP(
			response,
			httptest.NewRequest(
				http.MethodGet,
				"/api/v1/images/bangumi/subjects/1?type=grid",
				nil,
			),
		)
	}()
	if response.Code != http.StatusOK || response.Body.String() != "partial" ||
		bytes.Contains(response.Body.Bytes(), []byte("UPSTREAM_")) {
		t.Fatalf("late response = %d %q", response.Code, response.Body.String())
	}
}

func imageTestHandler(t *testing.T, images imageFetcher, metrics *observability.Registry) http.Handler {
	t.Helper()
	return newHandler(nil, metrics, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "router-id" },
		metrics:        metrics,
		images:         images,
	})
}

type imageFetcherFunc func(context.Context, imageproxy.Request) (*imageproxy.Response, error)

func (function imageFetcherFunc) Fetch(
	ctx context.Context,
	request imageproxy.Request,
) (*imageproxy.Response, error) {
	return function(ctx, request)
}

type readSequence struct {
	data []byte
	err  error
	read bool
}

func (r *readSequence) Read(destination []byte) (int, error) {
	if !r.read {
		r.read = true
		return copy(destination, r.data), nil
	}
	return 0, r.err
}

func (*readSequence) Close() error {
	return nil
}

func panicAsError(value any) error {
	err, _ := value.(error)
	return err
}

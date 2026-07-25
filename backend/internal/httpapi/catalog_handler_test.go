package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/catalog"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

func TestCatalogRouteReturnsCompleteNoCacheEnvelopeAndOneEvent(t *testing.T) {
	var events bytes.Buffer
	metrics, err := observability.NewRegistry(observability.BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	handler := newHandler(nil, metrics, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "catalog-success-id" },
		metrics:        metrics,
		events:         observability.NewEventSink(&events),
		catalogs: func() (*archive.Store, bool) {
			return new(archive.Store), true
		},
		catalogProjector: func(context.Context, *archive.Store) (catalog.Result, error) {
			return catalog.Result{
				DataVersion: "dv1-1111111111111111111111111111111111111111111111111111111111111111",
				Data: wire.CatalogDataV1{
					SubjectTypes: []wire.CatalogSubjectTypeV1{
						{Key: wire.Book, Label: "书籍"},
						{Key: wire.Anime, Label: "动画"},
						{Key: wire.Music, Label: "音乐"},
						{Key: wire.Game, Label: "游戏"},
						{Key: wire.Real, Label: "三次元"},
					},
					Positions:          []wire.CatalogPositionV1{},
					Groups:             []wire.CatalogGroupV1{},
					SelectionRules:     []wire.CatalogSelectionRuleV1{},
					FilterCapabilities: []wire.CatalogFilterCapabilityV1{},
					SortCapabilities:   []wire.CatalogSortCapabilityV1{},
				},
			}, nil
		},
	})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, routeCatalog, nil))
	if response.Code != http.StatusOK ||
		response.Header().Get("Cache-Control") != "no-cache" ||
		response.Header().Get("Content-Type") != "application/json" ||
		response.Header().Get(requestIDHeader) != "catalog-success-id" {
		t.Fatalf("catalog response = %d %#v", response.Code, response.Header())
	}
	var envelope wire.CatalogSuccessEnvelopeV1
	if err := json.Unmarshal(response.Body.Bytes(), &envelope); err != nil {
		t.Fatal(err)
	}
	if envelope.Meta.RequestId != "catalog-success-id" ||
		envelope.Meta.DataVersion == "" ||
		len(envelope.Data.SubjectTypes) != 5 {
		t.Fatalf("catalog envelope = %#v", envelope)
	}
	if strings.Count(events.String(), "\n") != 1 ||
		!strings.Contains(events.String(), `"event":"query_completed"`) ||
		!strings.Contains(events.String(), `"operation":"catalog"`) ||
		strings.Contains(events.String(), envelope.Meta.DataVersion) {
		t.Fatalf("catalog event = %q", events.String())
	}
	rendered, err := metrics.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(
		string(rendered),
		`bgmss_http_requests_total{method="GET",operation="catalog",outcome="success",route="catalog",status_class="2xx"} 1`,
	) {
		t.Fatalf("catalog metric missing:\n%s", rendered)
	}
}

func TestCatalogRouteRejectsInputBeforeStoreAccess(t *testing.T) {
	for _, test := range []struct {
		name       string
		method     string
		target     string
		body       string
		status     int
		message    string
		allow      string
		fieldToken string
	}{
		{"method", http.MethodPost, routeCatalog, "", 405, "method not allowed", "GET", "UNSUPPORTED_VALUE"},
		{"query", http.MethodGet, routeCatalog + "?dataVersion=client", "", 400, "catalog does not accept query parameters", "", "UNKNOWN_FIELD"},
		{"body", http.MethodGet, routeCatalog, "{}", 400, "catalog does not accept a request body", "", "VALUE_CONFLICT"},
	} {
		t.Run(test.name, func(t *testing.T) {
			calls := 0
			handler := newHandler(nil, nil, middlewareOptions{
				requestTimeout: time.Second,
				requestID:      func() string { return "catalog-reject-id" },
				catalogs: func() (*archive.Store, bool) {
					calls++
					return nil, false
				},
			})
			var body *strings.Reader
			if test.body != "" {
				body = strings.NewReader(test.body)
			} else {
				body = strings.NewReader("")
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(
				response,
				httptest.NewRequest(test.method, test.target, body),
			)
			if response.Code != test.status ||
				response.Header().Get("Cache-Control") != "no-store" ||
				!strings.Contains(response.Body.String(), test.message) ||
				(test.fieldToken != "" && !strings.Contains(response.Body.String(), test.fieldToken)) ||
				response.Header().Get("Allow") != test.allow {
				t.Fatalf("rejection = %d %#v %q", response.Code, response.Header(), response.Body.String())
			}
			if calls != 0 {
				t.Fatalf("invalid input reached Store provider %d times", calls)
			}
		})
	}
}

func TestCatalogProtocolErrorsMatchAcceptedEnvelopes(t *testing.T) {
	handler := newHandler(nil, nil, middlewareOptions{
		requestTimeout: time.Second,
		requestID:      func() string { return "catalog-protocol-id" },
	})
	for _, test := range []struct {
		name   string
		method string
		target string
		status int
		allow  string
		body   string
	}{
		{
			name:   "wrong method",
			method: http.MethodPost,
			target: routeCatalog,
			status: http.StatusMethodNotAllowed,
			allow:  http.MethodGet,
			body:   `{"error":{"code":"INVALID_REQUEST","fieldErrors":{"/catalog":["UNSUPPORTED_VALUE"]},"message":"method not allowed","retryable":false},"meta":{"requestId":"catalog-protocol-id"}}`,
		},
		{
			name:   "malformed path",
			method: http.MethodGet,
			target: routeCatalog + string('/'),
			status: http.StatusNotFound,
			body:   `{"error":{"code":"ENTITY_NOT_FOUND","fieldErrors":{},"message":"route not found","retryable":false},"meta":{"requestId":"catalog-protocol-id"}}`,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(test.method, test.target, nil))
			if response.Code != test.status ||
				response.Header().Get("Allow") != test.allow ||
				response.Header().Get("Cache-Control") != "no-store" ||
				response.Header().Get("Content-Type") != "application/json" ||
				response.Header().Get(requestIDHeader) != "catalog-protocol-id" ||
				response.Body.String() != test.body {
				t.Fatalf(
					"protocol response = %d %#v %q",
					response.Code,
					response.Header(),
					response.Body.String(),
				)
			}
		})
	}
}

func TestCatalogRouteMapsNotReadyAndInvalidStoreWithoutLeaking(t *testing.T) {
	for _, test := range []struct {
		name      string
		provider  CatalogStoreProvider
		projector catalogProjector
		status    int
		code      string
	}{
		{
			name: "not ready",
			provider: func() (*archive.Store, bool) {
				return nil, false
			},
			status: 503,
			code:   "NOT_READY",
		},
		{
			name: "invalid Store",
			provider: func() (*archive.Store, bool) {
				return new(archive.Store), true
			},
			projector: func(context.Context, *archive.Store) (catalog.Result, error) {
				return catalog.Result{}, errors.New("SELECT secret FROM catalog_position")
			},
			status: 500,
			code:   "INTERNAL_ERROR",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			handler := newHandler(nil, nil, middlewareOptions{
				requestTimeout:   time.Second,
				requestID:        func() string { return "catalog-error-id" },
				catalogs:         test.provider,
				catalogProjector: test.projector,
			})
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, routeCatalog, nil))
			if response.Code != test.status ||
				!strings.Contains(response.Body.String(), `"code":"`+test.code+`"`) ||
				strings.Contains(response.Body.String(), "SELECT") ||
				strings.Contains(response.Body.String(), "dataVersion") {
				t.Fatalf("error response = %d %q", response.Code, response.Body.String())
			}
		})
	}
}

func TestCatalogDeadlineBeforeCommitUsesCatalogTimeoutAndOneTerminalEvent(t *testing.T) {
	var events bytes.Buffer
	handler := newHandler(nil, nil, middlewareOptions{
		requestTimeout: 20 * time.Millisecond,
		requestID:      func() string { return "catalog-timeout-id" },
		events:         observability.NewEventSink(&events),
		catalogs: func() (*archive.Store, bool) {
			return new(archive.Store), true
		},
		catalogProjector: func(ctx context.Context, _ *archive.Store) (catalog.Result, error) {
			<-ctx.Done()
			return catalog.Result{}, ctx.Err()
		},
	})
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, routeCatalog, nil))
	if response.Code != http.StatusGatewayTimeout ||
		!strings.Contains(response.Body.String(), `"code":"UPSTREAM_TIMEOUT"`) ||
		!strings.Contains(response.Body.String(), "catalog request timed out") {
		t.Fatalf("timeout = %d %q", response.Code, response.Body.String())
	}
	if strings.Count(events.String(), "\n") != 1 ||
		!strings.Contains(events.String(), `"operation":"catalog"`) ||
		!strings.Contains(events.String(), `"error_code":"UPSTREAM_TIMEOUT"`) {
		t.Fatalf("timeout terminal event = %q", events.String())
	}
}

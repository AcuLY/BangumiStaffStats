package httpapi

import (
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/observability"
)

func TestServerServesRuntimeAndShutsDown(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- NewServer(testRuntimeHandler(t)).Serve(ctx, listener)
	}()

	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://" + listener.Addr().String() + "/livez")
	if err != nil {
		cancel()
		t.Fatalf("request liveness: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusOK {
		cancel()
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}

	cancel()
	select {
	case err := <-result:
		if err != nil {
			t.Fatalf("Serve returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve leaked after cancellation")
	}
}

func TestServerPropagatesServeFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}

	err = NewServer(testRuntimeHandler(t)).Serve(context.Background(), listener)
	if err == nil {
		t.Fatal("Serve returned nil for a closed listener")
	}
	if !errors.Is(err, net.ErrClosed) {
		t.Fatalf("Serve error = %v, want net.ErrClosed", err)
	}
}

func TestServerRejectsNilInputs(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer listener.Close()

	server := NewServer(testRuntimeHandler(t))
	if err := server.Serve(nil, listener); err == nil {
		t.Fatal("Serve accepted a nil context")
	}
	if err := server.Serve(context.Background(), nil); err == nil {
		t.Fatal("Serve accepted a nil listener")
	}
}

func TestServerUncommittedProcessCancellationAbortsWireResponse(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	metrics := newTestMetrics(t)
	handlerStarted := make(chan struct{})
	handler := runtimeMiddleware(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		close(handlerStarted)
		<-request.Context().Done()
	}), middlewareOptions{
		requestTimeout: time.Minute,
		requestID:      func() string { return "process-cancel-id" },
		metrics:        metrics,
	})
	ctx, cancel := context.WithCancel(context.Background())
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- NewServer(handler).Serve(ctx, listener)
	}()

	connection, err := net.DialTimeout("tcp", listener.Addr().String(), time.Second)
	if err != nil {
		cancel()
		t.Fatalf("dial: %v", err)
	}
	defer connection.Close()
	if _, err := io.WriteString(
		connection,
		"GET /livez HTTP/1.1\r\nHost: local.test\r\nConnection: close\r\n\r\n",
	); err != nil {
		cancel()
		t.Fatalf("write request: %v", err)
	}
	select {
	case <-handlerStarted:
	case <-time.After(time.Second):
		cancel()
		t.Fatal("handler did not start")
	}
	cancel()

	if err := connection.SetReadDeadline(time.Now().Add(2 * time.Second)); err != nil {
		t.Fatal(err)
	}
	wireResponse, readErr := io.ReadAll(connection)
	if readErr != nil {
		t.Fatalf("read canceled response: %v", readErr)
	}
	if len(wireResponse) != 0 {
		t.Fatalf("cancellation wrote a wire response: %q", wireResponse)
	}
	select {
	case err := <-serveResult:
		if err != nil {
			t.Fatalf("Serve returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("Serve leaked after process cancellation")
	}
	rendered, err := metrics.RenderPrometheus()
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(rendered), `outcome="canceled"`) ||
		!strings.Contains(string(rendered), `status_class="none"`) {
		t.Fatalf("cancellation metrics:\n%s", rendered)
	}
}

func TestHTTPServerHasExactBoundsAndProcessContext(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	server := newHTTPServer(ctx, http.NotFoundHandler())
	if server.ReadHeaderTimeout != 5*time.Second {
		t.Errorf("ReadHeaderTimeout = %s", server.ReadHeaderTimeout)
	}
	if server.ReadTimeout != 10*time.Second {
		t.Errorf("ReadTimeout = %s", server.ReadTimeout)
	}
	if server.WriteTimeout != 35*time.Second {
		t.Errorf("WriteTimeout = %s", server.WriteTimeout)
	}
	if server.IdleTimeout != 60*time.Second {
		t.Errorf("IdleTimeout = %s", server.IdleTimeout)
	}
	if server.MaxHeaderBytes != 64*1024 {
		t.Errorf("MaxHeaderBytes = %d", server.MaxHeaderBytes)
	}
	baseContext := server.BaseContext(nil)
	cancel()
	select {
	case <-baseContext.Done():
	case <-time.After(time.Second):
		t.Fatal("base context did not inherit process cancellation")
	}
}

func testRuntimeHandler(t *testing.T) http.Handler {
	t.Helper()
	metrics, err := observability.NewRegistry(observability.BuildInfo{})
	if err != nil {
		t.Fatal(err)
	}
	return NewHandler(nil, metrics)
}

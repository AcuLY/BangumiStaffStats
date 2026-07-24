package httpapi

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestServerServesEmptyMuxAndShutsDown(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- NewServer(NewHandler()).Serve(ctx, listener)
	}()

	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://" + listener.Addr().String() + "/")
	if err != nil {
		cancel()
		t.Fatalf("request empty mux: %v", err)
	}
	response.Body.Close()
	if response.StatusCode != http.StatusNotFound {
		cancel()
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusNotFound)
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

	err = NewServer(NewHandler()).Serve(context.Background(), listener)
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

	server := NewServer(NewHandler())
	if err := server.Serve(nil, listener); err == nil {
		t.Fatal("Serve accepted a nil context")
	}
	if err := server.Serve(context.Background(), nil); err == nil {
		t.Fatal("Serve accepted a nil listener")
	}
}

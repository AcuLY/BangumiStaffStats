package app

import (
	"context"
	"errors"
	"net"
	"net/http"
	"testing"
	"time"
)

func TestRunListenerStartsAndStops(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- RunListener(ctx, listener)
	}()

	client := &http.Client{Timeout: 2 * time.Second}
	response, err := client.Get("http://" + listener.Addr().String() + "/not-a-route")
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
			t.Fatalf("RunListener returned error: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("RunListener did not stop after cancellation")
	}
}

func TestRunListenerPropagatesServeFailure(t *testing.T) {
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	if err := listener.Close(); err != nil {
		t.Fatalf("close listener: %v", err)
	}

	err = RunListener(context.Background(), listener)
	if err == nil {
		t.Fatal("RunListener returned nil for a closed listener")
	}
	if !errors.Is(err, net.ErrClosed) {
		t.Fatalf("RunListener error = %v, want net.ErrClosed", err)
	}
}

func TestRunRejectsInvalidAddress(t *testing.T) {
	err := Run(context.Background(), "127.0.0.1:not-a-port")
	if err == nil {
		t.Fatal("Run returned nil for an invalid address")
	}
}

// Package httpapi owns the HTTP transport lifecycle.
package httpapi

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"time"
)

// DefaultShutdownTimeout bounds graceful shutdown.
const DefaultShutdownTimeout = 5 * time.Second

const (
	defaultReadHeaderTimeout = 5 * time.Second
	defaultReadTimeout       = 10 * time.Second
	defaultWriteTimeout      = 35 * time.Second
	defaultIdleTimeout       = 60 * time.Second
	defaultMaxHeaderBytes    = 64 * 1024
)

// Server serves a supplied listener and owns graceful shutdown.
type Server struct {
	handler         http.Handler
	shutdownTimeout time.Duration
}

// NewServer returns a server for handler.
func NewServer(handler http.Handler) *Server {
	return &Server{
		handler:         handler,
		shutdownTimeout: DefaultShutdownTimeout,
	}
}

// Serve runs until serving fails or ctx is cancelled.
func (s *Server) Serve(ctx context.Context, listener net.Listener) error {
	if ctx == nil {
		return fmt.Errorf("serve: nil context")
	}
	if listener == nil {
		return fmt.Errorf("serve: nil listener")
	}

	handler := s.handler
	if handler == nil {
		handler = http.NotFoundHandler()
	}
	shutdownTimeout := s.shutdownTimeout
	if shutdownTimeout <= 0 {
		shutdownTimeout = DefaultShutdownTimeout
	}

	httpServer := newHTTPServer(ctx, handler)
	serveResult := make(chan error, 1)
	go func() {
		serveResult <- httpServer.Serve(listener)
	}()

	select {
	case err := <-serveResult:
		return normalizeServeError(err)
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
		shutdownErr := httpServer.Shutdown(shutdownCtx)
		cancel()
		if shutdownErr != nil {
			closeErr := httpServer.Close()
			serveErr := <-serveResult
			return errors.Join(
				fmt.Errorf("graceful shutdown: %w", shutdownErr),
				normalizeServeError(closeErr),
				normalizeServeError(serveErr),
			)
		}
		return normalizeServeError(<-serveResult)
	}
}

func newHTTPServer(processContext context.Context, handler http.Handler) *http.Server {
	return &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: defaultReadHeaderTimeout,
		ReadTimeout:       defaultReadTimeout,
		WriteTimeout:      defaultWriteTimeout,
		IdleTimeout:       defaultIdleTimeout,
		MaxHeaderBytes:    defaultMaxHeaderBytes,
		BaseContext: func(net.Listener) context.Context {
			return processContext
		},
	}
}

func normalizeServeError(err error) error {
	if err == nil || errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}

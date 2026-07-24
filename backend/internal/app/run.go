// Package app assembles the backend process.
package app

import (
	"context"
	"fmt"
	"net"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
)

// Run listens on address and serves until ctx is cancelled or serving fails.
func Run(ctx context.Context, address string) error {
	if ctx == nil {
		return fmt.Errorf("run: nil context")
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %q: %w", address, err)
	}
	defer listener.Close()

	return RunListener(ctx, listener)
}

// RunListener serves the empty API on a caller-supplied listener.
func RunListener(ctx context.Context, listener net.Listener) error {
	server := httpapi.NewServer(httpapi.NewHandler())
	if err := server.Serve(ctx, listener); err != nil {
		return fmt.Errorf("serve api: %w", err)
	}
	return nil
}

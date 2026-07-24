// Package app assembles the backend process.
package app

import (
	"context"
	"errors"
	"fmt"
	"net"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi"
)

// Run listens on address and serves until ctx is cancelled or serving fails.
func Run(ctx context.Context, address, archiveRoot string) error {
	if ctx == nil {
		return fmt.Errorf("run: nil context")
	}

	listener, err := net.Listen("tcp", address)
	if err != nil {
		return fmt.Errorf("listen on %q: %w", address, err)
	}
	defer listener.Close()

	return RunListener(ctx, listener, archiveRoot)
}

// RunListener serves the empty API on a caller-supplied listener.
func RunListener(ctx context.Context, listener net.Listener, archiveRoot string) error {
	archiveState := new(archive.State)
	if err := archiveState.LoadCurrent(ctx, archiveRoot); err != nil {
		return fmt.Errorf("load archive: %w", err)
	}

	server := httpapi.NewServer(httpapi.NewHandler())
	serveErr := server.Serve(ctx, listener)
	closeErr := archiveState.Close()
	if serveErr != nil {
		serveErr = fmt.Errorf("serve api: %w", serveErr)
	}
	if closeErr != nil {
		closeErr = fmt.Errorf("close archive: %w", closeErr)
	}
	return errors.Join(serveErr, closeErr)
}

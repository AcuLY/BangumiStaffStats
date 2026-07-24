// Command api runs the Bangumi Staff Stats HTTP API.
package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/app"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := app.Run(ctx, "127.0.0.1:8080"); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("api stopped with an error: %v", err)
		os.Exit(1)
	}
}

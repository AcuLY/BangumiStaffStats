// Command api runs the Bangumi Staff Stats HTTP API.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/app"
)

const (
	defaultListenAddress           = "127.0.0.1:8080"
	invalidCommandArgumentsMessage = "invalid command arguments"
)

var errInvalidCommandArguments = errors.New(invalidCommandArgumentsMessage)

type commandOptions struct {
	archiveRoot      string
	listenAddress    string
	updateStatusPath string
}

type singleStringFlag struct {
	name  string
	value *string
	set   bool
}

func (value *singleStringFlag) Set(raw string) error {
	if value.set {
		return fmt.Errorf("-%s may be specified only once", value.name)
	}
	value.set = true
	*value.value = raw
	return nil
}

func (value *singleStringFlag) String() string {
	if value == nil || value.value == nil {
		return ""
	}
	return *value.value
}

func parseCommandOptions(arguments []string) (commandOptions, error) {
	options := commandOptions{listenAddress: defaultListenAddress}
	flags := flag.NewFlagSet("api", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	flags.Var(
		&singleStringFlag{name: "archive-root", value: &options.archiveRoot},
		"archive-root",
		"absolute immutable Archive root",
	)
	flags.Var(
		&singleStringFlag{name: "listen-address", value: &options.listenAddress},
		"listen-address",
		"loopback or unspecified IP literal and nonzero port",
	)
	flags.Var(
		&singleStringFlag{name: "update-status", value: &options.updateStatusPath},
		"update-status",
		"optional absolute read-only update-status.json path",
	)
	if err := flags.Parse(arguments); err != nil {
		return commandOptions{}, errInvalidCommandArguments
	}
	if flags.NArg() != 0 {
		return commandOptions{}, errInvalidCommandArguments
	}
	if options.archiveRoot == "" {
		return commandOptions{}, errInvalidCommandArguments
	}
	if err := validateListenAddress(options.listenAddress); err != nil {
		return commandOptions{}, errInvalidCommandArguments
	}
	return options, nil
}

func validateListenAddress(address string) error {
	host, rawPort, err := net.SplitHostPort(address)
	if err != nil {
		return fmt.Errorf("-listen-address must be one valid host:port pair: %w", err)
	}
	if host == "" || strings.Contains(host, "%") {
		return errors.New("-listen-address host must be an IP literal without a zone")
	}
	ip := net.ParseIP(host)
	if ip == nil || (!ip.IsLoopback() && !ip.IsUnspecified()) {
		return errors.New("-listen-address host must be a loopback or unspecified IP literal")
	}
	if rawPort == "" {
		return errors.New("-listen-address port must be numeric and in 1..65535")
	}
	for _, character := range rawPort {
		if character < '0' || character > '9' {
			return errors.New("-listen-address port must be numeric and in 1..65535")
		}
	}
	port, err := strconv.ParseUint(rawPort, 10, 16)
	if err != nil || port == 0 {
		return errors.New("-listen-address port must be numeric and in 1..65535")
	}
	return nil
}

func main() {
	options, err := parseCommandOptions(os.Args[1:])
	if err != nil {
		log.Print(err)
		os.Exit(2)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if err := app.RunWithOptions(
		ctx,
		options.listenAddress,
		options.archiveRoot,
		app.RunOptions{UpdateStatusPath: options.updateStatusPath},
	); err != nil && !errors.Is(err, context.Canceled) {
		log.Printf("api stopped with an error: %v", err)
		os.Exit(1)
	}
}

package main

import (
	"errors"
	"strings"
	"testing"
)

func TestRunOptionsPreservesDedicatedProxyPresence(t *testing.T) {
	absent := runOptions("/status.json", "", false)
	if absent.UpdateStatusPath != "/status.json" ||
		absent.ImageHTTPSProxy != nil {
		t.Fatalf("absent run options = %#v", absent)
	}

	presentEmpty := runOptions("", "", true)
	if presentEmpty.ImageHTTPSProxy == nil ||
		*presentEmpty.ImageHTTPSProxy != "" {
		t.Fatalf("present-empty run options = %#v", presentEmpty)
	}

	present := runOptions("", "http://proxy.internal:7897", true)
	if present.ImageHTTPSProxy == nil ||
		*present.ImageHTTPSProxy != "http://proxy.internal:7897" {
		t.Fatalf("present run options = %#v", present)
	}
}

func TestParseCommandOptionsAcceptsBoundedListeners(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name       string
		arguments  []string
		wantListen string
		wantStatus string
	}{
		{
			name:       "default loopback",
			arguments:  []string{"-archive-root", "/archive"},
			wantListen: "127.0.0.1:8080",
		},
		{
			name: "explicit IPv4 unspecified",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "0.0.0.0:8080",
			},
			wantListen: "0.0.0.0:8080",
		},
		{
			name: "IPv4 loopback range",
			arguments: []string{
				"-listen-address=127.0.0.2:1",
				"-archive-root=/archive",
			},
			wantListen: "127.0.0.2:1",
		},
		{
			name: "IPv6 loopback",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "[::1]:08080",
			},
			wantListen: "[::1]:08080",
		},
		{
			name: "IPv6 unspecified",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "[::]:65535",
				"-update-status", "/status/update-status.json",
			},
			wantListen: "[::]:65535",
			wantStatus: "/status/update-status.json",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			options, err := parseCommandOptions(test.arguments)
			if err != nil {
				t.Fatal(err)
			}
			if options.archiveRoot != "/archive" {
				t.Fatalf("archiveRoot = %q, want /archive", options.archiveRoot)
			}
			if options.listenAddress != test.wantListen {
				t.Fatalf("listenAddress = %q, want %q", options.listenAddress, test.wantListen)
			}
			if options.updateStatusPath != test.wantStatus {
				t.Fatalf(
					"updateStatusPath = %q, want %q",
					options.updateStatusPath,
					test.wantStatus,
				)
			}
		})
	}
}

func TestParseCommandOptionsRejectsUnsafeOrAmbiguousArguments(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name      string
		arguments []string
	}{
		{name: "missing archive root", arguments: nil},
		{
			name:      "empty archive root",
			arguments: []string{"-archive-root="},
		},
		{
			name: "empty listener",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address=",
			},
		},
		{
			name: "DNS host",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "localhost:8080",
			},
		},
		{
			name: "interface specific IPv4",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "192.0.2.1:8080",
			},
		},
		{
			name: "interface specific IPv6",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "[2001:db8::1]:8080",
			},
		},
		{
			name: "zoned IPv6",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "[::1%lo0]:8080",
			},
		},
		{
			name: "empty host",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", ":8080",
			},
		},
		{
			name: "zero port",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:0",
			},
		},
		{
			name: "out of range port",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:65536",
			},
		},
		{
			name: "named port",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:http",
			},
		},
		{
			name: "signed port",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:+8080",
			},
		},
		{
			name: "unbracketed IPv6",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "::1:8080",
			},
		},
		{
			name: "malformed pair",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1",
			},
		},
		{
			name: "duplicate listener",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:8080",
				"--listen-address=0.0.0.0:8080",
			},
		},
		{
			name: "duplicate archive root",
			arguments: []string{
				"-archive-root", "/archive",
				"--archive-root=/other",
			},
		},
		{
			name: "duplicate update status",
			arguments: []string{
				"-archive-root", "/archive",
				"-update-status", "/status/one.json",
				"--update-status=/status/two.json",
			},
		},
		{
			name: "positional argument",
			arguments: []string{
				"-archive-root", "/archive",
				"extra",
			},
		},
		{
			name: "unknown flag",
			arguments: []string{
				"-archive-root", "/archive",
				"-unknown",
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseCommandOptions(test.arguments)
			if err == nil {
				t.Fatal("parseCommandOptions accepted invalid arguments")
			}
			if !errors.Is(err, errInvalidCommandArguments) ||
				err.Error() != invalidCommandArgumentsMessage {
				t.Fatalf(
					"argument error = %q, want fixed %q",
					err,
					invalidCommandArgumentsMessage,
				)
			}
		})
	}
}

func TestParseCommandOptionsDoesNotReflectAdversarialInput(t *testing.T) {
	t.Parallel()

	const marker = "CALLER-CONTROLLED"
	oversized := strings.Repeat(marker, 1024)
	tests := []struct {
		name      string
		arguments []string
	}{
		{
			name: "oversized newline listener",
			arguments: []string{
				"-archive-root", "/archive",
				"-listen-address", "127.0.0.1:8080\n" + oversized,
			},
		},
		{
			name: "oversized control positional argument",
			arguments: []string{
				"-archive-root", "/archive",
				oversized + "\n\r\t\x00",
			},
		},
		{
			name: "oversized newline unknown flag",
			arguments: []string{
				"-archive-root", "/archive",
				"-unknown-" + oversized + "\nsecond-line",
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			_, err := parseCommandOptions(test.arguments)
			if !errors.Is(err, errInvalidCommandArguments) {
				t.Fatalf("parseCommandOptions error = %v", err)
			}
			message := err.Error()
			if message != invalidCommandArgumentsMessage ||
				strings.Contains(message, marker) ||
				strings.ContainsAny(message, "\r\n\x00") {
				t.Fatalf("argument error reflected caller input: %q", message)
			}
		})
	}
}

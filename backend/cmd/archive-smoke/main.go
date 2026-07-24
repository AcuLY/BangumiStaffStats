// Command archive-smoke validates one inactive immutable Archive candidate.
package main

import (
	"context"
	"encoding/json"
	"flag"
	"io"
	"os"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
)

type successResult struct {
	OK             bool   `json:"ok"`
	DataVersion    string `json:"dataVersion"`
	ManifestDigest string `json:"manifestDigest"`
	SQLiteDigest   string `json:"sqliteDigest"`
}

type failureResult struct {
	OK   bool         `json:"ok"`
	Code archive.Code `json:"code"`
}

func main() {
	os.Exit(run(context.Background(), os.Args[1:], os.Stdout))
}

func run(ctx context.Context, arguments []string, output io.Writer) int {
	flags := flag.NewFlagSet("archive-smoke", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	archiveRoot := flags.String("archive-root", "", "")
	dataVersion := flags.String("data-version", "", "")
	if err := flags.Parse(arguments); err != nil || flags.NArg() != 0 {
		_ = writeFailure(output, archive.CodeArchiveRootInvalid)
		return 2
	}
	if *archiveRoot == "" {
		_ = writeFailure(output, archive.CodeArchiveRootInvalid)
		return 2
	}
	if *dataVersion == "" {
		_ = writeFailure(output, archive.CodeArchiveFileInvalid)
		return 2
	}

	store, err := archive.LoadCandidate(ctx, *archiveRoot, *dataVersion)
	if err != nil {
		code, ok := archive.ErrorCode(err)
		if !ok {
			code = archive.CodeArchiveFileInvalid
		}
		_ = writeFailure(output, code)
		return 1
	}
	identity := store.Identity()
	if err := store.Close(); err != nil {
		_ = writeFailure(output, archive.CodeArchiveFileInvalid)
		return 1
	}
	if err := json.NewEncoder(output).Encode(successResult{
		OK:             true,
		DataVersion:    identity.DataVersion,
		ManifestDigest: identity.ManifestDigest,
		SQLiteDigest:   identity.SQLiteDigest,
	}); err != nil {
		return 1
	}
	return 0
}

func writeFailure(output io.Writer, code archive.Code) error {
	return json.NewEncoder(output).Encode(failureResult{OK: false, Code: code})
}

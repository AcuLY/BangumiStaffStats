package statistics

import (
	"context"
	"strings"
	"testing"
)

func TestLoadSeriesIndexRejectsNilAndCancellation(t *testing.T) {
	if _, err := LoadSeriesIndex(context.Background(), nil); errorCodeOrEmpty(err) != CodeInputInvalid {
		t.Fatalf("nil Store error = %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := LoadSeriesIndex(ctx, nil); errorCodeOrEmpty(err) != CodeCanceled {
		t.Fatalf("canceled load error = %v", err)
	}
}

func TestSeriesSourceQueriesRemainFixedReads(t *testing.T) {
	for _, query := range []string{selectSeriesSubjects, selectSeriesRelations} {
		normalized := strings.ToUpper(strings.TrimSpace(query))
		if !strings.HasPrefix(normalized, "SELECT ") ||
			strings.Contains(query, ";") ||
			strings.Contains(normalized, " INSERT ") ||
			strings.Contains(normalized, " UPDATE ") ||
			strings.Contains(normalized, " DELETE ") {
			t.Fatalf("source query is not a fixed read: %q", query)
		}
	}
}

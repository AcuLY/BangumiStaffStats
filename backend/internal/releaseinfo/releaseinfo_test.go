package releaseinfo

import (
	"strings"
	"testing"
)

func TestCurrentReturnsDevelopmentDefaults(t *testing.T) {
	info, err := Current()
	if err != nil {
		t.Fatal(err)
	}
	if info.Version != "dev" || info.Revision != "unknown" {
		t.Fatalf("development identity = %+v", info)
	}
	encoded, err := info.CanonicalJSON()
	if err != nil {
		t.Fatal(err)
	}
	if got, want := string(encoded), "{\"revision\":\"unknown\",\"version\":\"dev\"}\n"; got != want {
		t.Fatalf("canonical JSON = %q, want %q", got, want)
	}
}

func TestCurrentAcceptsOneCompleteReleaseIdentity(t *testing.T) {
	originalVersion, originalCommit := Version, Commit
	t.Cleanup(func() {
		Version, Commit = originalVersion, originalCommit
	})
	Version = "v0.1.0"
	Commit = strings.Repeat("a", 40)

	info, err := Current()
	if err != nil {
		t.Fatal(err)
	}
	if info.Version != Version || info.Revision != Commit {
		t.Fatalf("release identity = %+v", info)
	}
}

func TestCurrentRejectsMalformedOrMixedLinkTimeIdentity(t *testing.T) {
	originalVersion, originalCommit := Version, Commit
	t.Cleanup(func() {
		Version, Commit = originalVersion, originalCommit
	})
	tests := []struct {
		name     string
		version  string
		revision string
	}{
		{name: "empty", version: "", revision: ""},
		{name: "mixed release version", version: "v0.1.0", revision: "unknown"},
		{name: "mixed release revision", version: "dev", revision: strings.Repeat("a", 40)},
		{name: "unprefixed version", version: "0.1.0", revision: strings.Repeat("a", 40)},
		{name: "uppercase revision", version: "v0.1.0", revision: strings.Repeat("A", 40)},
		{name: "long revision", version: "v0.1.0", revision: strings.Repeat("a", 64)},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			Version, Commit = test.version, test.revision
			if _, err := Current(); err == nil {
				t.Fatalf("accepted version=%q revision=%q", test.version, test.revision)
			}
		})
	}
}

// Package releaseinfo exposes the immutable identity injected into Backend
// binaries by the release build.
package releaseinfo

import (
	"encoding/json"
	"errors"
	"regexp"
)

// Version and Commit are replaced together by release builds through -ldflags
// -X. Source and development builds intentionally retain these defaults.
var (
	Version = "dev"
	Commit  = "unknown"
)

var (
	versionPattern  = regexp.MustCompile(`^v(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$`)
	revisionPattern = regexp.MustCompile(`^[0-9a-f]{40}$`)
)

// Info is one validated, process-controlled Backend build identity.
type Info struct {
	Revision string `json:"revision"`
	Version  string `json:"version"`
}

// Current returns a validated value copy of the link-time build identity.
func Current() (Info, error) {
	info := Info{Revision: Commit, Version: Version}
	if (info.Version != "dev" && !versionPattern.MatchString(info.Version)) ||
		(info.Revision != "unknown" && !revisionPattern.MatchString(info.Revision)) {
		return Info{}, errors.New("releaseinfo: invalid link-time identity")
	}
	if (info.Version == "dev") != (info.Revision == "unknown") {
		return Info{}, errors.New("releaseinfo: mixed development and release identity")
	}
	return info, nil
}

// CanonicalJSON returns the canonical, newline-terminated representation used
// by inspection tooling.
func (info Info) CanonicalJSON() ([]byte, error) {
	if (info.Version != "dev" && !versionPattern.MatchString(info.Version)) ||
		(info.Revision != "unknown" && !revisionPattern.MatchString(info.Revision)) ||
		(info.Version == "dev") != (info.Revision == "unknown") {
		return nil, errors.New("releaseinfo: invalid build identity")
	}
	encoded, err := json.Marshal(info)
	if err != nil {
		return nil, err
	}
	return append(encoded, '\n'), nil
}

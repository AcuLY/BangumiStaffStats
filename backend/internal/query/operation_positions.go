package query

import (
	"encoding/json"
	"fmt"
	"sort"
	"strings"
)

// NormalizeOperation retains strict shared-query validation while admitting an
// empty position selection only for an explicitly all-position operation.
// Callers validate their input and resolve exact operation identities separately.
func NormalizeOperation(raw []byte, catalog CatalogContext, scope string) (NormalizedQuery, error) {
	return normalize(raw, catalog, scope == "all")
}

// OperationPositionScope normalizes the optional operation scope independently
// of the shared query. The empty value is the canonical legacy/query scope.
func OperationPositionScope(raw json.RawMessage) (string, error) {
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		return "", nil
	}
	value, exists := fields["positionScope"]
	if !exists {
		return "", nil
	}
	var scope string
	if err := json.Unmarshal(value, &scope); err != nil {
		return "", err
	}
	switch scope {
	case "query":
		return "", nil
	case "all":
		return "all", nil
	}
	return "", fmt.Errorf("invalid operation position scope")
}

// OperationPositions resolves permitted identities from the immutable catalog.
// A browse set omits the redundant main-cast selector when all cast is available.
func OperationPositions(effective EffectiveQuery, catalog CatalogContext, supported map[string]bool, scope string, browse bool) []string {
	if scope != "all" {
		return append([]string(nil), effective.PositionKeys...)
	}
	allowed := make(map[string]bool)
	for _, position := range catalog.Positions {
		if position.SubjectType == effective.SubjectType && position.Selectable && supported[position.Key] {
			allowed[position.Key] = true
		}
	}
	keys := make([]string, 0, len(allowed))
	for key := range allowed {
		if browse && strings.HasPrefix(key, "cast:") && strings.HasSuffix(key, ":main") && allowed[strings.TrimSuffix(key, ":main")+":all"] {
			continue
		}
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

// OperationEvaluation retains the applied Query digest and work filters while
// supplying independently validated operation identities to the contribution
// evaluator. These keys are not a new public SharedQuery selection. Callers
// include the operation scope and identities in their result cache key.
func OperationEvaluation(normalized NormalizedQuery, keys []string) NormalizedQuery {
	normalized.Effective = cloneEffectiveQuery(normalized.Effective)
	normalized.Effective.PositionKeys = append([]string(nil), keys...)
	sort.Strings(normalized.Effective.PositionKeys)
	normalized.Effective.PositionKeys = uniqueOperationPositions(normalized.Effective.PositionKeys)
	return normalized
}

func uniqueOperationPositions(keys []string) []string {
	result := keys[:0]
	for _, key := range keys {
		if len(result) == 0 || result[len(result)-1] != key {
			result = append(result, key)
		}
	}
	return result
}

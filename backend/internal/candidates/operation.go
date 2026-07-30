package candidates

import (
	"slices"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// OperationInput is the candidate-specific input/view capability boundary.
type OperationInput struct {
	PositionKey       string
	View              *ViewInput
	RefreshCollection bool
}

// Operation is a fully validated candidate operation.
type Operation struct {
	PositionKey       string
	View              View
	RefreshCollection bool
}

// NormalizeOperation validates current-position membership, scope-specific
// view capability, and the personal-only refresh capability before evaluation.
func NormalizeOperation(
	effective query.EffectiveQuery,
	input OperationInput,
) (Operation, error) {
	if input.PositionKey == "" ||
		!slices.Contains(effective.PositionKeys, input.PositionKey) {
		return Operation{}, fieldError("/input/positionKey")
	}
	if effective.Scope == "global" && input.RefreshCollection {
		return Operation{}, fieldError("/refreshCollection")
	}
	view, err := NormalizeView(effective.Scope, input.View)
	if err != nil {
		return Operation{}, err
	}
	return Operation{
		PositionKey:       input.PositionKey,
		View:              view,
		RefreshCollection: input.RefreshCollection,
	}, nil
}

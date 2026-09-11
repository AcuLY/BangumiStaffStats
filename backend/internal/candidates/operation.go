package candidates

import (
	"slices"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
)

// OperationInput is the candidate-specific input/view capability boundary.
type OperationInput struct {
	PositionKey string
	View        *ViewInput
}

// Operation is a fully validated candidate operation.
type Operation struct {
	PositionScope string
	PositionKey   string
	View          View
}

// NormalizeOperation validates current-position membership and scope-specific
// view capability before evaluation.
func NormalizeOperation(
	effective query.EffectiveQuery,
	input OperationInput,
) (Operation, error) {
	if input.PositionKey != "" &&
		!slices.Contains(effective.PositionKeys, input.PositionKey) {
		return Operation{}, fieldError("/input/positionKey")
	}
	view, err := NormalizeView(effective.Scope, input.View)
	if err != nil {
		return Operation{}, err
	}
	return Operation{
		PositionKey: input.PositionKey,
		View:        view,
	}, nil
}

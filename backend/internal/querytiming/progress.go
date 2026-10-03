package querytiming

import "context"

// Progress describes actual work in the current phase, never an estimated
// overall percentage. Total is omitted when the amount of work is unknown.
type Progress struct {
	Phase     string `json:"phase"`
	Message   string `json:"message"`
	Completed *int   `json:"completed,omitempty"`
	Total     *int   `json:"total,omitempty"`
}

type progressKey struct{}

// WithProgress attaches a nonblocking, concurrency-safe observer. Observers
// must not retain request values in detached workers; those use a shared bus.
func WithProgress(ctx context.Context, observer func(Progress)) context.Context {
	return context.WithValue(ctx, progressKey{}, observer)
}

// ProgressObserver returns the optional request observer.
func ProgressObserver(ctx context.Context) func(Progress) {
	if ctx == nil {
		return nil
	}
	observer, _ := ctx.Value(progressKey{}).(func(Progress))
	return observer
}

// Report emits a stage when progress was requested.
func Report(ctx context.Context, phase, message string) {
	if observer := ProgressObserver(ctx); observer != nil {
		observer(Progress{Phase: phase, Message: message})
	}
}

// ReportCount emits current-phase measured units; a zero total is unknown.
func ReportCount(ctx context.Context, phase, message string, completed, total int) {
	if observer := ProgressObserver(ctx); observer != nil {
		value := Progress{Phase: phase, Message: message, Completed: &completed}
		if total > 0 {
			value.Total = &total
		}
		observer(value)
	}
}

package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

// progressMiddleware adapts the existing complete JSON transport, including
// its validation, deadlines and error handling. Only this goroutine writes the
// network response; the ordinary handler retains its existing commit writer.
func progressMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !wantsQueryProgress(r) {
			next.ServeHTTP(w, r)
			return
		}
		// Read the bounded JSON body before flushing any response. HTTP/1
		// otherwise drains and closes it while the ordinary handler is reading.
		// Keeping normal half-duplex semantics also preserves disconnect detection.
		body, bodyErr := io.ReadAll(io.LimitReader(r.Body, MaxJSONBodyBytes+1))
		_ = r.Body.Close()
		if bodyErr != nil {
			r.Body = io.NopCloser(progressBodyError{bodyErr})
		} else {
			r.Body = io.NopCloser(bytes.NewReader(body))
		}
		ctx, cancel := context.WithCancel(r.Context())
		defer cancel()
		updates := make(chan querytiming.Progress, 32)
		ctx = querytiming.WithProgress(ctx, func(value querytiming.Progress) {
			if ctx.Err() != nil {
				return
			}
			select {
			case updates <- value:
			default:
				// Coalesce when a slow browser cannot consume intermediate work.
				select {
				case <-updates:
				default:
				}
				select {
				case updates <- value:
				default:
				}
			}
		})
		response := &progressResponse{header: make(http.Header)}
		done := make(chan struct{})
		go func() {
			defer close(done)
			next.ServeHTTP(response, r.WithContext(ctx))
		}()
		w.Header().Set("Content-Type", "text/event-stream; charset=utf-8")
		w.Header().Set("Cache-Control", "private, no-store")
		w.Header().Set("X-Accel-Buffering", "no")
		control := http.NewResponseController(w)
		write := func(event string, value any) bool {
			data, err := json.Marshal(value)
			if err != nil {
				return false
			}
			_ = control.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if _, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data); err != nil {
				return false
			}
			return control.Flush() == nil
		}
		if !write("progress", querytiming.Progress{Phase: "starting", Message: "正在准备查询"}) {
			return
		}

		var pending *querytiming.Progress
		var last querytiming.Progress
		var lastSent time.Time
		sendProgress := func(value querytiming.Progress) bool {
			// Repeated numeric updates are capped at ten per second. Stage changes
			// and individual upstream pages remain visible immediately.
			if value.Phase == last.Phase && value.Message == last.Message && time.Since(lastSent) < 100*time.Millisecond {
				pending = &value
				return true
			}
			pending = nil
			last, lastSent = value, time.Now()
			return write("progress", value)
		}
		flushPending := func() bool {
			if pending == nil {
				return true
			}
			value := *pending
			pending = nil
			last, lastSent = value, time.Now()
			return write("progress", value)
		}
		tick := time.NewTicker(100 * time.Millisecond)
		defer tick.Stop()
		heartbeat := time.NewTicker(5 * time.Second)
		defer heartbeat.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case value := <-updates:
				if !sendProgress(value) {
					return
				}
			case <-tick.C:
				if !flushPending() {
					return
				}
			case <-heartbeat.C:
				_ = control.SetWriteDeadline(time.Now().Add(10 * time.Second))
				if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
					return
				}
				if control.Flush() != nil {
					return
				}
			case <-done:
				// Drain already-observed stages before the authoritative terminal.
				for len(updates) > 0 {
					if !sendProgress(<-updates) {
						return
					}
				}
				if !flushPending() {
					return
				}
				if !json.Valid(response.body.Bytes()) {
					return
				}
				headers := map[string]string{}
				for _, name := range []string{"Content-Type", "X-Request-ID", "Retry-After", "Server-Timing", "Cache-Control"} {
					if value := response.header.Get(name); value != "" {
						headers[name] = value
					}
				}
				if response.status >= 200 && response.status < 300 {
					if !write("progress", querytiming.Progress{Phase: "complete", Message: "查询完成"}) {
						return
					}
				}
				write("result", struct {
					Status  int               `json:"status"`
					Headers map[string]string `json:"headers"`
					Body    json.RawMessage   `json:"body"`
				}{response.status, headers, response.body.Bytes()})
				return
			}
		}
	})
}

type progressBodyError struct{ err error }

func (r progressBodyError) Read([]byte) (int, error) { return 0, r.err }

func wantsQueryProgress(r *http.Request) bool {
	if r.Method != http.MethodPost {
		return false
	}
	switch r.URL.Path {
	case routeRankings, routeCandidates, routePersonDetail, routePartners, routeCoStar:
	default:
		return false
	}
	for _, value := range strings.Split(r.Header.Get("Accept"), ",") {
		if strings.TrimSpace(value) == "text/event-stream" {
			return true
		}
	}
	return false
}

type progressResponse struct {
	header http.Header
	status int
	body   bytes.Buffer
}

func (w *progressResponse) Header() http.Header { return w.header }
func (w *progressResponse) WriteHeader(status int) {
	if w.status == 0 {
		w.status = status
	}
}
func (w *progressResponse) Write(value []byte) (int, error) {
	if w.status == 0 {
		w.status = http.StatusOK
	}
	return w.body.Write(value)
}

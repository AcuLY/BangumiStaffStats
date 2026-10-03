package publiccollection

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"sync"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

type collectionProgressKey struct{}
type collectionProgress struct {
	mu       sync.Mutex
	received map[string]bool
}

// The admitted client retains pagination/retry/concurrency authority. This
// transport observes successful page body acquisition without copying payloads,
// credentials, usernames or URLs into the progress stream.
type progressTransport struct{ base http.RoundTripper }

func (transport progressTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	progress, _ := request.Context().Value(collectionProgressKey{}).(*collectionProgress)
	if progress == nil {
		return transport.base.RoundTrip(request)
	}
	query := request.URL.Query()
	status := map[string]string{"1": "意向", "2": "已完成", "3": "进行中", "4": "搁置", "5": "抛弃"}[query.Get("type")]
	if status == "" {
		status = "收藏"
	}
	offset, _ := strconv.Atoi(query.Get("offset"))
	limit, _ := strconv.Atoi(query.Get("limit"))
	if limit <= 0 {
		limit = 50
	}
	page := offset/limit + 1
	querytiming.Report(request.Context(), "collection_page", fmt.Sprintf("正在获取%s收藏第 %d 页", status, page))
	response, err := transport.base.RoundTrip(request)
	if err != nil || response == nil || response.StatusCode != http.StatusOK || response.Body == nil {
		return response, err
	}
	response.Body = &progressBody{ReadCloser: response.Body, complete: func() {
		progress.mu.Lock()
		defer progress.mu.Unlock()
		key := query.Get("type") + "/" + query.Get("offset")
		if progress.received[key] {
			return
		}
		progress.received[key] = true
		querytiming.ReportCount(request.Context(), "collection_page", fmt.Sprintf("已接收%s收藏第 %d 页（共收到 %d 页）", status, page, len(progress.received)), len(progress.received), 0)
	}}
	return response, err
}

type progressBody struct {
	io.ReadCloser
	once     sync.Once
	complete func()
}

func (body *progressBody) Read(p []byte) (int, error) {
	n, err := body.ReadCloser.Read(p)
	if err == io.EOF {
		body.once.Do(body.complete)
	}
	return n, err
}

func withCollectionProgress(ctx context.Context) context.Context {
	return context.WithValue(ctx, collectionProgressKey{}, &collectionProgress{received: make(map[string]bool)})
}

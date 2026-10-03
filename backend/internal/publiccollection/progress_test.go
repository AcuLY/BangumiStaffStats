package publiccollection

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/querytiming"
)

func TestProductionCollectionReportsEveryPageWithoutInventingTotal(t *testing.T) {
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = deadlineTransport(func(request *http.Request) (*http.Response, error) {
		// Empty pages remain valid for each explicitly selected collection status.
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"data":[],"total":0,"limit":50,"offset":0}`))}, nil
	})
	var updates []querytiming.Progress
	ctx := querytiming.WithProgress(context.Background(), func(p querytiming.Progress) { updates = append(updates, p) })
	_, err := New().Fetch(ctx, "__synthetic_progress__", "anime", []string{"completed", "wish"})
	if err != nil {
		t.Fatal(err)
	}
	var pages int
	for _, p := range updates {
		if p.Phase == "collection_page" && p.Completed != nil {
			pages++
			if p.Total != nil || *p.Completed != pages {
				t.Fatalf("invented or wrong counters: %+v", p)
			}
		}
		if strings.Contains(p.Message, "__synthetic") {
			t.Fatal("UID leaked in progress")
		}
	}
	if pages != 2 {
		t.Fatal(fmt.Sprintf("received %d page events: %+v", pages, updates))
	}
	if updates[len(updates)-1].Phase != "collection_validate" {
		t.Fatal("missing conversion stage")
	}
}

func TestProductionCollectionPaginationReportsReceivedPagesAndConversion(t *testing.T) {
	previous := http.DefaultTransport
	t.Cleanup(func() { http.DefaultTransport = previous })
	http.DefaultTransport = deadlineTransport(func(request *http.Request) (*http.Response, error) {
		offset, _ := strconv.Atoi(request.URL.Query().Get("offset"))
		records := make([]string, 0, 50)
		for id := offset + 1; id <= min(offset+50, 101); id++ {
			records = append(records, fmt.Sprintf(`{"subject_id":%d,"subject_type":2,"type":2,"rate":8,"comment":"","tags":[],"updated_at":"2026-07-30T04:05:06Z","vol_status":0,"ep_status":0,"private":false,"subject":{"id":%d,"type":2,"name":"Synthetic","name_cn":"合成"}}`, id, id))
		}
		body := fmt.Sprintf(`{"data":[%s],"total":101,"limit":50,"offset":%d}`, strings.Join(records, ","), offset)
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(body))}, nil
	})
	updates := make(chan querytiming.Progress, 32)
	ctx := querytiming.WithProgress(context.Background(), func(p querytiming.Progress) { updates <- p })
	snapshot, err := New().Fetch(ctx, "__synthetic_pages__", "anime", []string{"completed"})
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Items) != 101 {
		t.Fatal(len(snapshot.Items))
	}
	close(updates)
	received := 0
	converted := false
	for p := range updates {
		if p.Phase == "collection_page" && p.Completed != nil {
			received++
			if *p.Completed != received {
				t.Fatal("page counters not monotonic")
			}
		}
		if p.Phase == "collection_validate" && p.Completed != nil && *p.Completed == 101 && p.Total != nil && *p.Total == 101 {
			converted = true
		}
	}
	if received != 3 || !converted {
		t.Fatalf("pages=%d, converted=%t", received, converted)
	}
}

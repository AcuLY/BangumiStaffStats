package httpclient

import (
	"context"
	"errors"
	"net/http"
	"net/url"
	"time"

	"golang.org/x/time/rate"

	"github.com/AcuLY/BangumiStaffStats/backend/config"
)

var (
	limiter          *rate.Limiter
	client           *http.Client
	ErrNetworkFailed error = errors.New("network failed")
)

func Init() error {
	if config.HTTP == nil {
		return errors.New("HTTP config not initialized")
	}

	limiter = rate.NewLimiter(rate.Limit(config.HTTP.RateLimit), config.HTTP.Burst)
	client = &http.Client{Timeout: time.Duration(config.HTTP.Timeout) * time.Second}

	return nil
}

// GET 发送 GET 请求，并进行速率限制。
func GET(ctx context.Context, baseURL string, params map[string][]string) (*http.Response, error) {
	fullURL := baseURL + "?" + url.Values(params).Encode()
	var resp *http.Response

	for i := range config.HTTP.MaxRetries {
		err := limiter.Wait(ctx)
		if err != nil {
			return nil, ErrNetworkFailed
		}

		req, err := http.NewRequestWithContext(ctx, "GET", fullURL, nil)
		if err != nil {
			return nil, ErrNetworkFailed
		}

		req.Header.Set("User-Agent", config.HTTP.UserAgent)
		resp, err = client.Do(req)

		// 等待并重试
		if err != nil {
			waitTime := config.HTTP.RetryWaitTime * (i + 1)
			select {
			case <-ctx.Done():
				return nil, ErrNetworkFailed
			case <-time.After(time.Duration(waitTime)):
				continue
			}
		}

		return resp, nil
	}

	return nil, ErrNetworkFailed
}

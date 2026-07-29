package imageproxy

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestFetchBuildsOnlyTheFixedRequestAndSanitizesMetadata(t *testing.T) {
	var captured *http.Request
	client := testClient(roundTripFunc(func(request *http.Request) (*http.Response, error) {
		captured = request.Clone(request.Context())
		return imageResponse(http.StatusOK, "image/jpeg", []byte("jpeg")), nil
	}), time.Second, 64, 1)
	responseHeaders := http.Header{
		"Etag":                        {`W/"safe"`},
		"Content-Type":                {"image/jpeg"},
		"Last-Modified":               {"Wed, 21 Oct 2015 07:28:00 GMT"},
		"Cache-Control":               {"public, max-age=60"},
		"Set-Cookie":                  {"secret=1"},
		"Www-Authenticate":            {"Bearer private"},
		"Access-Control-Allow-Origin": {"*"},
	}
	client.httpClient.Transport = roundTripFunc(func(request *http.Request) (*http.Response, error) {
		captured = request.Clone(request.Context())
		response := imageResponse(http.StatusOK, "image/jpeg", []byte("jpeg"))
		response.Header = responseHeaders
		return response, nil
	})

	response, err := client.Fetch(context.Background(), Request{
		Resource:        ResourcePersons,
		ID:              42,
		Type:            TypeMedium,
		IfNoneMatch:     `W/"safe"`,
		IfModifiedSince: "Wed, 21 Oct 2015 07:28:00 GMT",
	})
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if string(body) != "jpeg" {
		t.Fatalf("body = %q", body)
	}
	if captured == nil || captured.Method != http.MethodGet ||
		captured.URL.String() != "https://api.bgm.tv/v0/persons/42/image?type=medium" ||
		captured.Host != "api.bgm.tv" {
		t.Fatalf("upstream request = %#v", captured)
	}
	if captured.Header.Get("Cookie") != "" ||
		captured.Header.Get("Authorization") != "" ||
		captured.Header.Get("Proxy-Authorization") != "" ||
		captured.Header.Get("X-Forwarded-Host") != "" {
		t.Fatalf("credential or forwarding header escaped: %#v", captured.Header)
	}
	if captured.Header.Get("If-None-Match") != `W/"safe"` ||
		captured.Header.Get("If-Modified-Since") != "Wed, 21 Oct 2015 07:28:00 GMT" {
		t.Fatalf("conditional headers = %#v", captured.Header)
	}
	if response.ETag != `W/"safe"` ||
		response.LastModified != "Wed, 21 Oct 2015 07:28:00 GMT" ||
		response.CacheControl != "public, max-age=60" {
		t.Fatalf("safe metadata = %#v", response)
	}
}

func TestFetchFollowsOneReviewedImageRedirectAndPreservesBounds(t *testing.T) {
	var calls []*http.Request
	var intermediateClosed atomic.Bool
	client := testClient(roundTripFunc(func(request *http.Request) (*http.Response, error) {
		calls = append(calls, request.Clone(request.Context()))
		switch len(calls) {
		case 1:
			return &http.Response{
				StatusCode: http.StatusFound,
				Header: http.Header{
					"Location": {"https://lain.bgm.tv/r/400/pic/cover/g/aa/bb/1_test.jpg?r=1"},
				},
				Body: &trackedBody{
					Reader: strings.NewReader("redirect"),
					closed: &intermediateClosed,
				},
				ContentLength: 8,
			}, nil
		case 2:
			response := imageResponse(http.StatusOK, "image/jpeg", []byte("image"))
			response.Header.Set("ETag", `"image-v1"`)
			response.Header.Set("Cache-Control", "public, max-age=60")
			return response, nil
		default:
			t.Fatalf("unexpected transport call %d", len(calls))
			return nil, nil
		}
	}), time.Second, 64, 1)

	response, err := client.Fetch(context.Background(), Request{
		Resource:        ResourceSubjects,
		ID:              1,
		Type:            TypeGrid,
		IfNoneMatch:     `"image-v1"`,
		IfModifiedSince: "Wed, 21 Oct 2015 07:28:00 GMT",
	})
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if string(body) != "image" || response.ContentType != "image/jpeg" ||
		response.ContentLength != 5 || response.ETag != `"image-v1"` ||
		response.CacheControl != "public, max-age=60" {
		t.Fatalf("response = %#v body = %q", response, body)
	}
	if !intermediateClosed.Load() {
		t.Fatal("intermediate redirect body was not closed")
	}
	if len(calls) != 2 ||
		calls[0].URL.String() != "https://api.bgm.tv/v0/subjects/1/image?type=grid" ||
		calls[1].URL.String() != "https://lain.bgm.tv/r/400/pic/cover/g/aa/bb/1_test.jpg?r=1" {
		t.Fatalf("upstream calls = %#v", calls)
	}
	for _, call := range calls {
		if call.Method != http.MethodGet ||
			call.Header.Get("Accept") == "" ||
			call.Header.Get("If-None-Match") != `"image-v1"` ||
			call.Header.Get("If-Modified-Since") != "Wed, 21 Oct 2015 07:28:00 GMT" ||
			call.Header.Get("Cookie") != "" ||
			call.Header.Get("Authorization") != "" ||
			call.Header.Get("Proxy-Authorization") != "" {
			t.Fatalf("reviewed request headers = %#v", call)
		}
	}
}

func TestFetchAcceptsTheOfficialDefaultImageRedirect(t *testing.T) {
	var calls atomic.Int64
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		switch calls.Add(1) {
		case 1:
			return redirectResponse("https://lain.bgm.tv/img/no_icon_subject.png"), nil
		case 2:
			return imageResponse(http.StatusOK, "image/png", []byte("default")), nil
		default:
			t.Fatal("unexpected extra request")
			return nil, nil
		}
	}), time.Second, 64, 1)
	response, err := client.Fetch(context.Background(), validTestRequest())
	if err != nil {
		t.Fatal(err)
	}
	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}
	_ = response.Body.Close()
	if string(body) != "default" || calls.Load() != 2 {
		t.Fatalf("body/calls = %q/%d", body, calls.Load())
	}
}

func TestFetchRejectsUnreviewedRedirectsBeforeTheirTargets(t *testing.T) {
	testCases := []struct {
		name      string
		status    int
		locations []string
	}{
		{name: "relative", status: http.StatusFound, locations: []string{"/pic/cover/a.jpg"}},
		{name: "plain HTTP", status: http.StatusFound, locations: []string{"http://lain.bgm.tv/pic/cover/a.jpg"}},
		{name: "other host", status: http.StatusFound, locations: []string{"https://example.com/pic/cover/a.jpg"}},
		{name: "nondefault port", status: http.StatusFound, locations: []string{"https://lain.bgm.tv:444/pic/cover/a.jpg"}},
		{name: "userinfo", status: http.StatusFound, locations: []string{"https://user@lain.bgm.tv/pic/cover/a.jpg"}},
		{name: "fragment", status: http.StatusFound, locations: []string{"https://lain.bgm.tv/pic/cover/a.jpg#private"}},
		{name: "empty fragment", status: http.StatusFound, locations: []string{"https://lain.bgm.tv/pic/cover/a.jpg#"}},
		{name: "missing path", status: http.StatusFound, locations: []string{"https://lain.bgm.tv"}},
		{name: "malformed", status: http.StatusFound, locations: []string{"https://lain.bgm.tv/%"}},
		{name: "oversized", status: http.StatusFound, locations: []string{"https://lain.bgm.tv/" + strings.Repeat("a", maxRedirectURLBytes)}},
		{name: "missing", status: http.StatusFound},
		{name: "duplicate", status: http.StatusFound, locations: []string{"https://lain.bgm.tv/a", "https://lain.bgm.tv/b"}},
		{name: "other redirect status", status: http.StatusMovedPermanently, locations: []string{"https://lain.bgm.tv/a"}},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var calls atomic.Int64
			var closed atomic.Bool
			client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
				calls.Add(1)
				header := make(http.Header)
				for _, location := range testCase.locations {
					header.Add("Location", location)
				}
				return &http.Response{
					StatusCode: testCase.status,
					Header:     header,
					Body: &trackedBody{
						Reader: strings.NewReader("redirect"),
						closed: &closed,
					},
					ContentLength: 8,
				}, nil
			}), time.Second, 64, 1)
			if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorProtocol {
				t.Fatalf("redirect error = %v", err)
			}
			if calls.Load() != 1 || !closed.Load() {
				t.Fatalf("calls/closed = %d/%t", calls.Load(), closed.Load())
			}
		})
	}
}

func TestFetchRejectsASecondRedirectAndClosesBothBodies(t *testing.T) {
	var calls atomic.Int64
	var firstClosed atomic.Bool
	var secondClosed atomic.Bool
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		switch calls.Add(1) {
		case 1:
			response := redirectResponse("https://lain.bgm.tv/pic/cover/a.jpg")
			response.Body = &trackedBody{Reader: strings.NewReader("one"), closed: &firstClosed}
			response.ContentLength = 3
			return response, nil
		case 2:
			response := redirectResponse("https://lain.bgm.tv/pic/cover/b.jpg")
			response.Body = &trackedBody{Reader: strings.NewReader("two"), closed: &secondClosed}
			response.ContentLength = 3
			return response, nil
		default:
			t.Fatal("second redirect was followed")
			return nil, nil
		}
	}), time.Second, 64, 1)
	if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorProtocol {
		t.Fatalf("second redirect error = %v", err)
	}
	if calls.Load() != 2 || !firstClosed.Load() || !secondClosed.Load() {
		t.Fatalf(
			"calls/closed = %d/%t/%t",
			calls.Load(),
			firstClosed.Load(),
			secondClosed.Load(),
		)
	}
}

func TestFetchRejectsInvalidIdentityAndConditionalsBeforeTransport(t *testing.T) {
	var calls atomic.Int64
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return imageResponse(http.StatusOK, "image/jpeg", []byte("x")), nil
	}), time.Second, 64, 1)
	testCases := []Request{
		{Resource: Resource("https://127.0.0.1"), ID: 1, Type: TypeSmall},
		{Resource: ResourceSubjects, ID: 0, Type: TypeSmall},
		{Resource: ResourceSubjects, ID: 1, Type: Type("small&url=http://169.254.169.254")},
		{Resource: ResourceSubjects, ID: 1, Type: TypeSmall, IfNoneMatch: "bad"},
		{Resource: ResourceSubjects, ID: 1, Type: TypeSmall, IfModifiedSince: "private-host"},
	}
	for _, request := range testCases {
		if _, err := client.Fetch(context.Background(), request); kind(t, err) != ErrorInvalid {
			t.Fatalf("request %#v error = %v", request, err)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("invalid inputs reached transport %d times", calls.Load())
	}
}

func TestFetchClassifiesStatusContentTypeAndDeclaredSizeWithoutBodyLeak(t *testing.T) {
	privateBody := "private upstream body http://127.0.0.1"
	testCases := []struct {
		name        string
		status      int
		contentType string
		length      int64
		want        ErrorKind
	}{
		{name: "not found", status: http.StatusNotFound, contentType: "text/plain", want: ErrorNotFound},
		{name: "rate limited", status: http.StatusTooManyRequests, contentType: "text/plain", want: ErrorUnavailable},
		{name: "server error", status: http.StatusBadGateway, contentType: "text/plain", want: ErrorUnavailable},
		{name: "redirect", status: http.StatusFound, contentType: "text/plain", want: ErrorProtocol},
		{name: "unexpected status", status: http.StatusCreated, contentType: "image/jpeg", want: ErrorProtocol},
		{name: "active image", status: http.StatusOK, contentType: "image/svg+xml", want: ErrorProtocol},
		{name: "parameterized image", status: http.StatusOK, contentType: "image/jpeg; charset=utf-8", want: ErrorProtocol},
		{name: "empty", status: http.StatusOK, contentType: "image/jpeg", length: -1, want: ErrorProtocol},
		{name: "declared oversize", status: http.StatusOK, contentType: "image/jpeg", length: 65, want: ErrorProtocol},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			var closed atomic.Bool
			client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
				body := []byte(privateBody)
				if testCase.length == -1 {
					body = nil
				}
				response := &http.Response{
					StatusCode:    testCase.status,
					Header:        http.Header{"Content-Type": {testCase.contentType}},
					Body:          &trackedBody{Reader: bytes.NewReader(body), closed: &closed},
					ContentLength: int64(len(body)),
				}
				if testCase.length > 0 {
					response.ContentLength = testCase.length
				}
				return response, nil
			}), time.Second, 64, 1)
			_, err := client.Fetch(context.Background(), validTestRequest())
			if kind(t, err) != testCase.want {
				t.Fatalf("error = %v", err)
			}
			if err != nil && strings.Contains(err.Error(), privateBody) {
				t.Fatal("stable error leaked upstream body")
			}
			if !closed.Load() {
				t.Fatal("upstream response body was not closed")
			}
		})
	}
}

func TestFetchStreamsAtMostTheActualBodyLimit(t *testing.T) {
	var closed atomic.Bool
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode:    http.StatusOK,
			Header:        http.Header{"Content-Type": {"image/png"}},
			Body:          &trackedBody{Reader: strings.NewReader("12345"), closed: &closed},
			ContentLength: -1,
		}, nil
	}), time.Second, 4, 1)
	response, err := client.Fetch(context.Background(), validTestRequest())
	if err != nil {
		t.Fatal(err)
	}
	body, readErr := io.ReadAll(response.Body)
	if !errors.Is(readErr, ErrBodyTooLarge) || string(body) != "1234" {
		t.Fatalf("read = %q, %v", body, readErr)
	}
	if err := response.Body.Close(); err != nil {
		t.Fatal(err)
	}
	if !closed.Load() {
		t.Fatal("bounded body did not close upstream")
	}
}

func TestFetchRejectsAnEmptyUnknownLengthBodyBeforeHandoff(t *testing.T) {
	var closed atomic.Bool
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode:    http.StatusOK,
			Header:        http.Header{"Content-Type": {"image/jpeg"}},
			Body:          &trackedBody{Reader: strings.NewReader(""), closed: &closed},
			ContentLength: -1,
		}, nil
	}), time.Second, 64, 1)
	if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorProtocol {
		t.Fatalf("empty body error = %v", err)
	}
	if !closed.Load() {
		t.Fatal("empty upstream body was not closed")
	}
}

func TestFetchBoundsConcurrencyUntilBodyClose(t *testing.T) {
	var calls atomic.Int64
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		calls.Add(1)
		return imageResponse(http.StatusOK, "image/webp", []byte("image")), nil
	}), time.Second, 64, 1)
	first, err := client.Fetch(context.Background(), validTestRequest())
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorBusy {
		t.Fatalf("saturation error = %v", err)
	}
	if err := first.Body.Close(); err != nil {
		t.Fatal(err)
	}
	third, err := client.Fetch(context.Background(), validTestRequest())
	if err != nil {
		t.Fatal(err)
	}
	_ = third.Body.Close()
	if calls.Load() != 2 {
		t.Fatalf("transport calls = %d", calls.Load())
	}
}

func TestFetchPropagatesCancellationAndOwnTimeout(t *testing.T) {
	blockingTransport := roundTripFunc(func(request *http.Request) (*http.Response, error) {
		<-request.Context().Done()
		return nil, request.Context().Err()
	})

	parent, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := testClient(blockingTransport, time.Second, 64, 1).Fetch(parent, validTestRequest()); kind(t, err) != ErrorCanceled {
		t.Fatalf("cancellation error = %v", err)
	}

	started := time.Now()
	if _, err := testClient(blockingTransport, 10*time.Millisecond, 64, 1).Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorTimeout {
		t.Fatalf("timeout error = %v", err)
	}
	if time.Since(started) > time.Second {
		t.Fatal("owned timeout did not return promptly")
	}
}

func TestProductionClientHasNoCallerControlledOriginRedirectOrEnvironmentProxy(t *testing.T) {
	client := NewClient()
	if client.origin.String() != upstreamOrigin {
		t.Fatalf("origin = %q", client.origin.String())
	}
	transport, ok := client.httpClient.Transport.(*http.Transport)
	if !ok || transport.Proxy != nil || transport.DialContext == nil ||
		!transport.DisableCompression || transport.MaxResponseHeaderBytes != 64<<10 {
		t.Fatalf("production transport proxy = %#v", client.httpClient.Transport)
	}
	redirectTarget, _ := http.NewRequest(http.MethodGet, "http://169.254.169.254/latest/meta-data", nil)
	if err := client.httpClient.CheckRedirect(redirectTarget, nil); !errors.Is(err, http.ErrUseLastResponse) {
		t.Fatalf("redirect policy = %v", err)
	}

	unsafeOrigin, _ := url.Parse("https://127.0.0.1")
	unsafe := newClient(&http.Client{Transport: roundTripFunc(func(*http.Request) (*http.Response, error) {
		t.Fatal("unsafe origin reached transport")
		return nil, nil
	})}, *unsafeOrigin, time.Second, 64, 1)
	if _, err := unsafe.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorInvalid {
		t.Fatalf("unsafe origin error = %v", err)
	}
}

func TestDedicatedHTTPSProxyIsCanonicalAndIgnoresAmbientProxyState(t *testing.T) {
	t.Setenv("HTTP_PROXY", "http://ambient.invalid:1")
	t.Setenv("HTTPS_PROXY", "http://ambient.invalid:2")
	t.Setenv("ALL_PROXY", "http://ambient.invalid:3")
	t.Setenv("NO_PROXY", "*")
	t.Setenv("http_proxy", "http://ambient.invalid:4")
	t.Setenv("https_proxy", "http://ambient.invalid:5")
	t.Setenv("all_proxy", "http://ambient.invalid:6")
	t.Setenv("no_proxy", "*")

	direct, err := NewClientWithHTTPSProxy(nil)
	if err != nil {
		t.Fatal(err)
	}
	directTransport := direct.httpClient.Transport.(*http.Transport)
	if directTransport.Proxy != nil {
		t.Fatal("ambient proxy selected in direct mode")
	}

	value := "http://proxy-1.internal.example:7897"
	proxied, err := NewClientWithHTTPSProxy(&value)
	if err != nil {
		t.Fatal(err)
	}
	transport := proxied.httpClient.Transport.(*http.Transport)
	for _, target := range []string{
		"https://api.bgm.tv/v0/subjects/1/image?type=grid",
		"https://lain.bgm.tv/pic/cover/a.jpg",
	} {
		request, requestErr := http.NewRequest(http.MethodGet, target, nil)
		if requestErr != nil {
			t.Fatal(requestErr)
		}
		proxyURL, proxyErr := transport.Proxy(request)
		if proxyErr != nil || proxyURL == nil || proxyURL.String() != value {
			t.Fatalf("proxy for %q = %v, %v", target, proxyURL, proxyErr)
		}
	}
}

func TestDedicatedHTTPSProxyRejectsEveryNoncanonicalSpelling(t *testing.T) {
	host253 := strings.Join([]string{
		strings.Repeat("a", 63),
		strings.Repeat("b", 63),
		strings.Repeat("c", 63),
		strings.Repeat("d", 61),
	}, ".")
	accepted := "http://" + host253 + ":65535"
	if _, err := NewClientWithHTTPSProxy(&accepted); err != nil {
		t.Fatalf("boundary proxy rejected: %v", err)
	}

	values := []string{
		"",
		"https://proxy.example:7897",
		"http://proxy.example",
		"http://proxy.example:0",
		"http://proxy.example:01",
		"http://proxy.example:65536",
		"http://Proxy.example:7897",
		"http://-proxy.example:7897",
		"http://proxy-.example:7897",
		"http://proxy..example:7897",
		"http://proxy.example.:7897",
		"http://user@proxy.example:7897",
		"http://proxy.example:7897/",
		"http://proxy.example:7897/path",
		"http://proxy.example:7897?query",
		"http://proxy.example:7897?",
		"http://proxy.example:7897#fragment",
		"http://proxy.example:7897#",
		"http://[::1]:7897",
		"http://pröxy.example:7897",
		"http://" + strings.Repeat("a", 254) + ":7897",
		strings.Repeat("x", maxHTTPSProxyBytes+1),
	}
	for _, value := range values {
		value := value
		t.Run(value, func(t *testing.T) {
			_, err := NewClientWithHTTPSProxy(&value)
			if !errors.Is(err, errInvalidHTTPSProxy) ||
				err.Error() != proxyConfigurationID ||
				value != "" && strings.Contains(err.Error(), value) {
				t.Fatalf("proxy error = %v", err)
			}
		})
	}
}

func TestFixedOriginDialerRejectsHostPortAndNonPublicDNSAnswers(t *testing.T) {
	privateAddresses := []netip.Addr{
		netip.MustParseAddr("0.0.0.1"),
		netip.MustParseAddr("10.0.0.1"),
		netip.MustParseAddr("100.64.0.1"),
		netip.MustParseAddr("127.0.0.1"),
		netip.MustParseAddr("169.254.169.254"),
		netip.MustParseAddr("192.0.2.1"),
		netip.MustParseAddr("192.168.1.1"),
		netip.MustParseAddr("198.18.0.1"),
		netip.MustParseAddr("203.0.113.1"),
		netip.MustParseAddr("::1"),
		netip.MustParseAddr("::ffff:127.0.0.1"),
		netip.MustParseAddr("fc00::1"),
		netip.MustParseAddr("fe80::1"),
		netip.MustParseAddr("2001:db8::1"),
	}
	var dialCalls atomic.Int64
	dialer := fixedOriginDialer{
		resolver: resolverFunc(func(context.Context, string, string) ([]netip.Addr, error) {
			return privateAddresses, nil
		}),
		dialer: dialerFunc(func(context.Context, string, string) (net.Conn, error) {
			dialCalls.Add(1)
			return nil, errors.New("must not dial")
		}),
	}
	if _, err := dialer.DialContext(context.Background(), "tcp", "api.bgm.tv:443"); err == nil {
		t.Fatal("private-only DNS result was accepted")
	}
	for _, target := range []string{
		"127.0.0.1:443",
		"[::1]:443",
		"api.bgm.tv:80",
		"api.bgm.tv:443@127.0.0.1",
	} {
		if _, err := dialer.DialContext(context.Background(), "tcp", target); err == nil {
			t.Fatalf("dial target %q was accepted", target)
		}
	}
	if dialCalls.Load() != 0 {
		t.Fatalf("non-public answer reached dialer %d times", dialCalls.Load())
	}
}

func TestFixedOriginDialerPinsBothApprovedHostsWithoutSecondLookup(t *testing.T) {
	for _, approvedHost := range []string{upstreamHost, imageHost} {
		t.Run(approvedHost, func(t *testing.T) {
			var resolutions atomic.Int64
			var addressesMu sync.Mutex
			var dialed []string
			dialer := fixedOriginDialer{
				resolver: resolverFunc(func(_ context.Context, network, host string) ([]netip.Addr, error) {
					resolutions.Add(1)
					if network != "ip" || host != approvedHost {
						t.Fatalf("lookup = %q %q", network, host)
					}
					return []netip.Addr{
						netip.MustParseAddr("169.254.169.254"),
						netip.MustParseAddr("93.184.216.34"),
					}, nil
				}),
				dialer: dialerFunc(func(_ context.Context, network, address string) (net.Conn, error) {
					addressesMu.Lock()
					dialed = append(dialed, network+" "+address)
					addressesMu.Unlock()
					clientConnection, serverConnection := net.Pipe()
					_ = serverConnection.Close()
					return clientConnection, nil
				}),
			}
			connection, err := dialer.DialContext(
				context.Background(),
				"tcp",
				approvedHost+":443",
			)
			if err != nil {
				t.Fatal(err)
			}
			_ = connection.Close()
			if resolutions.Load() != 1 {
				t.Fatalf("resolution count = %d", resolutions.Load())
			}
			addressesMu.Lock()
			defer addressesMu.Unlock()
			if len(dialed) != 1 || dialed[0] != "tcp 93.184.216.34:443" {
				t.Fatalf("dialed targets = %#v", dialed)
			}
		})
	}
}

func TestFixedProxyDialerReachesOnlyTheConfiguredProxy(t *testing.T) {
	var calls atomic.Int64
	dialer := fixedProxyDialer{
		address: "proxy.internal:7897",
		dialer: dialerFunc(func(_ context.Context, network, address string) (net.Conn, error) {
			calls.Add(1)
			if network != "tcp" || address != "proxy.internal:7897" {
				t.Fatalf("dial = %q %q", network, address)
			}
			clientConnection, serverConnection := net.Pipe()
			_ = serverConnection.Close()
			return clientConnection, nil
		}),
	}
	connection, err := dialer.DialContext(
		context.Background(),
		"tcp",
		"proxy.internal:7897",
	)
	if err != nil {
		t.Fatal(err)
	}
	_ = connection.Close()
	for _, target := range []string{"api.bgm.tv:443", "other.internal:7897"} {
		if _, err := dialer.DialContext(context.Background(), "tcp", target); err == nil {
			t.Fatalf("dial target %q was accepted", target)
		}
	}
	if _, err := dialer.DialContext(
		context.Background(),
		"udp",
		"proxy.internal:7897",
	); err == nil {
		t.Fatal("non-TCP proxy network was accepted")
	}
	if calls.Load() != 1 {
		t.Fatalf("proxy dial calls = %d", calls.Load())
	}
}

func TestRedirectSharesCancellationAndPermitUntilTerminalFailure(t *testing.T) {
	parent, cancel := context.WithCancel(context.Background())
	finalStarted := make(chan struct{})
	var finalOnce sync.Once
	client := testClient(roundTripFunc(func(request *http.Request) (*http.Response, error) {
		if request.URL.Host == upstreamHost {
			return redirectResponse("https://lain.bgm.tv/pic/cover/a.jpg"), nil
		}
		finalOnce.Do(func() { close(finalStarted) })
		<-request.Context().Done()
		return nil, request.Context().Err()
	}), time.Second, 64, 1)
	result := make(chan error, 1)
	go func() {
		_, err := client.Fetch(parent, validTestRequest())
		result <- err
	}()
	select {
	case <-finalStarted:
	case <-time.After(time.Second):
		t.Fatal("redirect target request did not start")
	}
	if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorBusy {
		t.Fatalf("concurrent redirect error = %v", err)
	}
	cancel()
	select {
	case err := <-result:
		if kind(t, err) != ErrorCanceled {
			t.Fatalf("redirect cancellation error = %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("redirect cancellation did not return")
	}
	if len(client.permits) != 0 {
		t.Fatal("redirect cancellation retained its permit")
	}
}

func TestFetchConditional304AndUnsafeCacheMetadata(t *testing.T) {
	client := testClient(roundTripFunc(func(*http.Request) (*http.Response, error) {
		return &http.Response{
			StatusCode: http.StatusNotModified,
			Header: http.Header{
				"Etag":          {`"safe"`},
				"Last-Modified": {"not a date"},
				"Cache-Control": {`public, extension="private"`},
			},
			Body:          http.NoBody,
			ContentLength: 0,
		}, nil
	}), time.Second, 64, 1)
	response, err := client.Fetch(context.Background(), Request{
		Resource:    ResourceCharacters,
		ID:          9,
		Type:        TypeCommon,
		IfNoneMatch: `"safe"`,
	})
	if err != nil {
		t.Fatal(err)
	}
	if response.Status != http.StatusNotModified || response.ETag != `"safe"` ||
		response.LastModified != "" || response.CacheControl != "" {
		t.Fatalf("304 response = %#v", response)
	}

	if _, err := client.Fetch(context.Background(), validTestRequest()); kind(t, err) != ErrorProtocol {
		t.Fatalf("unconditional 304 error = %v", err)
	}
}

func testClient(transport http.RoundTripper, timeout time.Duration, maxBody int64, concurrency int) *Client {
	origin, err := url.Parse(upstreamOrigin)
	if err != nil {
		panic(err)
	}
	return newClient(&http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, *origin, timeout, maxBody, concurrency)
}

func validTestRequest() Request {
	return Request{Resource: ResourceSubjects, ID: 1, Type: TypeGrid}
}

func imageResponse(status int, contentType string, body []byte) *http.Response {
	return &http.Response{
		StatusCode:    status,
		Header:        http.Header{"Content-Type": {contentType}},
		Body:          io.NopCloser(bytes.NewReader(body)),
		ContentLength: int64(len(body)),
	}
}

func redirectResponse(location string) *http.Response {
	return &http.Response{
		StatusCode:    http.StatusFound,
		Header:        http.Header{"Location": {location}},
		Body:          http.NoBody,
		ContentLength: 0,
	}
}

func kind(t *testing.T, err error) ErrorKind {
	t.Helper()
	value, ok := ErrorKindOf(err)
	if !ok {
		t.Fatalf("not an image proxy error: %v", err)
	}
	return value
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (function roundTripFunc) RoundTrip(request *http.Request) (*http.Response, error) {
	return function(request)
}

type resolverFunc func(context.Context, string, string) ([]netip.Addr, error)

func (function resolverFunc) LookupNetIP(
	ctx context.Context,
	network string,
	host string,
) ([]netip.Addr, error) {
	return function(ctx, network, host)
}

type dialerFunc func(context.Context, string, string) (net.Conn, error)

func (function dialerFunc) DialContext(
	ctx context.Context,
	network string,
	address string,
) (net.Conn, error) {
	return function(ctx, network, address)
}

type trackedBody struct {
	io.Reader
	closed *atomic.Bool
	once   sync.Once
}

func (b *trackedBody) Close() error {
	b.once.Do(func() {
		b.closed.Store(true)
	})
	return nil
}

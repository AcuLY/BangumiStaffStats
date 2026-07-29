// Package imageproxy retrieves a closed set of Bangumi image resources
// without accepting a caller-controlled upstream location.
package imageproxy

import (
	"bufio"
	"context"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// MaxBodyBytes is the largest image body the proxy will stream.
	MaxBodyBytes = 8 << 20

	defaultTimeout       = 8 * time.Second
	defaultConcurrency   = 16
	maxRedirectURLBytes  = 2048
	maxHTTPSProxyBytes   = 320
	upstreamOrigin       = "https://api.bgm.tv"
	upstreamHost         = "api.bgm.tv"
	imageHost            = "lain.bgm.tv"
	defaultHTTPSPort     = "443"
	proxyConfigurationID = "image proxy: invalid HTTPS proxy configuration"
)

// Resource is a closed Bangumi image resource collection.
type Resource string

const (
	ResourceSubjects   Resource = "subjects"
	ResourcePersons    Resource = "persons"
	ResourceCharacters Resource = "characters"
)

// Type is a closed Bangumi image representation.
type Type string

const (
	TypeSmall  Type = "small"
	TypeGrid   Type = "grid"
	TypeLarge  Type = "large"
	TypeMedium Type = "medium"
	TypeCommon Type = "common"
)

// ErrorKind is a stable failure classification that contains no upstream
// response detail.
type ErrorKind string

const (
	ErrorInvalid     ErrorKind = "invalid"
	ErrorBusy        ErrorKind = "busy"
	ErrorNotFound    ErrorKind = "not_found"
	ErrorTimeout     ErrorKind = "timeout"
	ErrorCanceled    ErrorKind = "canceled"
	ErrorUnavailable ErrorKind = "unavailable"
	ErrorProtocol    ErrorKind = "protocol"
)

// Error contains only a stable image-proxy failure kind.
type Error struct {
	kind ErrorKind
}

func (e *Error) Error() string {
	if e == nil {
		return ""
	}
	return "image proxy: " + string(e.kind)
}

// Kind returns the stable failure kind.
func (e *Error) Kind() ErrorKind {
	if e == nil {
		return ""
	}
	return e.kind
}

// ErrorKindOf extracts a stable image-proxy classification.
func ErrorKindOf(err error) (ErrorKind, bool) {
	var proxyError *Error
	if !errors.As(err, &proxyError) {
		return "", false
	}
	return proxyError.kind, true
}

var (
	// Stable client failures are immutable sentinels so integration layers can
	// test mappings without constructing errors from upstream text.
	ErrInvalidRequest = &Error{kind: ErrorInvalid}
	ErrBusy           = &Error{kind: ErrorBusy}
	ErrNotFound       = &Error{kind: ErrorNotFound}
	ErrTimeout        = &Error{kind: ErrorTimeout}
	ErrCanceled       = &Error{kind: ErrorCanceled}
	ErrUnavailable    = &Error{kind: ErrorUnavailable}
	ErrProtocol       = &Error{kind: ErrorProtocol}

	// ErrBodyTooLarge is returned by a response body before it can yield a byte
	// beyond MaxBodyBytes.
	ErrBodyTooLarge = errors.New("image proxy: body too large")

	errInvalidHTTPSProxy = errors.New(proxyConfigurationID)
)

// Request contains only validated image identity and reviewed conditionals.
type Request struct {
	Resource        Resource
	ID              uint64
	Type            Type
	IfNoneMatch     string
	IfModifiedSince string
}

// Response contains the bounded upstream body and sanitized metadata.
type Response struct {
	Status        int
	ContentType   string
	ContentLength int64
	ETag          string
	LastModified  string
	CacheControl  string
	Body          io.ReadCloser
}

// Client is a fixed-origin, concurrency-bounded Bangumi image client.
type Client struct {
	httpClient *http.Client
	origin     url.URL
	timeout    time.Duration
	maxBody    int64
	permits    chan struct{}
}

// NewClient constructs the direct production client. The origin cannot be
// supplied by a caller, environment proxy variables are ignored, and
// redirects are never followed automatically.
func NewClient() *Client {
	client, err := NewClientWithHTTPSProxy(nil)
	if err != nil {
		panic(proxyConfigurationID)
	}
	return client
}

// NewClientWithHTTPSProxy constructs a production client using only an
// explicitly supplied dedicated proxy value. A nil value selects direct mode;
// a present empty or invalid value fails without reflecting the value.
func NewClientWithHTTPSProxy(proxyValue *string) (*Client, error) {
	proxyURL, err := parseHTTPSProxy(proxyValue)
	if err != nil {
		return nil, errInvalidHTTPSProxy
	}

	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{
		Timeout:   defaultTimeout,
		KeepAlive: 30 * time.Second,
	}
	if proxyURL == nil {
		transport.Proxy = nil
		transport.DialContext = fixedOriginDialer{
			resolver: net.DefaultResolver,
			dialer:   dialer,
		}.DialContext
	} else {
		transport.Proxy = http.ProxyURL(proxyURL)
		transport.DialContext = fixedProxyDialer{
			address: proxyURL.Host,
			dialer:  dialer,
		}.DialContext
	}
	transport.DisableCompression = true
	transport.MaxConnsPerHost = defaultConcurrency
	transport.MaxIdleConnsPerHost = defaultConcurrency
	transport.MaxResponseHeaderBytes = 64 << 10
	transport.ResponseHeaderTimeout = defaultTimeout
	transport.TLSHandshakeTimeout = defaultTimeout

	origin, err := url.Parse(upstreamOrigin)
	if err != nil {
		panic("fixed Bangumi origin is invalid")
	}
	return newClient(&http.Client{
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}, *origin, defaultTimeout, MaxBodyBytes, defaultConcurrency), nil
}

func parseHTTPSProxy(value *string) (*url.URL, error) {
	if value == nil {
		return nil, nil
	}
	raw := *value
	if raw == "" || len(raw) > maxHTTPSProxyBytes || !strings.HasPrefix(raw, "http://") {
		return nil, errInvalidHTTPSProxy
	}
	for index := range len(raw) {
		if raw[index] > 0x7f {
			return nil, errInvalidHTTPSProxy
		}
	}
	authority := strings.TrimPrefix(raw, "http://")
	if strings.Count(authority, ":") != 1 {
		return nil, errInvalidHTTPSProxy
	}
	host, port, ok := strings.Cut(authority, ":")
	if !ok || !validProxyHost(host) || !validProxyPort(port) {
		return nil, errInvalidHTTPSProxy
	}
	parsed, err := url.Parse(raw)
	if err != nil ||
		parsed.Scheme != "http" ||
		parsed.Host != authority ||
		parsed.Hostname() != host ||
		parsed.Port() != port ||
		parsed.User != nil ||
		parsed.Path != "" ||
		parsed.RawPath != "" ||
		parsed.RawQuery != "" ||
		parsed.ForceQuery ||
		parsed.Fragment != "" ||
		parsed.String() != raw {
		return nil, errInvalidHTTPSProxy
	}
	return parsed, nil
}

func validProxyHost(host string) bool {
	if host == "" || len(host) > 253 || strings.HasPrefix(host, ".") ||
		strings.HasSuffix(host, ".") {
		return false
	}
	for _, label := range strings.Split(host, ".") {
		if len(label) == 0 || len(label) > 63 ||
			!asciiLowerOrDigit(label[0]) ||
			!asciiLowerOrDigit(label[len(label)-1]) {
			return false
		}
		for index := 1; index < len(label)-1; index++ {
			character := label[index]
			if !asciiLowerOrDigit(character) && character != '-' {
				return false
			}
		}
	}
	return true
}

func asciiLowerOrDigit(character byte) bool {
	return character >= 'a' && character <= 'z' ||
		character >= '0' && character <= '9'
}

func validProxyPort(port string) bool {
	if port == "" || len(port) > 5 || port[0] == '0' {
		return false
	}
	for index := range len(port) {
		if port[index] < '0' || port[index] > '9' {
			return false
		}
	}
	value, err := strconv.ParseUint(port, 10, 16)
	return err == nil && value > 0
}

type netIPResolver interface {
	LookupNetIP(context.Context, string, string) ([]netip.Addr, error)
}

type contextDialer interface {
	DialContext(context.Context, string, string) (net.Conn, error)
}

type fixedOriginDialer struct {
	resolver netIPResolver
	dialer   contextDialer
}

func (d fixedOriginDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if ctx == nil || d.resolver == nil || d.dialer == nil {
		return nil, errors.New("image proxy: invalid fixed-origin dialer")
	}
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, errors.New("image proxy: invalid network")
	}
	host, port, err := net.SplitHostPort(address)
	if err != nil || !approvedUpstreamHost(host) || port != defaultHTTPSPort {
		return nil, errors.New("image proxy: invalid dial target")
	}
	addresses, err := d.resolver.LookupNetIP(ctx, "ip", host)
	if err != nil {
		return nil, errors.New("image proxy: fixed origin resolution failed")
	}
	var attempted bool
	for _, candidate := range addresses {
		candidate = candidate.Unmap()
		if !publicUpstreamAddress(candidate) {
			continue
		}
		attempted = true
		connection, dialErr := d.dialer.DialContext(
			ctx,
			network,
			net.JoinHostPort(candidate.String(), port),
		)
		if dialErr == nil {
			return connection, nil
		}
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
	}
	if !attempted {
		return nil, errors.New("image proxy: fixed origin has no public address")
	}
	return nil, errors.New("image proxy: fixed origin unavailable")
}

func approvedUpstreamHost(host string) bool {
	return host == upstreamHost || host == imageHost
}

type fixedProxyDialer struct {
	address string
	dialer  contextDialer
}

func (d fixedProxyDialer) DialContext(ctx context.Context, network, address string) (net.Conn, error) {
	if ctx == nil || d.address == "" || d.dialer == nil {
		return nil, errors.New("image proxy: invalid fixed proxy dialer")
	}
	if network != "tcp" && network != "tcp4" && network != "tcp6" {
		return nil, errors.New("image proxy: invalid proxy network")
	}
	if address != d.address {
		return nil, errors.New("image proxy: invalid proxy dial target")
	}
	return d.dialer.DialContext(ctx, network, address)
}

func publicUpstreamAddress(address netip.Addr) bool {
	if !address.IsValid() || !address.IsGlobalUnicast() ||
		address.IsPrivate() || address.IsLoopback() ||
		address.IsLinkLocalUnicast() || address.IsLinkLocalMulticast() ||
		address.IsMulticast() || address.IsUnspecified() {
		return false
	}
	for _, prefix := range forbiddenUpstreamPrefixes {
		if prefix.Contains(address) {
			return false
		}
	}
	return true
}

var forbiddenUpstreamPrefixes = []netip.Prefix{
	netip.MustParsePrefix("0.0.0.0/8"),
	netip.MustParsePrefix("100.64.0.0/10"),
	netip.MustParsePrefix("192.0.0.0/24"),
	netip.MustParsePrefix("192.0.2.0/24"),
	netip.MustParsePrefix("198.18.0.0/15"),
	netip.MustParsePrefix("198.51.100.0/24"),
	netip.MustParsePrefix("203.0.113.0/24"),
	netip.MustParsePrefix("240.0.0.0/4"),
	netip.MustParsePrefix("100::/64"),
	netip.MustParsePrefix("2001:db8::/32"),
}

func newClient(
	httpClient *http.Client,
	origin url.URL,
	timeout time.Duration,
	maxBody int64,
	concurrency int,
) *Client {
	if httpClient == nil {
		httpClient = &http.Client{}
	}
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	if maxBody <= 0 {
		maxBody = MaxBodyBytes
	}
	if concurrency <= 0 {
		concurrency = defaultConcurrency
	}
	return &Client{
		httpClient: httpClient,
		origin:     origin,
		timeout:    timeout,
		maxBody:    maxBody,
		permits:    make(chan struct{}, concurrency),
	}
}

// Fetch retrieves one image response. It holds a concurrency permit until the
// response body reaches EOF or is closed.
func (c *Client) Fetch(ctx context.Context, request Request) (*Response, error) {
	if c == nil || ctx == nil || !validRequest(request) || !validOrigin(c.origin) {
		return nil, proxyError(ErrorInvalid)
	}
	select {
	case c.permits <- struct{}{}:
	default:
		return nil, proxyError(ErrorBusy)
	}

	requestContext, cancel := context.WithTimeout(ctx, c.timeout)
	release := onceFunc(func() {
		cancel()
		<-c.permits
	})

	upstreamURL := c.origin
	upstreamURL.Path = "/v0/" + string(request.Resource) + "/" + strconv.FormatUint(request.ID, 10) + "/image"
	upstreamURL.RawPath = ""
	upstreamURL.RawQuery = "type=" + string(request.Type)
	upstreamURL.Fragment = ""

	upstreamRequest, err := newUpstreamRequest(requestContext, upstreamURL, request)
	if err != nil {
		release()
		return nil, proxyError(ErrorInvalid)
	}

	upstreamResponse, err := c.httpClient.Do(upstreamRequest)
	if err != nil {
		release()
		return nil, classifyRequestError(ctx, requestContext, err)
	}
	if upstreamResponse == nil || upstreamResponse.Body == nil {
		release()
		return nil, proxyError(ErrorProtocol)
	}

	if upstreamResponse.StatusCode == http.StatusFound {
		redirectURL, redirectErr := reviewedRedirectURL(upstreamResponse)
		_ = upstreamResponse.Body.Close()
		if redirectErr != nil {
			release()
			return nil, proxyError(ErrorProtocol)
		}
		upstreamRequest, err = newUpstreamRequest(requestContext, *redirectURL, request)
		if err != nil {
			release()
			return nil, proxyError(ErrorProtocol)
		}
		upstreamResponse, err = c.httpClient.Do(upstreamRequest)
		if err != nil {
			release()
			return nil, classifyRequestError(ctx, requestContext, err)
		}
		if upstreamResponse == nil || upstreamResponse.Body == nil {
			release()
			return nil, proxyError(ErrorProtocol)
		}
	}

	closeFailure := func(kind ErrorKind) (*Response, error) {
		_ = upstreamResponse.Body.Close()
		release()
		return nil, proxyError(kind)
	}

	switch upstreamResponse.StatusCode {
	case http.StatusOK:
	case http.StatusNotModified:
		if request.IfNoneMatch == "" && request.IfModifiedSince == "" {
			return closeFailure(ErrorProtocol)
		}
		_ = upstreamResponse.Body.Close()
		release()
		return &Response{
			Status:        http.StatusNotModified,
			ContentLength: 0,
			ETag:          safeETag(upstreamResponse.Header.Get("ETag")),
			LastModified:  safeLastModified(upstreamResponse.Header.Get("Last-Modified")),
			CacheControl:  safeCacheControl(upstreamResponse.Header.Get("Cache-Control")),
			Body:          http.NoBody,
		}, nil
	case http.StatusNotFound:
		return closeFailure(ErrorNotFound)
	case http.StatusTooManyRequests:
		return closeFailure(ErrorUnavailable)
	default:
		if upstreamResponse.StatusCode >= 500 && upstreamResponse.StatusCode <= 599 {
			return closeFailure(ErrorUnavailable)
		}
		return closeFailure(ErrorProtocol)
	}

	contentType, err := reviewedContentType(upstreamResponse.Header.Get("Content-Type"))
	if err != nil || upstreamResponse.ContentLength == 0 || upstreamResponse.ContentLength > c.maxBody {
		return closeFailure(ErrorProtocol)
	}
	bufferedBody := bufio.NewReaderSize(upstreamResponse.Body, 512)
	if _, err := bufferedBody.Peek(1); err != nil {
		parentErr := ctx.Err()
		requestErr := requestContext.Err()
		_ = upstreamResponse.Body.Close()
		release()
		if parentErr != nil {
			return nil, proxyError(ErrorCanceled)
		}
		if requestErr != nil {
			return nil, proxyError(ErrorTimeout)
		}
		return nil, proxyError(ErrorProtocol)
	}

	return &Response{
		Status:        http.StatusOK,
		ContentType:   contentType,
		ContentLength: upstreamResponse.ContentLength,
		ETag:          safeETag(upstreamResponse.Header.Get("ETag")),
		LastModified:  safeLastModified(upstreamResponse.Header.Get("Last-Modified")),
		CacheControl:  safeCacheControl(upstreamResponse.Header.Get("Cache-Control")),
		Body: &boundedBody{
			body: &readerCloser{
				Reader: bufferedBody,
				Closer: upstreamResponse.Body,
			},
			remaining: c.maxBody,
			release:   release,
		},
	}, nil
}

func newUpstreamRequest(
	ctx context.Context,
	target url.URL,
	request Request,
) (*http.Request, error) {
	upstreamRequest, err := http.NewRequestWithContext(
		ctx,
		http.MethodGet,
		target.String(),
		nil,
	)
	if err != nil {
		return nil, err
	}
	upstreamRequest.Header.Set(
		"Accept",
		"image/avif,image/webp,image/png,image/jpeg,image/gif",
	)
	if request.IfNoneMatch != "" {
		upstreamRequest.Header.Set("If-None-Match", request.IfNoneMatch)
	}
	if request.IfModifiedSince != "" {
		upstreamRequest.Header.Set("If-Modified-Since", request.IfModifiedSince)
	}
	return upstreamRequest, nil
}

func reviewedRedirectURL(response *http.Response) (*url.URL, error) {
	if response == nil || response.StatusCode != http.StatusFound {
		return nil, errors.New("unreviewed image redirect")
	}
	locations := response.Header.Values("Location")
	if len(locations) != 1 {
		return nil, errors.New("unreviewed image redirect")
	}
	raw := locations[0]
	if raw == "" || len(raw) > maxRedirectURLBytes ||
		strings.ContainsAny(raw, "\r\n#") {
		return nil, errors.New("unreviewed image redirect")
	}
	target, err := url.Parse(raw)
	if err != nil ||
		target.Scheme != "https" ||
		target.Hostname() != imageHost ||
		target.Host != imageHost && target.Host != imageHost+":"+defaultHTTPSPort ||
		target.User != nil ||
		target.Fragment != "" ||
		target.Opaque != "" ||
		target.Path == "" ||
		!strings.HasPrefix(target.Path, "/") {
		return nil, errors.New("unreviewed image redirect")
	}
	return target, nil
}

type readerCloser struct {
	io.Reader
	io.Closer
}

func validRequest(request Request) bool {
	return validResource(request.Resource) &&
		request.ID > 0 &&
		validType(request.Type) &&
		validIfNoneMatch(request.IfNoneMatch) &&
		validIfModifiedSince(request.IfModifiedSince)
}

func validResource(resource Resource) bool {
	switch resource {
	case ResourceSubjects, ResourcePersons, ResourceCharacters:
		return true
	default:
		return false
	}
}

func validType(imageType Type) bool {
	switch imageType {
	case TypeSmall, TypeGrid, TypeLarge, TypeMedium, TypeCommon:
		return true
	default:
		return false
	}
}

func validOrigin(origin url.URL) bool {
	return origin.Scheme == "https" &&
		origin.Host == "api.bgm.tv" &&
		origin.User == nil &&
		origin.Path == "" &&
		origin.RawPath == "" &&
		origin.RawQuery == "" &&
		origin.Fragment == ""
}

func proxyError(kind ErrorKind) error {
	switch kind {
	case ErrorInvalid:
		return ErrInvalidRequest
	case ErrorBusy:
		return ErrBusy
	case ErrorNotFound:
		return ErrNotFound
	case ErrorTimeout:
		return ErrTimeout
	case ErrorCanceled:
		return ErrCanceled
	case ErrorUnavailable:
		return ErrUnavailable
	default:
		return ErrProtocol
	}
}

func classifyRequestError(parent, request context.Context, err error) error {
	switch {
	case parent.Err() != nil || errors.Is(err, context.Canceled):
		return proxyError(ErrorCanceled)
	case request.Err() != nil || errors.Is(err, context.DeadlineExceeded):
		return proxyError(ErrorTimeout)
	default:
		return proxyError(ErrorUnavailable)
	}
}

func reviewedContentType(value string) (string, error) {
	mediaType, parameters, err := mime.ParseMediaType(value)
	if err != nil || len(parameters) != 0 {
		return "", errors.New("unreviewed image content type")
	}
	switch strings.ToLower(mediaType) {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "image/avif":
		return strings.ToLower(mediaType), nil
	default:
		return "", errors.New("unreviewed image content type")
	}
}

func validIfNoneMatch(value string) bool {
	if value == "" {
		return true
	}
	if len(value) > 512 || strings.ContainsAny(value, "\r\n") {
		return false
	}
	if value == "*" {
		return true
	}
	for _, item := range strings.Split(value, ",") {
		if !validETag(strings.TrimSpace(item)) {
			return false
		}
	}
	return true
}

func validIfModifiedSince(value string) bool {
	if value == "" {
		return true
	}
	if len(value) > 128 || strings.ContainsAny(value, "\r\n") {
		return false
	}
	_, err := http.ParseTime(value)
	return err == nil
}

func safeETag(value string) string {
	if len(value) > 256 || !validETag(value) {
		return ""
	}
	return value
}

func validETag(value string) bool {
	if strings.HasPrefix(value, "W/") {
		value = value[2:]
	}
	if len(value) < 2 || value[0] != '"' || value[len(value)-1] != '"' {
		return false
	}
	for _, character := range []byte(value[1 : len(value)-1]) {
		if character != 0x21 && (character < 0x23 || character > 0x7e) {
			return false
		}
	}
	return true
}

func safeLastModified(value string) string {
	if len(value) > 128 || strings.ContainsAny(value, "\r\n") {
		return ""
	}
	parsed, err := http.ParseTime(value)
	if err != nil {
		return ""
	}
	return parsed.UTC().Format(http.TimeFormat)
}

func safeCacheControl(value string) string {
	if value == "" || len(value) > 512 || strings.ContainsAny(value, "\r\n\"\\") {
		return ""
	}
	for _, rawDirective := range strings.Split(value, ",") {
		directive := strings.TrimSpace(rawDirective)
		name, number, hasNumber := strings.Cut(directive, "=")
		switch strings.ToLower(name) {
		case "public", "private", "no-cache", "no-store", "must-revalidate", "proxy-revalidate", "immutable":
			if hasNumber {
				return ""
			}
		case "max-age", "s-maxage", "stale-while-revalidate", "stale-if-error":
			if !hasNumber || number == "" {
				return ""
			}
			seconds, err := strconv.ParseUint(number, 10, 32)
			if err != nil || seconds > 31_536_000 {
				return ""
			}
		default:
			return ""
		}
	}
	return value
}

func onceFunc(function func()) func() {
	var once sync.Once
	return func() {
		once.Do(function)
	}
}

type boundedBody struct {
	body      io.ReadCloser
	remaining int64
	release   func()
}

func (b *boundedBody) Read(destination []byte) (int, error) {
	if b.remaining == 0 {
		var probe [1]byte
		read, err := b.body.Read(probe[:])
		if read > 0 {
			b.release()
			return 0, ErrBodyTooLarge
		}
		if err != nil {
			b.release()
		}
		return 0, err
	}
	if int64(len(destination)) > b.remaining {
		destination = destination[:b.remaining]
	}
	read, err := b.body.Read(destination)
	b.remaining -= int64(read)
	if err != nil {
		b.release()
	}
	return read, err
}

func (b *boundedBody) Close() error {
	err := b.body.Close()
	b.release()
	return err
}

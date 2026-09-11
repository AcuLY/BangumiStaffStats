package archivebuild

import (
	"archive/zip"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"path"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const (
	latestURL            = "https://raw.githubusercontent.com/bangumi/Archive/master/aux/latest.json"
	maxLatestBytes       = int64(64 * 1024)
	maxCommonBytes       = int64(4 * 1024 * 1024)
	maxArchiveBytes      = int64(1024 * 1024 * 1024)
	maxMemberBytes       = uint64(2 * 1024 * 1024 * 1024)
	maxUncompressedBytes = uint64(4 * 1024 * 1024 * 1024)
	copyBufferBytes      = 1024 * 1024
)

var (
	assetNamePattern = regexp.MustCompile(`^dump-[0-9]{4}-[0-9]{2}-[0-9]{2}\.[0-9]{6}Z\.zip$`)
	hostLabelPattern = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$`)
	latestFields     = map[string]struct{}{
		"browser_download_url": {}, "content_type": {}, "created_at": {}, "digest": {},
		"id": {}, "label": {}, "name": {}, "node_id": {}, "size": {}, "updated_at": {}, "url": {},
	}
)

type LatestAsset struct {
	Release string
	URL     string
	Name    string
	Size    int64
	Digest  string
}

type Fetcher interface {
	FetchBytes(context.Context, string, int64, map[string]struct{}) ([]byte, string, error)
	Download(context.Context, string, string, int64, string, int64, map[string]struct{}) (string, error)
}

type NetworkProvider struct {
	Fetcher Fetcher
}

func NewNetworkProvider(proxy string) (NetworkProvider, error) {
	fetcher, err := NewHTTPSFetcher(proxy)
	if err != nil {
		return NetworkProvider{}, err
	}
	return NetworkProvider{Fetcher: fetcher}, nil
}

func (p NetworkProvider) Acquire(ctx context.Context, stagingRoot, commonCommit string) (AcquiredInputs, error) {
	if p.Fetcher == nil {
		return AcquiredInputs{}, failure("HTTPS_CLIENT_INVALID", nil)
	}
	if !commonCommitPattern.MatchString(commonCommit) {
		return AcquiredInputs{}, failure("COMMON_COMMIT_INVALID", nil)
	}
	latestHosts := map[string]struct{}{"raw.githubusercontent.com": {}}
	latestBytes, latestFinal, err := p.Fetcher.FetchBytes(ctx, latestURL, maxLatestBytes, latestHosts)
	if err != nil {
		return AcquiredInputs{}, err
	}
	if latestFinal != latestURL {
		return AcquiredInputs{}, failure("ARCHIVE_LATEST_INVALID", nil)
	}
	latest, err := ParseLatest(latestBytes)
	if err != nil {
		return AcquiredInputs{}, err
	}
	downloadRoot := filepathJoin(stagingRoot, "download")
	if err := os.Mkdir(downloadRoot, 0o750); err != nil {
		return AcquiredInputs{}, failure("STAGING_CREATE_FAILED", err)
	}
	archivePath := filepathJoin(downloadRoot, latest.Name)
	assetHosts := map[string]struct{}{"github.com": {}, "release-assets.githubusercontent.com": {}}
	finalAssetURL, err := p.Fetcher.Download(ctx, latest.URL, archivePath, latest.Size, latest.Digest, maxArchiveBytes, assetHosts)
	if err != nil {
		return AcquiredInputs{}, err
	}
	if err := validateHTTPSURL(finalAssetURL, assetHosts); err != nil {
		return AcquiredInputs{}, err
	}
	commonURL := fmt.Sprintf("https://raw.githubusercontent.com/bangumi/common/%s/subject_staffs.yml", commonCommit)
	commonBytes, commonFinal, err := p.Fetcher.FetchBytes(ctx, commonURL, maxCommonBytes, latestHosts)
	if err != nil {
		return AcquiredInputs{}, err
	}
	if len(commonBytes) == 0 || commonFinal != commonURL {
		return AcquiredInputs{}, failure("COMMON_IDENTITY_INVALID", nil)
	}
	sources, err := VerifyAndExtract(ctx, archivePath, filepathJoin(stagingRoot, "sources"))
	if err != nil {
		return AcquiredInputs{}, err
	}
	return AcquiredInputs{
		ArchiveRelease: latest.Release, ArchiveAssetURL: latest.URL, ArchiveAssetName: latest.Name,
		ArchiveSize: latest.Size, ArchiveDigest: latest.Digest,
		CommonCommit: commonCommit, CommonURL: commonURL, CommonSize: int64(len(commonBytes)),
		CommonDigest: digestBytes(commonBytes), CommonBytes: bytes.Clone(commonBytes), Sources: sources,
	}, nil
}

func ParseLatest(data []byte) (LatestAsset, error) {
	object, err := decodeStrictObject(data)
	if err != nil || len(object) != len(latestFields) || !hasOnlyKeys(object, latestFields) {
		return LatestAsset{}, failure("ARCHIVE_LATEST_INVALID", err)
	}
	name, nameErr := rawString(object["name"], false)
	downloadURL, urlErr := rawString(object["browser_download_url"], false)
	digest, digestErr := rawString(object["digest"], false)
	contentType, typeErr := rawString(object["content_type"], false)
	apiURL, apiErr := rawString(object["url"], false)
	label, labelErr := rawString(object["label"], false)
	nodeID, nodeErr := rawString(object["node_id"], false)
	createdText, createdErr := rawString(object["created_at"], false)
	updatedText, updatedErr := rawString(object["updated_at"], false)
	size, sizeErr := rawInt(object["size"], 1, maxArchiveBytes)
	id, idErr := rawInt(object["id"], 1, maxJSONSafeInteger)
	created, createdParseErr := time.Parse("2006-01-02T15:04:05Z", createdText)
	updated, updatedParseErr := time.Parse("2006-01-02T15:04:05Z", updatedText)
	if nameErr != nil || urlErr != nil || digestErr != nil || typeErr != nil || apiErr != nil ||
		labelErr != nil || nodeErr != nil || createdErr != nil || updatedErr != nil || sizeErr != nil || idErr != nil ||
		createdParseErr != nil || updatedParseErr != nil || updated.Before(created) ||
		!assetNamePattern.MatchString(name) || downloadURL != "https://github.com/bangumi/Archive/releases/download/archive/"+name ||
		!validDigest(digest) || contentType != "application/zip" ||
		apiURL != fmt.Sprintf("https://api.github.com/repos/bangumi/Archive/releases/assets/%d", id) ||
		len(label) > 255 || len(nodeID) < 1 || len(nodeID) > 255 {
		return LatestAsset{}, failure("ARCHIVE_IDENTITY_INVALID", nil)
	}
	return LatestAsset{Release: strings.TrimSuffix(name, ".zip"), URL: downloadURL, Name: name, Size: size, Digest: digest}, nil
}

type HTTPSFetcher struct {
	proxy func(*http.Request) (*url.URL, error)
}

func NewHTTPSFetcher(proxyValue string) (*HTTPSFetcher, error) {
	if proxyValue == "" {
		return &HTTPSFetcher{}, nil
	}
	parsed, err := validateProxy(proxyValue)
	if err != nil {
		return nil, err
	}
	return &HTTPSFetcher{proxy: http.ProxyURL(parsed)}, nil
}

func validateProxy(value string) (*url.URL, error) {
	if len(value) > 320 || !strings.HasPrefix(value, "http://") || strings.ContainsAny(value, "\x80\r\n") {
		return nil, failure("HTTPS_PROXY_INVALID", nil)
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.Path != "" || parsed.RawQuery != "" || parsed.Fragment != "" {
		return nil, failure("HTTPS_PROXY_INVALID", err)
	}
	host := parsed.Hostname()
	portText := parsed.Port()
	if host == "" || len(host) > 253 || portText == "" || strings.Contains(host, ":") {
		return nil, failure("HTTPS_PROXY_INVALID", nil)
	}
	for _, label := range strings.Split(host, ".") {
		if !hostLabelPattern.MatchString(label) {
			return nil, failure("HTTPS_PROXY_INVALID", nil)
		}
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 || strconv.Itoa(port) != portText {
		return nil, failure("HTTPS_PROXY_INVALID", err)
	}
	if parsed.Host != net.JoinHostPort(host, portText) {
		return nil, failure("HTTPS_PROXY_INVALID", nil)
	}
	return parsed, nil
}

func validateHTTPSURL(value string, allowed map[string]struct{}) error {
	parsed, err := url.Parse(value)
	if err != nil || parsed.Scheme != "https" || parsed.User != nil || parsed.Fragment != "" ||
		(parsed.Port() != "" && parsed.Port() != "443") {
		return failure("HTTPS_ORIGIN_INVALID", err)
	}
	if _, ok := allowed[parsed.Hostname()]; !ok {
		return failure("HTTPS_ORIGIN_INVALID", nil)
	}
	return nil
}

func (f *HTTPSFetcher) client(allowed map[string]struct{}) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	transport.Proxy = f.proxy
	return &http.Client{
		Transport: transport,
		CheckRedirect: func(request *http.Request, _ []*http.Request) error {
			return validateHTTPSURL(request.URL.String(), allowed)
		},
	}
}

func (f *HTTPSFetcher) open(ctx context.Context, location string, allowed map[string]struct{}) (*http.Response, error) {
	if err := validateHTTPSURL(location, allowed); err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, location, nil)
	if err != nil {
		return nil, failure("HTTPS_REQUEST_FAILED", err)
	}
	request.Header.Set("Accept", "application/octet-stream, application/json")
	request.Header.Set("User-Agent", "BangumiStaffStats-backend/0.1.0")
	response, err := f.client(allowed).Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return nil, contextError(ctx)
		}
		return nil, failure("HTTPS_REQUEST_FAILED", err)
	}
	if response.StatusCode != http.StatusOK {
		response.Body.Close()
		return nil, failure("HTTPS_STATUS_INVALID", nil)
	}
	if err := validateHTTPSURL(response.Request.URL.String(), allowed); err != nil {
		response.Body.Close()
		return nil, err
	}
	return response, nil
}

func (f *HTTPSFetcher) FetchBytes(ctx context.Context, location string, maximum int64, allowed map[string]struct{}) ([]byte, string, error) {
	response, err := f.open(ctx, location, allowed)
	if err != nil {
		return nil, "", err
	}
	defer response.Body.Close()
	if response.ContentLength > maximum {
		return nil, "", failure("HTTPS_SIZE_INVALID", nil)
	}
	reader := io.LimitReader(response.Body, maximum+1)
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, "", failure("HTTPS_REQUEST_FAILED", err)
	}
	if len(data) == 0 || int64(len(data)) > maximum ||
		(response.ContentLength >= 0 && int64(len(data)) != response.ContentLength) {
		return nil, "", failure("HTTPS_SIZE_INVALID", nil)
	}
	return data, response.Request.URL.String(), nil
}

func (f *HTTPSFetcher) Download(ctx context.Context, location, destination string, expectedSize int64, expectedDigest string, maximum int64, allowed map[string]struct{}) (string, error) {
	if expectedSize < 0 || expectedSize > maximum || !validDigest(expectedDigest) {
		return "", failure("ARCHIVE_IDENTITY_INVALID", nil)
	}
	response, err := f.open(ctx, location, allowed)
	if err != nil {
		return "", err
	}
	defer response.Body.Close()
	if response.ContentLength != expectedSize {
		return "", failure("SOURCE_SIZE_MISMATCH", nil)
	}
	file, err := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return "", failure("SOURCE_FILE_INVALID", err)
	}
	hash := sha256.New()
	written, copyErr := copyContext(ctx, io.MultiWriter(file, hash), io.LimitReader(response.Body, maximum+1))
	closeErr := file.Close()
	if copyErr == nil {
		copyErr = closeErr
	}
	if copyErr != nil || written != expectedSize || "sha256:"+hex.EncodeToString(hash.Sum(nil)) != expectedDigest {
		_ = os.Remove(destination)
		if ctx.Err() != nil {
			return "", contextError(ctx)
		}
		if copyErr != nil {
			return "", failure("HTTPS_REQUEST_FAILED", copyErr)
		}
		if written != expectedSize {
			return "", failure("SOURCE_SIZE_MISMATCH", nil)
		}
		return "", failure("SOURCE_DIGEST_MISMATCH", nil)
	}
	return response.Request.URL.String(), nil
}

func copyContext(ctx context.Context, destination io.Writer, source io.Reader) (int64, error) {
	buffer := make([]byte, copyBufferBytes)
	var written int64
	for {
		if err := contextError(ctx); err != nil {
			return written, err
		}
		count, readErr := source.Read(buffer)
		if count > 0 {
			output, writeErr := destination.Write(buffer[:count])
			written += int64(output)
			if writeErr != nil {
				return written, writeErr
			}
			if output != count {
				return written, io.ErrShortWrite
			}
		}
		if readErr == io.EOF {
			return written, nil
		}
		if readErr != nil {
			return written, readErr
		}
	}
}

func VerifyAndExtract(ctx context.Context, archivePath, destination string) ([]SourceInput, error) {
	metadata, err := os.Lstat(archivePath)
	if err != nil || !metadata.Mode().IsRegular() || metadata.Mode()&os.ModeSymlink != 0 {
		return nil, failure("ARCHIVE_ZIP_INVALID", err)
	}
	archive, err := zip.OpenReader(archivePath)
	if err != nil {
		return nil, failure("ARCHIVE_ZIP_INVALID", err)
	}
	defer archive.Close()
	expected := make(map[string]struct{}, len(ArchiveMemberNames))
	for _, name := range ArchiveMemberNames {
		expected[name] = struct{}{}
	}
	if len(archive.File) != len(expected) {
		return nil, failure("ARCHIVE_ZIP_INVALID", nil)
	}
	byName := make(map[string]*zip.File, len(archive.File))
	var total uint64
	for _, member := range archive.File {
		name := member.Name
		_, admitted := expected[name]
		mode := member.Mode()
		if !admitted || path.Base(name) != name || strings.Contains(name, "/") || name == "." ||
			member.Flags&0x1 != 0 || (member.Method != zip.Store && member.Method != zip.Deflate) ||
			member.UncompressedSize64 > maxMemberBytes || mode&os.ModeSymlink != 0 || mode.IsDir() ||
			(mode.Type() != 0 && !mode.IsRegular()) {
			return nil, failure("ARCHIVE_ZIP_INVALID", nil)
		}
		if _, duplicate := byName[name]; duplicate {
			return nil, failure("ARCHIVE_ZIP_INVALID", nil)
		}
		if member.CompressedSize64 == 0 {
			if member.UncompressedSize64 != 0 {
				return nil, failure("ARCHIVE_ZIP_INVALID", nil)
			}
		} else if member.UncompressedSize64/member.CompressedSize64 > 200 {
			return nil, failure("ARCHIVE_ZIP_INVALID", nil)
		}
		total += member.UncompressedSize64
		if total > maxUncompressedBytes {
			return nil, failure("ARCHIVE_ZIP_INVALID", nil)
		}
		byName[name] = member
	}
	if err := os.Mkdir(destination, 0o750); err != nil {
		return nil, failure("STAGING_CREATE_FAILED", err)
	}
	sources := make([]SourceInput, 0, len(SourceNames))
	for _, name := range SourceNames {
		if err := contextError(ctx); err != nil {
			return nil, err
		}
		member := byName[name]
		input, err := member.Open()
		if err != nil {
			return nil, failure("ARCHIVE_ZIP_INVALID", err)
		}
		target := filepathJoin(destination, name)
		output, err := os.OpenFile(target, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
		if err != nil {
			input.Close()
			return nil, failure("ARCHIVE_ZIP_INVALID", err)
		}
		hash := sha256.New()
		size, copyErr := copyContext(ctx, io.MultiWriter(output, hash), io.LimitReader(input, int64(member.UncompressedSize64)+1))
		inputErr := input.Close()
		outputErr := output.Close()
		if copyErr == nil {
			copyErr = inputErr
		}
		if copyErr == nil {
			copyErr = outputErr
		}
		if copyErr != nil || uint64(size) != member.UncompressedSize64 {
			return nil, failure("ARCHIVE_ZIP_INVALID", copyErr)
		}
		digest := "sha256:" + hex.EncodeToString(hash.Sum(nil))
		sources = append(sources, SourceInput{Name: name, Path: target, Size: size, Digest: digest, DeclaredSize: size, DeclaredDigest: digest})
	}
	return sources, nil
}

func filepathJoin(root, name string) string {
	if strings.ContainsAny(name, `/\\`) || name == "" || name == "." || name == ".." {
		panic("archivebuild: unsafe internal filename")
	}
	return root + string(os.PathSeparator) + name
}

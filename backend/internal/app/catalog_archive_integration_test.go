package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/catalog"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

func TestCanonicalArchiveServesReadyAndCatalogWithoutFixtureRewrite(t *testing.T) {
	archiveRoot := arrangeArchive(t)
	pointerData, err := os.ReadFile(filepath.Join(archiveRoot, "current.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		PointerSchemaVersion int    `json:"pointerSchemaVersion"`
		DataVersion          string `json:"dataVersion"`
		ManifestDigest       string `json:"manifestDigest"`
	}
	decodeStrictJSON(t, pointerData, &pointer)
	if pointer.PointerSchemaVersion != 1 || pointer.ManifestDigest == "" {
		t.Fatalf("pointer = %#v", pointer)
	}

	store, err := archive.LoadCandidate(
		context.Background(),
		archiveRoot,
		pointer.DataVersion,
	)
	if err != nil {
		t.Fatalf("load canonical Archive: %v", err)
	}
	projected, projectErr := catalog.Project(context.Background(), store)
	closeErr := store.Close()
	if projectErr != nil || closeErr != nil {
		t.Fatalf("project canonical Archive: %v; close: %v", projectErr, closeErr)
	}
	if projected.DataVersion != pointer.DataVersion {
		t.Fatalf(
			"projected dataVersion = %q, pointer = %q",
			projected.DataVersion,
			pointer.DataVersion,
		)
	}
	assertBoundedCanonicalCatalog(t, projected.Data)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	state := new(archive.State)
	runtimeObservability := testRuntimeObservability(t, io.Discard)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		result <- runListener(
			ctx,
			listener,
			archiveRoot,
			networkDependencies(state, runtimeObservability),
		)
	}()
	t.Cleanup(func() {
		cancel()
		select {
		case runErr := <-result:
			if runErr != nil {
				t.Errorf("runListener: %v", runErr)
			}
		case <-time.After(5 * time.Second):
			t.Error("runListener did not stop")
		}
	})

	client := &http.Client{Timeout: 5 * time.Second}
	readyResponse := getResponse(t, client, listener, "/readyz")
	if readyResponse.status != http.StatusOK {
		t.Fatalf("ready = %d %q", readyResponse.status, readyResponse.body)
	}
	var readyEnvelope struct {
		Data struct {
			Status string `json:"status"`
		} `json:"data"`
		Meta struct {
			RequestID   string `json:"requestId"`
			DataVersion string `json:"dataVersion"`
		} `json:"meta"`
	}
	decodeStrictJSON(t, []byte(readyResponse.body), &readyEnvelope)
	if readyEnvelope.Data.Status != "ready" ||
		readyEnvelope.Meta.RequestID == "" ||
		readyEnvelope.Meta.DataVersion != pointer.DataVersion {
		t.Fatalf("ready envelope = %#v, pointer = %#v", readyEnvelope, pointer)
	}

	catalogResponse := getResponse(t, client, listener, "/api/v1/catalog")
	if catalogResponse.status != http.StatusOK {
		t.Fatalf("catalog = %d %q", catalogResponse.status, catalogResponse.body)
	}
	var catalogEnvelope wire.CatalogSuccessEnvelopeV1
	decodeStrictJSON(t, []byte(catalogResponse.body), &catalogEnvelope)
	if catalogEnvelope.Meta.RequestId == "" ||
		catalogEnvelope.Meta.DataVersion != pointer.DataVersion ||
		catalogEnvelope.Meta.DataVersion != readyEnvelope.Meta.DataVersion {
		t.Fatalf(
			"catalog meta = %#v, ready meta = %#v, pointer = %#v",
			catalogEnvelope.Meta,
			readyEnvelope.Meta,
			pointer,
		)
	}
	if strings.Contains(catalogResponse.body, "positionId=") ||
		strings.Contains(catalogResponse.body, "roleType=") ||
		strings.Contains(catalogResponse.body, `"select:`) {
		t.Fatalf("catalog exposed a legacy selection rule: %s", catalogResponse.body)
	}
	assertBoundedCanonicalCatalog(t, catalogEnvelope.Data)

	projectedJSON, err := json.Marshal(projected.Data)
	if err != nil {
		t.Fatal(err)
	}
	responseJSON, err := json.Marshal(catalogEnvelope.Data)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(projectedJSON, responseJSON) {
		t.Fatalf(
			"HTTP catalog differs from direct projection\nprojected: %s\nresponse: %s",
			projectedJSON,
			responseJSON,
		)
	}
}

func assertBoundedCanonicalCatalog(t *testing.T, data wire.CatalogDataV1) {
	t.Helper()
	capabilities := []wire.CatalogPositionCapabilityNameV1{
		wire.CatalogPositionCapabilityNameV1Rankings,
		wire.CatalogPositionCapabilityNameV1Candidates,
		wire.CatalogPositionCapabilityNameV1PersonDetail,
		wire.CatalogPositionCapabilityNameV1Partners,
		wire.CatalogPositionCapabilityNameV1CoStar,
	}
	if len(data.Positions) != 3 {
		t.Fatalf("positions = %#v", data.Positions)
	}
	staff, err := data.Positions[0].AsCatalogStaffPositionV1()
	if err != nil {
		t.Fatal(err)
	}
	if staff.Key != "staff:anime:2" ||
		staff.Kind != "staff" ||
		staff.SubjectType != wire.Anime ||
		staff.Label != "导演" ||
		staff.Names.Cn != "导演" ||
		staff.Names.En == nil ||
		*staff.Names.En != "Director" ||
		staff.Names.Jp == nil ||
		*staff.Names.Jp != "監督" ||
		staff.DisplayOrder != 10 ||
		staff.Status != wire.CatalogStaffPositionV1StatusSelectable ||
		staff.PositionId != 2 ||
		!slices.Equal(staff.Categories, []string{"production"}) ||
		!slices.Equal(staff.Capabilities, capabilities) {
		t.Fatalf("staff position = %#v", staff)
	}

	mainCast, err := data.Positions[1].AsCatalogCastPositionV1()
	if err != nil {
		t.Fatal(err)
	}
	if mainCast.Key != "cast:anime:main" ||
		mainCast.Kind != "cast" ||
		mainCast.SubjectType != wire.Anime ||
		mainCast.Label != "声优（仅主役）" ||
		mainCast.Names.Cn != "声优（仅主役）" ||
		mainCast.Names.En != nil ||
		mainCast.Names.Jp != nil ||
		mainCast.DisplayOrder != 20 ||
		mainCast.Status != wire.CatalogCastPositionV1StatusSelectable ||
		mainCast.ExclusiveGroup != "cast:anime" ||
		mainCast.RoleScope != wire.Main ||
		!slices.Equal(mainCast.Categories, []string{"cast"}) ||
		!slices.Equal(mainCast.Capabilities, capabilities) {
		t.Fatalf("main cast position = %#v", mainCast)
	}

	allCast, err := data.Positions[2].AsCatalogCastPositionV1()
	if err != nil {
		t.Fatal(err)
	}
	if allCast.Key != "cast:anime:all" ||
		allCast.Kind != "cast" ||
		allCast.SubjectType != wire.Anime ||
		allCast.Label != "声优" ||
		allCast.Names.Cn != "声优" ||
		allCast.Names.En != nil ||
		allCast.Names.Jp != nil ||
		allCast.DisplayOrder != 30 ||
		allCast.Status != wire.CatalogCastPositionV1StatusSelectable ||
		allCast.ExclusiveGroup != "cast:anime" ||
		allCast.RoleScope != wire.All ||
		!slices.Equal(allCast.Categories, []string{"cast"}) ||
		!slices.Equal(allCast.Capabilities, capabilities) {
		t.Fatalf("all cast position = %#v", allCast)
	}

	if len(data.Groups) != 2 {
		t.Fatalf("groups = %#v", data.Groups)
	}
	featured := data.Groups[0]
	if featured.Key != "shortcut:anime:featured" ||
		featured.Kind != wire.Shortcut ||
		featured.SubjectType != wire.Anime ||
		featured.Label != "常用职位" ||
		featured.DisplayOrder != 10 ||
		!slices.Equal(
			featured.PositionKeys,
			[]string{"staff:anime:2", "cast:anime:main"},
		) {
		t.Fatalf("featured group = %#v", featured)
	}
	category := data.Groups[1]
	if category.Key != "bangumi:anime:production" ||
		category.Kind != wire.Bangumi ||
		category.SubjectType != wire.Anime ||
		category.Label != "制作" ||
		category.DisplayOrder != 20 ||
		!slices.Equal(category.PositionKeys, []string{"staff:anime:2"}) {
		t.Fatalf("category group = %#v", category)
	}

	rules := make(map[string]wire.CatalogSelectionRuleV1)
	for _, rule := range data.SelectionRules {
		if _, duplicate := rules[rule.PositionKey]; duplicate {
			t.Fatalf("duplicate catalog rule for %q", rule.PositionKey)
		}
		rules[rule.PositionKey] = rule
	}
	expected := map[string]wire.CatalogSelectionRuleV1{
		"staff:anime:2": {
			Key:         "rule:staff:anime:2",
			PositionKey: "staff:anime:2",
			Kind:        wire.ExactStaff,
			Value:       "2",
		},
		"cast:anime:main": {
			Key:         "rule:cast:anime:main",
			PositionKey: "cast:anime:main",
			Kind:        wire.ExactCast,
			Value:       "1",
		},
		"cast:anime:all": {
			Key:         "rule:cast:anime:all",
			PositionKey: "cast:anime:all",
			Kind:        wire.ExactCast,
			Value:       "1..6",
		},
	}
	if len(rules) != len(expected) {
		t.Fatalf("selection rules = %#v", rules)
	}
	for positionKey, want := range expected {
		if got := rules[positionKey]; got != want {
			t.Fatalf("selection rule %q = %#v, want %#v", positionKey, got, want)
		}
	}
}

func decodeStrictJSON(t *testing.T, data []byte, destination any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(destination); err != nil {
		t.Fatal(err)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		t.Fatalf("JSON has trailing content: %v", err)
	}
}

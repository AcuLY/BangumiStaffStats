package archivebuild

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestLiveArchiveBuild(t *testing.T) {
	root := os.Getenv("BGMSS_LIVE_ARCHIVE_ROOT")
	if root == "" {
		t.Skip("BGMSS_LIVE_ARCHIVE_ROOT is not set")
	}
	config := RunConfig{
		OutputRoot: root, GeneratorVersion: "backend-go-integration-v1",
	}
	if sourceRoot := os.Getenv("BGMSS_LIVE_SOURCE_ROOT"); sourceRoot != "" {
		config.Provider = liveSourceProvider{root: sourceRoot}
	}
	result, err := RunOnce(context.Background(), config)
	if err != nil {
		var buildErr *Error
		if errors.As(err, &buildErr) {
			t.Fatalf("RunOnce: code=%s source=%s line=%d cause=%v", buildErr.Code, buildErr.Source, buildErr.Line, buildErr.Cause)
		}
		t.Fatalf("RunOnce: %T %v", err, err)
	}
	t.Logf("RunOnce: status=%s dataVersion=%s root=%s", result.Status, result.DataVersion, result.VersionRoot)
}

type liveSourceProvider struct{ root string }

func (provider liveSourceProvider) Acquire(
	ctx context.Context,
	_ string,
	commonCommit string,
) (AcquiredInputs, error) {
	fetcher, err := NewHTTPSFetcher("")
	if err != nil {
		return AcquiredInputs{}, err
	}
	commonURL := "https://raw.githubusercontent.com/bangumi/common/" + commonCommit + "/subject_staffs.yml"
	common, finalURL, err := fetcher.FetchBytes(
		ctx,
		commonURL,
		maxCommonBytes,
		map[string]struct{}{"raw.githubusercontent.com": {}},
	)
	if err != nil {
		return AcquiredInputs{}, err
	}
	inputs := make([]SourceInput, 0, len(SourceNames))
	var archiveSize int64
	for _, name := range SourceNames {
		path := filepath.Join(provider.root, name)
		size, digest, err := digestFile(ctx, path)
		if err != nil {
			return AcquiredInputs{}, err
		}
		archiveSize += size
		inputs = append(inputs, SourceInput{
			Name: name, Path: path, Size: size, Digest: digest,
			DeclaredSize: size, DeclaredDigest: digest,
		})
	}
	return AcquiredInputs{
		ArchiveRelease:   "dump-2026-09-01.210329Z",
		ArchiveAssetURL:  "https://github.com/bangumi/Archive/releases/download/archive/dump-2026-09-01.210329Z.zip",
		ArchiveAssetName: "dump-2026-09-01.210329Z.zip",
		ArchiveSize:      archiveSize,
		ArchiveDigest:    digestBytes([]byte("local-complete-source-integration")),
		CommonCommit:     commonCommit,
		CommonURL:        finalURL,
		CommonSize:       int64(len(common)),
		CommonDigest:     digestBytes(common),
		CommonBytes:      common,
		Sources:          inputs,
	}, nil
}

type fixtureProvider struct {
	common  []byte
	sources map[string][]byte
}

func (p fixtureProvider) Acquire(ctx context.Context, stagingRoot, commonCommit string) (AcquiredInputs, error) {
	if err := contextError(ctx); err != nil {
		return AcquiredInputs{}, err
	}
	sourceRoot := filepath.Join(stagingRoot, "sources")
	if err := os.Mkdir(sourceRoot, 0o750); err != nil {
		return AcquiredInputs{}, err
	}
	inputs := make([]SourceInput, 0, len(SourceNames))
	for _, name := range SourceNames {
		data := p.sources[name]
		location := filepath.Join(sourceRoot, name)
		if err := os.WriteFile(location, data, 0o640); err != nil {
			return AcquiredInputs{}, err
		}
		digest := digestBytes(data)
		inputs = append(inputs, SourceInput{Name: name, Path: location, Size: int64(len(data)), Digest: digest, DeclaredSize: int64(len(data)), DeclaredDigest: digest})
	}
	commonURL := "https://raw.githubusercontent.com/bangumi/common/" + commonCommit + "/subject_staffs.yml"
	return AcquiredInputs{ArchiveRelease: "dump-2026-07-21.210441Z", ArchiveAssetURL: "https://github.com/bangumi/Archive/releases/download/archive/dump-2026-07-21.210441Z.zip", ArchiveAssetName: "dump-2026-07-21.210441Z.zip", ArchiveSize: 123, ArchiveDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", CommonCommit: commonCommit, CommonURL: commonURL, CommonSize: int64(len(p.common)), CommonDigest: digestBytes(p.common), CommonBytes: p.common, Sources: inputs}, nil
}

func loadFixtureProvider(t *testing.T) fixtureProvider {
	t.Helper()
	caseBytes, err := os.ReadFile(filepath.Join(repositoryRoot(t), "contracts", "goldens", "catalog", "cases", "complete-derivation.json"))
	if err != nil {
		t.Fatal(err)
	}
	var value derivationCase
	if err := json.Unmarshal(caseBytes, &value); err != nil {
		t.Fatal(err)
	}
	typeCodes := map[string]int64{"book": 1, "anime": 2, "music": 3, "game": 4, "real": 6}
	records := map[string][]any{}
	for _, item := range value.Input.Archive.Subjects {
		records["subject.jsonlines"] = append(records["subject.jsonlines"], map[string]any{"id": item.SubjectID, "type": typeCodes[item.SubjectType], "name": "subject", "name_cn": "", "nsfw": false, "date": ""})
	}
	for _, item := range value.Input.Archive.Persons {
		records["person.jsonlines"] = append(records["person.jsonlines"], map[string]any{"id": item.PersonID, "name": "person", "career": []string{"seiyu"}})
	}
	for _, item := range value.Input.Archive.Characters {
		records["character.jsonlines"] = append(records["character.jsonlines"], map[string]any{"id": item.CharacterID, "name": "character"})
	}
	for _, item := range value.Input.Archive.StaffCredits {
		records["subject-persons.jsonlines"] = append(records["subject-persons.jsonlines"], map[string]any{"subject_id": item.SubjectID, "person_id": item.PersonID, "position": item.PositionID})
	}
	for _, item := range value.Input.Archive.SubjectCharacters {
		records["subject-characters.jsonlines"] = append(records["subject-characters.jsonlines"], map[string]any{"subject_id": item.SubjectID, "character_id": item.CharacterID, "type": item.Type, "order": item.Order})
	}
	for _, item := range value.Input.Archive.PersonCharacters {
		records["person-characters.jsonlines"] = append(records["person-characters.jsonlines"], map[string]any{"subject_id": item.SubjectID, "character_id": item.CharacterID, "person_id": item.PersonID})
	}
	for _, item := range value.Input.Archive.SubjectRelations {
		records["subject-relations.jsonlines"] = append(records["subject-relations.jsonlines"], map[string]any{"subject_id": item.SubjectID, "related_subject_id": item.RelatedSubjectID, "relation_type": item.RelationType})
	}
	sources := make(map[string][]byte, len(SourceNames))
	for _, name := range SourceNames {
		for _, record := range records[name] {
			encoded, err := json.Marshal(record)
			if err != nil {
				t.Fatal(err)
			}
			sources[name] = append(sources[name], encoded...)
			sources[name] = append(sources[name], '\n')
		}
	}
	return fixtureProvider{common: append(append([]byte(nil), value.Input.CommonCatalog...), '\n'), sources: sources}
}

func TestRunOncePublishesThenReturnsNoChange(t *testing.T) {
	root := t.TempDir()
	config := RunConfig{OutputRoot: root, CommonCommit: DefaultCommonCommit, GeneratorVersion: "test", GeneratedAt: time.Date(2026, 7, 25, 0, 0, 0, 0, time.UTC), Provider: loadFixtureProvider(t)}
	first, err := RunOnce(context.Background(), config)
	if err != nil {
		t.Fatalf("first RunOnce: %s", ErrorCode(err))
	}
	if first.Status != StatusPublished {
		t.Fatalf("first status = %s", first.Status)
	}
	entries, err := os.ReadDir(first.VersionRoot)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 {
		t.Fatalf("candidate entries = %d", len(entries))
	}
	second, err := RunOnce(context.Background(), config)
	if err != nil {
		t.Fatalf("second RunOnce: %s", ErrorCode(err))
	}
	if second.Status != StatusNoChange || second.DataVersion != first.DataVersion || second.ManifestDigest != first.ManifestDigest {
		t.Fatalf("second = %+v, first = %+v", second, first)
	}
	stages, err := filepath.Glob(filepath.Join(root, ".bgmss-stage-*"))
	if err != nil || len(stages) != 0 {
		t.Fatalf("staging remains: %v %v", stages, err)
	}
}

func TestRunOnceCancellationLeavesNoCandidate(t *testing.T) {
	root := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := RunOnce(ctx, RunConfig{OutputRoot: root, GeneratorVersion: "test", Provider: loadFixtureProvider(t)})
	if ErrorCode(err) != "CANCELED" {
		t.Fatalf("error = %v", err)
	}
	entries, readErr := os.ReadDir(filepath.Join(root, "versions"))
	if readErr != nil {
		t.Fatal(readErr)
	}
	if len(entries) != 0 {
		t.Fatalf("versions = %v", entries)
	}
}

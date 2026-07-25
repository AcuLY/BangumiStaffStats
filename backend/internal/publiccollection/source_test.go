package publiccollection

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"strings"
	"testing"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	collection "github.com/AcuLY/bangumi-collection-go"
)

type stubClient struct {
	subjects []*collection.Subject
	err      error
	fetch    func(context.Context) ([]*collection.Subject, error)

	calls       int
	uid         string
	subjectType collection.SubjectType
	statuses    []collection.CollectionType
}

func (stub *stubClient) Fetch(
	ctx context.Context,
	uid string,
	subjectType collection.SubjectType,
	statuses ...collection.CollectionType,
) ([]*collection.Subject, error) {
	stub.calls++
	stub.uid = uid
	stub.subjectType = subjectType
	stub.statuses = append([]collection.CollectionType(nil), statuses...)
	if stub.fetch != nil {
		return stub.fetch(ctx)
	}
	return stub.subjects, stub.err
}

func TestFetchMapsAllSubjectTypesStatusesAndFields(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.July, 25, 9, 8, 7, 654321000, time.FixedZone("JST", 9*60*60))
	subjectTypes := []struct {
		internal string
		external collection.SubjectType
	}{
		{internal: "book", external: collection.SubjectTypeBook},
		{internal: "anime", external: collection.SubjectTypeAnime},
		{internal: "music", external: collection.SubjectTypeMusic},
		{internal: "game", external: collection.SubjectTypeGame},
		{internal: "real", external: collection.SubjectTypeReal},
	}
	statuses := []string{"dropped", "completed", "on_hold", "in_progress", "completed"}
	externalStatuses := []collection.CollectionType{
		collection.CollectionTypeDropped,
		collection.CollectionTypeDone,
		collection.CollectionTypeOnHold,
		collection.CollectionTypeDoing,
		collection.CollectionTypeDone,
	}

	for _, subjectType := range subjectTypes {
		subjectType := subjectType
		t.Run(subjectType.internal, func(t *testing.T) {
			t.Parallel()

			stub := &stubClient{subjects: []*collection.Subject{
				validSubject(101, subjectType.external, collection.CollectionTypeDone, updatedAt),
				validSubject(102, subjectType.external, collection.CollectionTypeDoing, updatedAt.Add(time.Second)),
				validSubject(103, subjectType.external, collection.CollectionTypeOnHold, updatedAt.Add(2*time.Second)),
				validSubject(104, subjectType.external, collection.CollectionTypeDropped, updatedAt.Add(3*time.Second)),
			}}
			snapshot, err := newSource(stub).Fetch(
				context.Background(),
				"  Alice  ",
				subjectType.internal,
				statuses,
			)
			if err != nil {
				t.Fatalf("Fetch() error = %v", err)
			}
			if stub.calls != 1 || stub.uid != "Alice" || stub.subjectType != subjectType.external {
				t.Fatalf(
					"client call = calls:%d uid:%q subject:%d",
					stub.calls,
					stub.uid,
					stub.subjectType,
				)
			}
			if !reflect.DeepEqual(stub.statuses, externalStatuses) {
				t.Fatalf("client statuses = %#v, want %#v", stub.statuses, externalStatuses)
			}

			want := runtimecache.CollectionSnapshot{Items: []runtimecache.CollectionItem{
				{
					SubjectID:       101,
					SubjectType:     subjectType.internal,
					Status:          "completed",
					Rate:            8,
					Comment:         "complete comment",
					Tags:            []string{"tag-a", "tag-b"},
					VolumeProgress:  4,
					EpisodeProgress: 12,
					Private:         true,
					UpdatedAt:       updatedAt,
				},
				{
					SubjectID:       102,
					SubjectType:     subjectType.internal,
					Status:          "in_progress",
					Rate:            8,
					Comment:         "complete comment",
					Tags:            []string{"tag-a", "tag-b"},
					VolumeProgress:  4,
					EpisodeProgress: 12,
					Private:         true,
					UpdatedAt:       updatedAt.Add(time.Second),
				},
				{
					SubjectID:       103,
					SubjectType:     subjectType.internal,
					Status:          "on_hold",
					Rate:            8,
					Comment:         "complete comment",
					Tags:            []string{"tag-a", "tag-b"},
					VolumeProgress:  4,
					EpisodeProgress: 12,
					Private:         true,
					UpdatedAt:       updatedAt.Add(2 * time.Second),
				},
				{
					SubjectID:       104,
					SubjectType:     subjectType.internal,
					Status:          "dropped",
					Rate:            8,
					Comment:         "complete comment",
					Tags:            []string{"tag-a", "tag-b"},
					VolumeProgress:  4,
					EpisodeProgress: 12,
					Private:         true,
					UpdatedAt:       updatedAt.Add(3 * time.Second),
				},
			}}
			if !reflect.DeepEqual(snapshot, want) {
				t.Fatalf("snapshot = %#v, want %#v", snapshot, want)
			}
		})
	}
}

func TestFetchReturnsNonNilEmptySnapshot(t *testing.T) {
	t.Parallel()

	snapshot, err := newSource(&stubClient{}).Fetch(
		context.Background(),
		"alice",
		"anime",
		[]string{"completed"},
	)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}
	if snapshot.Items == nil || len(snapshot.Items) != 0 {
		t.Fatalf("empty snapshot items = %#v, want non-nil empty slice", snapshot.Items)
	}
}

func TestFetchDefensivelyCopiesReturnedRecords(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.July, 25, 1, 2, 3, 0, time.UTC)
	external := validSubject(55, collection.SubjectTypeAnime, collection.CollectionTypeDone, updatedAt)
	stub := &stubClient{subjects: []*collection.Subject{external}}

	snapshot, err := newSource(stub).Fetch(
		context.Background(),
		"alice",
		"anime",
		[]string{"completed"},
	)
	if err != nil {
		t.Fatalf("Fetch() error = %v", err)
	}

	external.SubjectID = 999
	external.Comment = "mutated"
	external.Tags[0] = "mutated"
	stub.subjects[0] = nil

	item := snapshot.Items[0]
	if item.SubjectID != 55 ||
		item.Comment != "complete comment" ||
		!reflect.DeepEqual(item.Tags, []string{"tag-a", "tag-b"}) {
		t.Fatalf("snapshot aliases external record: %#v", item)
	}
}

func TestFetchRejectsInputBeforeClientCall(t *testing.T) {
	t.Parallel()

	canceledContext, cancel := context.WithCancel(context.Background())
	cancel()
	expiredContext, expire := context.WithDeadline(context.Background(), time.Now().Add(-time.Second))
	defer expire()

	tests := []struct {
		name        string
		ctx         context.Context
		uid         string
		subjectType string
		statuses    []string
		wantKind    runtimecache.CollectionFailureKind
		wantCancel  bool
	}{
		{
			name: "nil context", ctx: nil, uid: "alice", subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "canceled context", ctx: canceledContext, uid: "alice", subjectType: "anime",
			statuses: []string{"completed"}, wantCancel: true,
		},
		{
			name: "expired context", ctx: expiredContext, uid: "alice", subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureTimeout,
		},
		{
			name: "empty uid", ctx: context.Background(), uid: "  ", subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "long uid", ctx: context.Background(), uid: strings.Repeat("x", 257), subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "invalid utf8 uid", ctx: context.Background(), uid: string([]byte{0xff}), subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "control uid", ctx: context.Background(), uid: "ali\nce", subjectType: "anime",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "unknown subject type", ctx: context.Background(), uid: "alice", subjectType: "movie",
			statuses: []string{"completed"}, wantKind: runtimecache.FailureOther,
		},
		{
			name: "no statuses", ctx: context.Background(), uid: "alice", subjectType: "anime",
			statuses: nil, wantKind: runtimecache.FailureOther,
		},
		{
			name: "unknown status", ctx: context.Background(), uid: "alice", subjectType: "anime",
			statuses: []string{"wish"}, wantKind: runtimecache.FailureOther,
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			stub := &stubClient{}
			snapshot, err := newSource(stub).Fetch(
				test.ctx,
				test.uid,
				test.subjectType,
				test.statuses,
			)
			if stub.calls != 0 {
				t.Fatalf("client called %d times for invalid input", stub.calls)
			}
			if len(snapshot.Items) != 0 {
				t.Fatalf("invalid input returned partial snapshot: %#v", snapshot)
			}
			if test.wantCancel {
				if !errors.Is(err, context.Canceled) {
					t.Fatalf("error = %v, want context.Canceled", err)
				}
				return
			}
			assertFailureKind(t, err, test.wantKind)
		})
	}
}

func TestFetchRejectsImpossibleReturnedDataWithoutPartialSnapshot(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.July, 25, 1, 2, 3, 0, time.UTC)
	base := func() *collection.Subject {
		return validSubject(11, collection.SubjectTypeAnime, collection.CollectionTypeDone, updatedAt)
	}
	tests := []struct {
		name     string
		statuses []string
		subjects func() []*collection.Subject
	}{
		{name: "nil record", subjects: func() []*collection.Subject { return []*collection.Subject{nil} }},
		{name: "non-positive subject id", subjects: func() []*collection.Subject {
			value := base()
			value.ID, value.SubjectID = 0, 0
			return []*collection.Subject{value}
		}},
		{name: "inconsistent id alias", subjects: func() []*collection.Subject {
			value := base()
			value.ID++
			return []*collection.Subject{value}
		}},
		{name: "mismatched subject type", subjects: func() []*collection.Subject {
			value := base()
			value.SubjectType = collection.SubjectTypeMusic
			return []*collection.Subject{value}
		}},
		{name: "unrequested status", subjects: func() []*collection.Subject {
			value := base()
			value.Type = collection.CollectionTypeDropped
			return []*collection.Subject{value}
		}},
		{name: "invalid status", subjects: func() []*collection.Subject {
			value := base()
			value.Type = collection.CollectionTypeWish
			return []*collection.Subject{value}
		}},
		{name: "negative rate", subjects: func() []*collection.Subject {
			value := base()
			value.Rate = -1
			return []*collection.Subject{value}
		}},
		{name: "rate over ten", subjects: func() []*collection.Subject {
			value := base()
			value.Rate = 11
			return []*collection.Subject{value}
		}},
		{name: "negative volume progress", subjects: func() []*collection.Subject {
			value := base()
			value.VolStatus = -1
			return []*collection.Subject{value}
		}},
		{name: "negative episode progress", subjects: func() []*collection.Subject {
			value := base()
			value.EpStatus = -1
			return []*collection.Subject{value}
		}},
		{name: "zero update time", subjects: func() []*collection.Subject {
			value := base()
			value.UpdatedAt = time.Time{}
			return []*collection.Subject{value}
		}},
		{name: "invalid utf8 comment", subjects: func() []*collection.Subject {
			value := base()
			value.Comment = string([]byte{0xff})
			return []*collection.Subject{value}
		}},
		{name: "nil tags", subjects: func() []*collection.Subject {
			value := base()
			value.Tags = nil
			return []*collection.Subject{value}
		}},
		{name: "invalid utf8 tag", subjects: func() []*collection.Subject {
			value := base()
			value.Tags = []string{string([]byte{0xff})}
			return []*collection.Subject{value}
		}},
		{
			name:     "duplicate subject across statuses",
			statuses: []string{"completed", "dropped"},
			subjects: func() []*collection.Subject {
				first := base()
				second := base()
				second.Type = collection.CollectionTypeDropped
				return []*collection.Subject{first, second}
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			statuses := test.statuses
			if len(statuses) == 0 {
				statuses = []string{"completed"}
			}
			snapshot, err := newSource(&stubClient{subjects: test.subjects()}).Fetch(
				context.Background(),
				"alice",
				"anime",
				statuses,
			)
			if len(snapshot.Items) != 0 {
				t.Fatalf("invalid response returned partial snapshot: %#v", snapshot)
			}
			assertFailureKind(t, err, runtimecache.FailureDecode)
		})
	}
}

func TestFetchClassifiesAndSanitizesFailures(t *testing.T) {
	t.Parallel()

	const secret = "alice token=secret response-body"
	tests := []struct {
		name string
		err  error
		kind runtimecache.CollectionFailureKind
	}{
		{name: "not found", err: fmt.Errorf("%s: %w", secret, collection.ErrNotFound), kind: runtimecache.FailureNotFound},
		{name: "http not found", err: &collection.HTTPError{StatusCode: 404}, kind: runtimecache.FailureNotFound},
		{name: "unauthorized", err: collection.ErrUnauthorized, kind: runtimecache.FailureForbidden},
		{name: "forbidden", err: collection.ErrForbidden, kind: runtimecache.FailureForbidden},
		{name: "rate limited", err: collection.ErrRateLimited, kind: runtimecache.FailureRateLimited},
		{
			name: "retry exhausted rate limited",
			err:  &collection.RetryError{Attempts: 4, Err: collection.ErrRateLimited},
			kind: runtimecache.FailureRateLimited,
		},
		{name: "server error", err: collection.ErrServerError, kind: runtimecache.FailureUpstream5xx},
		{name: "timeout", err: collection.ErrTimeout, kind: runtimecache.FailureTimeout},
		{name: "deadline", err: context.DeadlineExceeded, kind: runtimecache.FailureTimeout},
		{name: "transport", err: fmt.Errorf("%s: %w", secret, collection.ErrTransport), kind: runtimecache.FailureNetwork},
		{name: "decode", err: collection.ErrDecode, kind: runtimecache.FailureDecode},
		{name: "protocol", err: collection.ErrProtocol, kind: runtimecache.FailureDecode},
		{name: "oversized", err: collection.ErrResponseTooLarge, kind: runtimecache.FailureDecode},
		{name: "invalid configuration", err: collection.ErrInvalidConfiguration, kind: runtimecache.FailureOther},
		{name: "invalid user id", err: collection.ErrInvalidUserID, kind: runtimecache.FailureOther},
		{name: "unexpected status", err: collection.ErrHTTPStatus, kind: runtimecache.FailureOther},
		{name: "canceled without parent cancellation", err: collection.ErrCanceled, kind: runtimecache.FailureOther},
		{name: "unclassified", err: errors.New(secret), kind: runtimecache.FailureOther},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			snapshot, err := newSource(&stubClient{err: test.err}).Fetch(
				context.Background(),
				"alice",
				"anime",
				[]string{"completed"},
			)
			if len(snapshot.Items) != 0 {
				t.Fatalf("failure returned partial snapshot: %#v", snapshot)
			}
			assertFailureKind(t, err, test.kind)
			if strings.Contains(err.Error(), "alice") ||
				strings.Contains(err.Error(), "secret") ||
				strings.Contains(err.Error(), "response-body") {
				t.Fatalf("mapped error leaked upstream data: %q", err)
			}
			if errors.Is(err, test.err) {
				t.Fatalf("mapped error retained external cause: %v", err)
			}
		})
	}
}

func TestFetchPreservesParentCancellation(t *testing.T) {
	t.Parallel()

	ctx, cancel := context.WithCancel(context.Background())
	stub := &stubClient{fetch: func(context.Context) ([]*collection.Subject, error) {
		cancel()
		return nil, fmt.Errorf("private upstream detail: %w", collection.ErrTransport)
	}}

	_, err := newSource(stub).Fetch(
		ctx,
		"alice",
		"anime",
		[]string{"completed"},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Fetch() error = %v, want context.Canceled", err)
	}
}

func TestFetchStopsDuringAdaptationWhenParentIsCanceled(t *testing.T) {
	t.Parallel()

	updatedAt := time.Date(2026, time.July, 25, 1, 2, 3, 0, time.UTC)
	first := validSubject(
		1,
		collection.SubjectTypeAnime,
		collection.CollectionTypeDone,
		updatedAt,
	)
	second := validSubject(
		2,
		collection.SubjectTypeAnime,
		collection.CollectionTypeDone,
		updatedAt,
	)
	invalidLaterRecord := validSubject(
		3,
		collection.SubjectTypeAnime,
		collection.CollectionTypeDone,
		time.Time{},
	)
	stub := &stubClient{subjects: []*collection.Subject{
		first,
		second,
		invalidLaterRecord,
	}}
	ctx := &cancelDuringAdaptationContext{
		Context:  context.Background(),
		cancelAt: 4,
	}

	snapshot, err := newSource(stub).Fetch(
		ctx,
		"alice",
		"anime",
		[]string{"completed"},
	)
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Fetch() error = %v, want context.Canceled", err)
	}
	if len(snapshot.Items) != 0 {
		t.Fatalf("canceled adaptation returned partial snapshot: %#v", snapshot)
	}
	if stub.calls != 1 {
		t.Fatalf("client calls = %d, want 1", stub.calls)
	}
}

func TestNilSourceAndNilClientReturnSanitizedOtherFailure(t *testing.T) {
	t.Parallel()

	var nilSource *Source
	_, err := nilSource.Fetch(
		context.Background(),
		"alice",
		"anime",
		[]string{"completed"},
	)
	assertFailureKind(t, err, runtimecache.FailureOther)

	_, err = newSource(nil).Fetch(
		context.Background(),
		"alice",
		"anime",
		[]string{"completed"},
	)
	assertFailureKind(t, err, runtimecache.FailureOther)
}

type cancelDuringAdaptationContext struct {
	context.Context
	checks   int
	cancelAt int
}

func (ctx *cancelDuringAdaptationContext) Err() error {
	ctx.checks++
	if ctx.checks >= ctx.cancelAt {
		return context.Canceled
	}
	return nil
}

func validSubject(
	id int,
	subjectType collection.SubjectType,
	status collection.CollectionType,
	updatedAt time.Time,
) *collection.Subject {
	return &collection.Subject{
		ID:          id,
		SubjectID:   id,
		SubjectType: subjectType,
		Type:        status,
		Name:        "Name",
		NameCn:      "名称",
		Rate:        8,
		Comment:     "complete comment",
		Tags:        []string{"tag-a", "tag-b"},
		UpdatedAt:   updatedAt,
		VolStatus:   4,
		EpStatus:    12,
		Private:     true,
	}
}

func assertFailureKind(
	t *testing.T,
	err error,
	want runtimecache.CollectionFailureKind,
) {
	t.Helper()
	var failure *runtimecache.CollectionFailure
	if !errors.As(err, &failure) {
		t.Fatalf("error = %T %v, want *runtimecache.CollectionFailure", err, err)
	}
	if failure.Kind() != want {
		t.Fatalf("failure kind = %q, want %q", failure.Kind(), want)
	}
	if got, expected := err.Error(), "collection_"+string(want); got != expected {
		t.Fatalf("failure message = %q, want %q", got, expected)
	}
}

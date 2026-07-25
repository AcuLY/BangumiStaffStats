// Package publiccollection adapts the admitted anonymous Bangumi collection
// client to the backend's internal immutable collection snapshot.
package publiccollection

import (
	"context"
	"errors"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	collection "github.com/AcuLY/bangumi-collection-go"
)

const userAgent = "BangumiStaffStats/1.0 (+https://github.com/AcuLY/BangumiStaffStats)"

var errAdapterFailure = errors.New("public_collection_adapter_failure")

type client interface {
	Fetch(
		context.Context,
		string,
		collection.SubjectType,
		...collection.CollectionType,
	) ([]*collection.Subject, error)
}

// Source is one concurrency-safe anonymous public-collection provider.
//
// Source retains no collection values. Each successful Fetch returns a fresh
// internal snapshot which does not alias the external client's records.
type Source struct {
	client client
}

// New constructs the process-wide production source with a fixed identifying
// User-Agent. The admitted client has no credential or Cookie configuration.
func New() *Source {
	return newAnonymousSource()
}

func newAnonymousSource(options ...collection.Option) *Source {
	return newSource(collection.NewClient(userAgent, options...))
}

func newSource(client client) *Source {
	return &Source{client: client}
}

// Fetch retrieves and validates one complete public collection snapshot.
func (source *Source) Fetch(
	ctx context.Context,
	uid string,
	subjectType string,
	statuses []string,
) (runtimecache.CollectionSnapshot, error) {
	if ctx == nil {
		return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureOther)
	}
	if err := contextFailure(ctx); err != nil {
		return runtimecache.CollectionSnapshot{}, err
	}

	normalizedUID, valid := normalizeUID(uid)
	if !valid {
		return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureOther)
	}
	externalSubjectType, valid := mapSubjectType(subjectType)
	if !valid || len(statuses) == 0 {
		return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureOther)
	}

	externalStatuses := make([]collection.CollectionType, len(statuses))
	selectedStatuses := make(map[collection.CollectionType]struct{}, len(statuses))
	for index, status := range statuses {
		externalStatus, known := mapCollectionStatus(status)
		if !known {
			return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureOther)
		}
		externalStatuses[index] = externalStatus
		selectedStatuses[externalStatus] = struct{}{}
	}
	if source == nil || source.client == nil {
		return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureOther)
	}

	subjects, err := source.client.Fetch(
		ctx,
		normalizedUID,
		externalSubjectType,
		externalStatuses...,
	)
	if err != nil {
		return runtimecache.CollectionSnapshot{}, classifyFailure(ctx, err)
	}
	if err := contextFailure(ctx); err != nil {
		return runtimecache.CollectionSnapshot{}, err
	}

	items := make([]runtimecache.CollectionItem, 0, len(subjects))
	seenSubjects := make(map[int]struct{}, len(subjects))
	for _, subject := range subjects {
		if err := contextFailure(ctx); err != nil {
			return runtimecache.CollectionSnapshot{}, err
		}
		if !validReturnedSubject(subject, externalSubjectType, selectedStatuses) {
			return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureDecode)
		}
		if _, duplicate := seenSubjects[subject.SubjectID]; duplicate {
			return runtimecache.CollectionSnapshot{}, collectionFailure(runtimecache.FailureDecode)
		}
		seenSubjects[subject.SubjectID] = struct{}{}

		status, _ := mapReturnedStatus(subject.Type)
		tags := make([]string, len(subject.Tags))
		copy(tags, subject.Tags)
		items = append(items, runtimecache.CollectionItem{
			SubjectID:       int64(subject.SubjectID),
			SubjectType:     subjectType,
			Status:          status,
			Rate:            subject.Rate,
			Comment:         subject.Comment,
			Tags:            tags,
			VolumeProgress:  subject.VolStatus,
			EpisodeProgress: subject.EpStatus,
			Private:         subject.Private,
			UpdatedAt:       subject.UpdatedAt,
		})
	}
	if err := contextFailure(ctx); err != nil {
		return runtimecache.CollectionSnapshot{}, err
	}

	return runtimecache.CollectionSnapshot{Items: items}, nil
}

func normalizeUID(uid string) (string, bool) {
	if !utf8.ValidString(uid) {
		return "", false
	}
	normalized := strings.TrimFunc(uid, unicode.IsSpace)
	if normalized == "" || len(normalized) > 256 {
		return "", false
	}
	for _, value := range normalized {
		if unicode.IsControl(value) {
			return "", false
		}
	}
	return normalized, true
}

func mapSubjectType(value string) (collection.SubjectType, bool) {
	switch value {
	case "book":
		return collection.SubjectTypeBook, true
	case "anime":
		return collection.SubjectTypeAnime, true
	case "music":
		return collection.SubjectTypeMusic, true
	case "game":
		return collection.SubjectTypeGame, true
	case "real":
		return collection.SubjectTypeReal, true
	default:
		return 0, false
	}
}

func mapCollectionStatus(value string) (collection.CollectionType, bool) {
	switch value {
	case "completed":
		return collection.CollectionTypeDone, true
	case "in_progress":
		return collection.CollectionTypeDoing, true
	case "on_hold":
		return collection.CollectionTypeOnHold, true
	case "dropped":
		return collection.CollectionTypeDropped, true
	default:
		return 0, false
	}
}

func mapReturnedStatus(value collection.CollectionType) (string, bool) {
	switch value {
	case collection.CollectionTypeDone:
		return "completed", true
	case collection.CollectionTypeDoing:
		return "in_progress", true
	case collection.CollectionTypeOnHold:
		return "on_hold", true
	case collection.CollectionTypeDropped:
		return "dropped", true
	default:
		return "", false
	}
}

func validReturnedSubject(
	subject *collection.Subject,
	expectedSubjectType collection.SubjectType,
	selectedStatuses map[collection.CollectionType]struct{},
) bool {
	if subject == nil ||
		subject.SubjectID <= 0 ||
		subject.ID != subject.SubjectID ||
		subject.SubjectType != expectedSubjectType ||
		subject.Rate < 0 || subject.Rate > 10 ||
		subject.VolStatus < 0 ||
		subject.EpStatus < 0 ||
		subject.UpdatedAt.IsZero() ||
		!utf8.ValidString(subject.Comment) ||
		subject.Tags == nil {
		return false
	}
	if _, valid := mapReturnedStatus(subject.Type); !valid {
		return false
	}
	if _, selected := selectedStatuses[subject.Type]; !selected {
		return false
	}
	for _, tag := range subject.Tags {
		if !utf8.ValidString(tag) {
			return false
		}
	}
	return true
}

func classifyFailure(ctx context.Context, err error) error {
	if contextErr := contextFailure(ctx); contextErr != nil {
		return contextErr
	}

	switch {
	case errors.Is(err, collection.ErrNotFound):
		return collectionFailure(runtimecache.FailureNotFound)
	case errors.Is(err, collection.ErrUnauthorized),
		errors.Is(err, collection.ErrForbidden):
		return collectionFailure(runtimecache.FailureForbidden)
	case errors.Is(err, collection.ErrRateLimited):
		return collectionFailure(runtimecache.FailureRateLimited)
	case errors.Is(err, collection.ErrServerError):
		return collectionFailure(runtimecache.FailureUpstream5xx)
	case errors.Is(err, collection.ErrTimeout),
		errors.Is(err, context.DeadlineExceeded):
		return collectionFailure(runtimecache.FailureTimeout)
	case errors.Is(err, collection.ErrTransport):
		return collectionFailure(runtimecache.FailureNetwork)
	case errors.Is(err, collection.ErrDecode),
		errors.Is(err, collection.ErrProtocol),
		errors.Is(err, collection.ErrResponseTooLarge):
		return collectionFailure(runtimecache.FailureDecode)
	default:
		return collectionFailure(runtimecache.FailureOther)
	}
}

func contextFailure(ctx context.Context) error {
	switch err := ctx.Err(); {
	case errors.Is(err, context.Canceled):
		return context.Canceled
	case errors.Is(err, context.DeadlineExceeded):
		return collectionFailure(runtimecache.FailureTimeout)
	default:
		return nil
	}
}

func collectionFailure(kind runtimecache.CollectionFailureKind) error {
	failure, err := runtimecache.NewCollectionFailure(kind, nil)
	if err != nil {
		return errAdapterFailure
	}
	return failure
}

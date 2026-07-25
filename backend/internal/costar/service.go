package costar

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Service owns co-star query evaluation, admitted collection acquisition,
// immutable expensive cores, and independent common-work projections.
type Service struct {
	stores      StoreProvider
	collections CollectionProvider
	collection  *runtimecache.CollectionCache
	results     *Store
	runtime     *runtimecache.QueryRuntime
}

// NewService constructs an isolated co-star service for focused tests and
// non-process use. Production app assembly uses NewServiceWithRuntime.
func NewService(
	stores StoreProvider,
	collections CollectionProvider,
	config Config,
) (*Service, error) {
	binding, err := ResultBinding()
	if err != nil {
		return nil, fmt.Errorf("costar: create result binding: %w", err)
	}
	queryRuntime, err := runtimecache.NewQueryRuntime(runtimecache.QueryRuntimeConfig{
		Executor:   config.Executor,
		Collection: config.Collection,
		Result:     config.Result,
	}, binding)
	if err != nil {
		return nil, fmt.Errorf("costar: create query runtime: %w", err)
	}
	return NewServiceWithRuntime(stores, collections, queryRuntime)
}

// NewServiceWithRuntime constructs a co-star service on shared process
// resources.
func NewServiceWithRuntime(
	stores StoreProvider,
	collections CollectionProvider,
	queryRuntime *runtimecache.QueryRuntime,
) (*Service, error) {
	resultStore, err := NewSharedStore(queryRuntime)
	if err != nil {
		return nil, fmt.Errorf("costar: create result cache: %w", err)
	}
	return &Service{
		stores:      stores,
		collections: collections,
		collection:  queryRuntime.CollectionCache(),
		results:     resultStore,
		runtime:     queryRuntime,
	}, nil
}

// QueryRuntime returns the resource owner used by this service.
func (service *Service) QueryRuntime() *runtimecache.QueryRuntime {
	if service == nil {
		return nil
	}
	return service.runtime
}

// CurrentDataVersion returns the published Archive identity without evaluation.
func (service *Service) CurrentDataVersion() string {
	if service == nil || service.stores == nil {
		return ""
	}
	store, ready := service.stores()
	if !ready || store == nil {
		return ""
	}
	return store.Identity().DataVersion
}

// Execute evaluates one co-star operation against one immutable Archive.
func (service *Service) Execute(
	ctx context.Context,
	request Request,
) (Projection, error) {
	if service == nil || ctx == nil {
		return Projection{}, notReady()
	}
	if cause := context.Cause(ctx); cause != nil {
		return Projection{}, cause
	}
	if service.stores == nil {
		return Projection{}, notReady()
	}
	store, ready := service.stores()
	if !ready || store == nil {
		return Projection{}, notReady()
	}
	identity := store.Identity()
	if identity.DataVersion == "" {
		return Projection{}, notReady()
	}

	authority, err := loadCatalogAuthority(ctx, store)
	if err != nil {
		return Projection{}, internalOrContext(ctx, err)
	}
	normalized, err := query.Normalize(request.Query, authority.Context)
	if err != nil {
		return Projection{}, mapQueryError(err)
	}
	operation, err := normalizeOperationRequest(normalized.Effective, request)
	if err != nil {
		return Projection{}, err
	}
	for index, positionKey := range normalized.Effective.PositionKeys {
		if authority.CoStarByPosition[positionKey] {
			continue
		}
		return Projection{}, fail(
			CodeCapabilityNotAvailable,
			"position capability is not available",
			fmt.Sprintf("/query/positionKeys/%d", index),
			string(CodeCapabilityNotAvailable),
			false,
			nil,
		)
	}
	people, err := loadParticipantPeople(ctx, store, operation.Input)
	if err != nil {
		return Projection{}, withDataVersion(
			internalOrContext(ctx, err),
			identity.DataVersion,
		)
	}
	for index, participant := range operation.Input.Participants {
		if participantPersonFound(people, participant.PersonID) {
			continue
		}
		return Projection{}, withDataVersion(
			fail(
				CodeEntityNotFound,
				"Participant person was not found.",
				fmt.Sprintf("/input/participants/%d/personId", index),
				"",
				false,
				nil,
			),
			identity.DataVersion,
		)
	}

	var access *runtimecache.CollectionAccess
	var entries []query.CollectionEntry
	collectionDigest := ""
	switch normalized.Effective.Scope {
	case "global":
	case "personal":
		if service.collections == nil {
			return Projection{}, notReady()
		}
		collectionKey, keyErr := runtimecache.NewCollectionKey(
			normalized.Effective.UID,
			normalized.Effective.SubjectType,
			normalized.Effective.CollectionStatuses,
		)
		if keyErr != nil {
			return Projection{}, withDataVersion(
				internalFailure(keyErr),
				identity.DataVersion,
			)
		}
		loaded, loadErr := service.collection.Get(
			ctx,
			collectionKey,
			false,
			func(loadContext context.Context) (runtimecache.CollectionSnapshot, error) {
				return service.collections.Fetch(
					loadContext,
					normalized.Effective.UID,
					normalized.Effective.SubjectType,
					collectionKey.Statuses(),
				)
			},
		)
		if loadErr != nil {
			return Projection{}, withDataVersion(
				mapCollectionError(ctx, loadErr),
				identity.DataVersion,
			)
		}
		access = &loaded
		entries = collectionEntries(loaded.Snapshot)
		collectionDigest = loaded.Digest
	default:
		return Projection{}, withDataVersion(
			internalFailure(nil),
			identity.DataVersion,
		)
	}

	resultKey, err := ResultKey(
		normalized.Effective.Scope,
		identity.DataVersion,
		normalized.Digest,
		operation.Input,
		collectionDigest,
	)
	if err != nil {
		return Projection{}, withDataVersion(
			internalFailure(err),
			identity.DataVersion,
		)
	}
	core, err := service.results.GetOrBuild(
		ctx,
		resultKey,
		func(buildContext context.Context) (Core, error) {
			return computeCore(
				buildContext,
				store,
				identity.DataVersion,
				normalized,
				entries,
				operation.Input,
				people,
			)
		},
	)
	if err != nil {
		return Projection{}, withDataVersion(
			mapComputeError(ctx, err),
			identity.DataVersion,
		)
	}
	projected, err := Project(ctx, core, operation.View)
	if err != nil {
		return Projection{}, withDataVersion(
			mapComputeError(ctx, err),
			identity.DataVersion,
		)
	}
	if access != nil {
		projected.Collection = projectCollectionFreshness(*access)
	}
	return projected, nil
}

func computeCore(
	ctx context.Context,
	store *archive.Store,
	dataVersion string,
	normalized query.NormalizedQuery,
	entries []query.CollectionEntry,
	input Input,
	people []PersonReference,
) (Core, error) {
	if store == nil {
		return Core{}, errors.New("costar: invalid Archive store")
	}
	facts, err := query.LoadFactSet(ctx, store, normalized.Effective.SubjectType)
	if err != nil {
		return Core{}, err
	}
	var collectionSource query.CollectionSource
	if normalized.Effective.Scope == "personal" {
		snapshotEntries := cloneCollectionEntries(entries)
		collectionSource = query.CollectionSourceFunc(func(
			sourceContext context.Context,
			uid string,
		) (query.CollectionSnapshot, error) {
			if cause := context.Cause(sourceContext); cause != nil {
				return query.CollectionSnapshot{}, cause
			}
			return query.CollectionSnapshot{
				UID:     uid,
				Entries: cloneCollectionEntries(snapshotEntries),
			}, nil
		})
	}
	queryResult, err := query.Evaluate(
		ctx,
		normalized,
		facts,
		collectionSource,
		nil,
	)
	if err != nil {
		return Core{}, err
	}
	var series *statistics.SeriesIndex
	if normalized.Effective.Scope == "personal" ||
		normalized.Effective.MergeSeries {
		series, err = statistics.LoadSeriesIndex(ctx, store)
		if err != nil {
			return Core{}, err
		}
	}
	personIDs, subjectIDs, characterIDs, err := RequiredArchiveReferenceIDs(
		*queryResult,
		input,
		series,
	)
	if err != nil {
		return Core{}, err
	}
	if !sameParticipantPeople(personIDs, people) {
		return Core{}, errors.New("costar: participant people changed during evaluation")
	}
	evidence, err := loadArchiveEvidence(
		ctx,
		store,
		normalized.Effective.SubjectType,
		people,
		subjectIDs,
		characterIDs,
	)
	if err != nil {
		return Core{}, err
	}
	return Build(ctx, BuildRequest{
		DataVersion:     dataVersion,
		Query:           *queryResult,
		Facts:           facts,
		PersonalEntries: cloneCollectionEntries(entries),
		Series:          series,
		Input:           input,
		Evidence:        evidence,
	})
}

func loadParticipantPeople(
	ctx context.Context,
	store *archive.Store,
	input Input,
) ([]PersonReference, error) {
	personIDs := make([]int64, len(input.Participants))
	for index, participant := range input.Participants {
		personIDs[index] = participant.PersonID
	}
	return loadPeople(ctx, store, personIDs)
}

func participantPersonFound(people []PersonReference, personID int64) bool {
	for _, person := range people {
		if person.ID == personID {
			return true
		}
	}
	return false
}

func sameParticipantPeople(
	personIDs []int64,
	people []PersonReference,
) bool {
	if len(personIDs) != len(people) {
		return false
	}
	for _, personID := range personIDs {
		if !participantPersonFound(people, personID) {
			return false
		}
	}
	return true
}

func projectCollectionFreshness(
	access runtimecache.CollectionAccess,
) *CollectionFreshness {
	warningCodes := []string{}
	if access.Stale {
		warningCodes = []string{runtimecache.CollectionStaleWarning}
	}
	return &CollectionFreshness{
		FetchedAt:    access.FetchedAt.UTC(),
		Stale:        access.Stale,
		WarningCodes: warningCodes,
	}
}

func collectionEntries(snapshot runtimecache.CollectionSnapshot) []query.CollectionEntry {
	result := make([]query.CollectionEntry, len(snapshot.Items))
	for index, item := range snapshot.Items {
		var score *float64
		if item.Rate != 0 {
			value := float64(item.Rate)
			score = &value
		}
		result[index] = query.CollectionEntry{
			SubjectID:     item.SubjectID,
			Status:        item.Status,
			PersonalScore: score,
			UpdatedAt:     item.UpdatedAt.UTC().Format(time.RFC3339Nano),
			Tags:          cloneSlice(item.Tags),
		}
	}
	return result
}

func notReady() error {
	return fail(CodeNotReady, "co-star is not ready", "", "", true, nil)
}

func mapQueryError(err error) error {
	var contract *query.ContractError
	if !errors.As(err, &contract) {
		return internalFailure(err)
	}
	path := "/query"
	if contract.Path != "" {
		path += contract.Path
	}
	code := Code(contract.Code)
	fieldCode := "INVALID_FORMAT"
	message := "query is invalid"
	switch contract.Code {
	case query.CodePositionSelectionConflict:
		fieldCode = string(CodePositionSelectionConflict)
	case query.CodePositionNotFound:
		fieldCode = string(CodePositionNotFound)
	case query.CodePositionNotSelectable:
		fieldCode = string(CodePositionNotSelectable)
	case query.CodePositionSubjectMismatch:
		fieldCode = string(CodePositionSubjectMismatch)
	case query.CodeInvalidJSON:
		code = CodeInvalidJSON
		path = ""
		fieldCode = ""
		message = "query JSON is invalid"
	case query.CodeRequestTooLarge:
		code = CodeInvalidRequest
		fieldCode = "LIMIT_EXCEEDED"
	}
	return fail(code, message, path, fieldCode, false, err)
}

func mapCollectionError(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	var failure *runtimecache.CollectionFailure
	if errors.As(err, &failure) {
		switch failure.Kind() {
		case runtimecache.FailureForbidden:
			return fail(
				CodeCollectionNotPublic,
				"collection is not public",
				"",
				"",
				false,
				err,
			)
		case runtimecache.FailureNotFound:
			return fail(CodeUserNotFound, "user not found", "", "", false, err)
		case runtimecache.FailureRateLimited:
			return fail(
				CodeRateLimited,
				"collection is rate limited",
				"",
				"",
				true,
				err,
			)
		case runtimecache.FailureDecode:
			return fail(
				CodeUpstreamProtocol,
				"collection response is invalid",
				"",
				"",
				true,
				err,
			)
		case runtimecache.FailureTimeout:
			return fail(
				CodeUpstreamTimeout,
				"co-star request timed out",
				"",
				"",
				true,
				err,
			)
		default:
			return fail(
				CodeUpstreamUnavailable,
				"collection is unavailable",
				"",
				"",
				true,
				err,
			)
		}
	}
	return mapComputeError(ctx, err)
}

func mapComputeError(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	if code, ok := runtimecache.ErrorCode(err); ok {
		switch code {
		case runtimecache.CodeCanceled:
			return context.Canceled
		case runtimecache.CodeTimeout:
			return fail(
				CodeUpstreamTimeout,
				"co-star request timed out",
				"",
				"",
				true,
				err,
			)
		case runtimecache.CodeServerBusy:
			failure := fail(
				CodeServerBusy,
				"co-star is busy",
				"",
				"",
				true,
				err,
			)
			failure.retryAfter = time.Second
			var cacheFailure *runtimecache.Error
			if errors.As(err, &cacheFailure) {
				failure.retryAfter = cacheFailure.RetryAfter()
			}
			return failure
		}
	}
	if code, ok := ErrorCode(err); ok && code == CodeCanceled {
		return context.Canceled
	}
	if failure, ok := ErrorDetails(err); ok {
		if failure.Code() == CodeEntityNotFound ||
			(failure.Code() == CodeFieldInvalid &&
				failure.FieldCode() == string(CodePositionNotFound) &&
				strings.HasPrefix(
					failure.Path(),
					"/input/participants/",
				)) {
			return err
		}
	}
	return internalFailure(err)
}

func internalFailure(err error) error {
	return fail(CodeInternal, "co-star is unavailable", "", "", true, err)
}

func internalOrContext(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return internalFailure(err)
}

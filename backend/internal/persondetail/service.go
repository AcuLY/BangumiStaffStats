package persondetail

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"time"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/query"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/runtimecache"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/statistics"
)

// Config contains only bounded cache/admission policy.
type Config struct {
	Executor   runtimecache.ExecutorConfig
	Collection runtimecache.CollectionConfig
	Result     runtimecache.ResultConfig
}

func DefaultConfig() Config {
	return Config{
		Executor:   runtimecache.DefaultExecutorConfig(),
		Collection: runtimecache.DefaultCollectionConfig(),
		Result:     runtimecache.DefaultResultConfig(),
	}
}

// Service owns complete immutable person cores and admitted collection/cache
// boundaries. It contains no transport or global mutable state.
type Service struct {
	stores      StoreProvider
	collections CollectionProvider
	collection  *runtimecache.CollectionCache
	results     *Store
	runtime     *runtimecache.QueryRuntime
}

// NewService constructs an isolated person-detail service for focused tests
// and non-process use. Production app assembly uses NewServiceWithRuntime.
func NewService(
	stores StoreProvider,
	collections CollectionProvider,
	config Config,
) (*Service, error) {
	binding, err := ResultBinding()
	if err != nil {
		return nil, fmt.Errorf("persondetail: create result binding: %w", err)
	}
	queryRuntime, err := runtimecache.NewQueryRuntime(runtimecache.QueryRuntimeConfig{
		Executor:   config.Executor,
		Collection: config.Collection,
		Result:     config.Result,
	}, binding)
	if err != nil {
		return nil, fmt.Errorf("persondetail: create query runtime: %w", err)
	}
	return NewServiceWithRuntime(stores, collections, queryRuntime)
}

// NewServiceWithRuntime constructs a person-detail service on shared process
// resources.
func NewServiceWithRuntime(
	stores StoreProvider,
	collections CollectionProvider,
	queryRuntime *runtimecache.QueryRuntime,
) (*Service, error) {
	resultStore, err := NewSharedStore(queryRuntime)
	if err != nil {
		return nil, fmt.Errorf("persondetail: create result cache: %w", err)
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

// Execute normalizes one request, shares only the complete semantic core, and
// derives one independently cancellable page.
func (service *Service) Execute(ctx context.Context, request Request) (Projection, error) {
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
	if !ready || store == nil || store.Identity().DataVersion == "" {
		return Projection{}, notReady()
	}
	dataVersion := store.Identity().DataVersion

	authority, err := LoadAuthority(ctx, store)
	if err != nil {
		return Projection{}, withDataVersion(err, dataVersion)
	}
	normalized, err := query.Normalize(request.Query, authority.Context)
	if err != nil {
		return Projection{}, mapQueryError(err)
	}
	for index, key := range normalized.Effective.PositionKeys {
		if !authority.PersonDetailByPosition[key] {
			return Projection{}, capabilityError(
				fmt.Sprintf("/query/positionKeys/%d", index),
			)
		}
	}
	input, err := decodeInput(request.Input)
	if err != nil {
		return Projection{}, err
	}
	viewInput, err := decodeView(request.View)
	if err != nil {
		return Projection{}, err
	}
	workUnit := statistics.UnitSubject
	if normalized.Effective.MergeSeries {
		workUnit = statistics.UnitSeries
	}
	castApplicable := selectedCastApplicable(
		normalized.Effective.PositionKeys,
		authority.CastByPosition,
	)
	view, err := NormalizeView(
		normalized.Effective.Scope,
		workUnit,
		castApplicable,
		viewInput,
	)
	if err != nil {
		return Projection{}, err
	}

	var access *runtimecache.CollectionAccess
	var entries []query.CollectionEntry
	var resultKey runtimecache.ResultKey
	switch normalized.Effective.Scope {
	case "global":
		resultKey, err = ResultKey(
			"global",
			dataVersion,
			normalized.Digest,
			input.PersonID,
			"",
		)
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
				fail(
					CodeInternal,
					"person detail is unavailable",
					"",
					"",
					true,
					keyErr,
				),
				dataVersion,
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
				dataVersion,
			)
		}
		access = &loaded
		entries = collectionEntries(loaded.Snapshot)
		resultKey, err = ResultKey(
			"personal",
			dataVersion,
			normalized.Digest,
			input.PersonID,
			loaded.Digest,
		)
	default:
		return Projection{}, fieldError("/query/scope")
	}
	if err != nil {
		return Projection{}, withDataVersion(
			fail(CodeInternal, "person detail is unavailable", "", "", true, err),
			dataVersion,
		)
	}

	computed, err := service.results.GetOrBuild(
		ctx,
		resultKey,
		func(computeContext context.Context) (Core, error) {
			return computeCore(
				computeContext,
				store,
				dataVersion,
				normalized,
				input.PersonID,
				entries,
			)
		},
	)
	if err != nil {
		return Projection{}, withDataVersion(
			mapComputeError(ctx, err),
			dataVersion,
		)
	}
	projected, err := Project(ctx, computed, view)
	if err != nil {
		return Projection{}, withDataVersion(mapComputeError(ctx, err), dataVersion)
	}
	if access != nil {
		projected.Collection = &CollectionFreshness{
			FetchedAt:    access.FetchedAt,
			Stale:        access.Stale,
			WarningCodes: append([]string(nil), access.WarningCodes...),
		}
	}
	return projected, nil
}

func computeCore(
	ctx context.Context,
	store *archive.Store,
	dataVersion string,
	normalized query.NormalizedQuery,
	personID int64,
	entries []query.CollectionEntry,
) (Core, error) {
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
	queryResult, err := query.Evaluate(ctx, normalized, facts, collectionSource, nil)
	if err != nil {
		return Core{}, err
	}
	var series *statistics.SeriesIndex
	if normalized.Effective.Scope == "personal" || normalized.Effective.MergeSeries {
		series, err = statistics.LoadSeriesIndex(ctx, store)
		if err != nil {
			return Core{}, err
		}
	}
	evaluation, err := statistics.Evaluate(ctx, statistics.EvaluationRequest{
		DataVersion:     dataVersion,
		Result:          *queryResult,
		Facts:           facts,
		PersonalEntries: cloneCollectionEntries(entries),
		Series:          series,
	})
	if err != nil {
		return Core{}, err
	}
	subjectIDs := make([]int64, 0)
	if personEvaluation, found := evaluatedPerson(evaluation.People, personID); found {
		for _, unit := range personEvaluation.Units {
			subjectIDs = append(subjectIDs, unit.CompleteMemberIDs...)
		}
	}
	evidence, err := LoadArchiveEvidence(
		ctx,
		store,
		normalized.Effective.SubjectType,
		personID,
		subjectIDs,
	)
	if err != nil {
		return Core{}, err
	}
	return Build(ctx, BuildRequest{
		DataVersion:     dataVersion,
		PersonID:        personID,
		Query:           *queryResult,
		Facts:           facts,
		Evaluation:      *evaluation,
		PersonalEntries: cloneCollectionEntries(entries),
		Series:          series,
		Evidence:        evidence,
	})
}

func decodeInput(raw json.RawMessage) (Input, error) {
	if len(raw) == 0 {
		return Input{}, inputFailure("/input", "REQUIRED")
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return Input{}, inputFailure("/input", "INVALID_TYPE")
	}
	fields, err := decodeRawObject(raw)
	if err != nil {
		return Input{}, inputFailure("/input", "INVALID_TYPE")
	}
	for name := range fields {
		if name != "personId" {
			return Input{}, invalidRequest()
		}
	}
	value, exists := fields["personId"]
	if !exists {
		return Input{}, inputFailure("/input/personId", "REQUIRED")
	}
	personID, kind := exactPositiveInteger(value)
	switch kind {
	case integerValid:
	case integerInvalidType, integerNonIntegral:
		return Input{}, inputFailure("/input/personId", "INVALID_TYPE")
	default:
		return Input{}, inputFailure("/input/personId", "OUT_OF_RANGE")
	}
	return Input{PersonID: personID}, nil
}

func decodeView(raw json.RawMessage) (*ViewInput, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, viewFailure("/view", "INVALID_TYPE")
	}
	fields, err := decodeRawObject(raw)
	if err != nil {
		return nil, viewFailure("/view", "INVALID_TYPE")
	}
	for name := range fields {
		switch name {
		case "section", "search", "sort", "order", "page", "pageSize":
		default:
			return nil, invalidRequest()
		}
	}
	result := &ViewInput{}
	if rawValue, found := fields["section"]; found {
		var value Section
		if err := json.Unmarshal(rawValue, &value); err != nil {
			return nil, viewFailure("/view/section", "INVALID_TYPE")
		}
		result.Section = &value
	}
	if rawValue, found := fields["search"]; found {
		var value *string
		if err := json.Unmarshal(rawValue, &value); err != nil || value == nil {
			return nil, viewFailure("/view/search", "INVALID_TYPE")
		}
		result.Search = value
	}
	if rawValue, found := fields["sort"]; found {
		var value Sort
		if err := json.Unmarshal(rawValue, &value); err != nil {
			return nil, viewFailure("/view/sort", "INVALID_TYPE")
		}
		result.Sort = &value
	}
	if rawValue, found := fields["order"]; found {
		var value Order
		if err := json.Unmarshal(rawValue, &value); err != nil {
			return nil, viewFailure("/view/order", "INVALID_TYPE")
		}
		result.Order = &value
	}
	if rawValue, found := fields["page"]; found {
		value, kind := exactPositiveInteger(rawValue)
		if kind != integerValid {
			return nil, viewFailure("/view/page", "OUT_OF_RANGE")
		}
		result.Page = &value
	}
	if rawValue, found := fields["pageSize"]; found {
		value, kind := exactPositiveInteger(rawValue)
		if kind != integerValid {
			return nil, viewFailure("/view/pageSize", "INVALID_TYPE")
		}
		converted := int(value)
		result.PageSize = &converted
	}
	return result, nil
}

func selectedCastApplicable(
	positionKeys []string,
	castByPosition map[string]bool,
) bool {
	for _, key := range positionKeys {
		if castByPosition[key] {
			return true
		}
	}
	return false
}

type integerKind uint8

const (
	integerValid integerKind = iota
	integerInvalidType
	integerNonIntegral
	integerOutOfRange
)

func exactPositiveInteger(raw json.RawMessage) (int64, integerKind) {
	decoder := json.NewDecoder(bytes.NewReader(raw))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return 0, integerInvalidType
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return 0, integerInvalidType
	}
	number, ok := value.(json.Number)
	if !ok {
		return 0, integerInvalidType
	}
	rational, ok := new(big.Rat).SetString(number.String())
	if !ok {
		return 0, integerInvalidType
	}
	if !rational.IsInt() {
		return 0, integerNonIntegral
	}
	if rational.Sign() <= 0 || !rational.Num().IsInt64() {
		return 0, integerOutOfRange
	}
	integer := rational.Num().Int64()
	if integer > maxJSONSafeInteger {
		return 0, integerOutOfRange
	}
	return integer, integerValid
}

func decodeRawObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil || value == nil {
		return nil, err
	}
	return value, nil
}

func invalidRequest() error {
	return fail(
		CodeInvalidRequest,
		"person detail request is invalid",
		"",
		"",
		false,
		nil,
	)
}

func inputFailure(path, fieldCode string) error {
	return fail(
		CodeFieldInvalid,
		"person detail input is invalid",
		path,
		fieldCode,
		false,
		nil,
	)
}

func viewFailure(path, fieldCode string) error {
	return fail(
		CodeFieldInvalid,
		"person detail view is invalid",
		path,
		fieldCode,
		false,
		nil,
	)
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
			Tags:          append([]string(nil), item.Tags...),
		}
	}
	return result
}

func cloneCollectionEntries(values []query.CollectionEntry) []query.CollectionEntry {
	result := append([]query.CollectionEntry(nil), values...)
	for index := range result {
		result[index].PersonalScore = cloneFloat64(result[index].PersonalScore)
		result[index].Tags = append([]string(nil), result[index].Tags...)
	}
	return result
}

func mapQueryError(err error) error {
	var contract *query.ContractError
	if !errors.As(err, &contract) {
		return fail(CodeInternal, "person detail is unavailable", "", "", true, err)
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
			return fail(CodeRateLimited, "collection is rate limited", "", "", true, err)
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
				"person detail request timed out",
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
	var detailFailure *Failure
	if errors.As(err, &detailFailure) {
		return err
	}
	if code, ok := runtimecache.ErrorCode(err); ok {
		switch code {
		case runtimecache.CodeCanceled:
			return context.Canceled
		case runtimecache.CodeTimeout:
			return fail(
				CodeUpstreamTimeout,
				"person detail request timed out",
				"",
				"",
				true,
				err,
			)
		case runtimecache.CodeServerBusy:
			failure := &Failure{
				code:       CodeServerBusy,
				message:    "person detail is busy",
				retryable:  true,
				retryAfter: time.Second,
				cause:      err,
			}
			var cacheFailure *runtimecache.Error
			if errors.As(err, &cacheFailure) {
				failure.retryAfter = cacheFailure.RetryAfter()
			}
			return failure
		}
	}
	if code, ok := statistics.ErrorCode(err); ok {
		if code == statistics.CodeCanceled {
			return context.Canceled
		}
	}
	return fail(CodeInternal, "person detail is unavailable", "", "", true, err)
}

package ranking

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
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

// DefaultConfig returns the approved in-process production policy.
func DefaultConfig() Config {
	return Config{
		Executor:   runtimecache.DefaultExecutorConfig(),
		Collection: runtimecache.DefaultCollectionConfig(),
		Result:     runtimecache.DefaultResultConfig(),
	}
}

// Service owns immutable rankings cores and their admitted collection/cache
// boundaries.
type Service struct {
	stores      StoreProvider
	collections CollectionProvider
	collection  *runtimecache.CollectionCache
	results     *runtimecache.ResultStore[core]
}

// CurrentDataVersion returns the currently published Archive identity without
// performing a query. It is used only to enrich a timeout envelope.
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

// NewService constructs an empty production service.
func NewService(
	stores StoreProvider,
	collections CollectionProvider,
	config Config,
) (*Service, error) {
	executor, err := runtimecache.NewExecutor(config.Executor)
	if err != nil {
		return nil, fmt.Errorf("ranking: create executor: %w", err)
	}
	collectionCache, err := runtimecache.NewCollectionCache(config.Collection)
	if err != nil {
		return nil, fmt.Errorf("ranking: create collection cache: %w", err)
	}
	resultStore, err := runtimecache.NewResultStore(
		config.Result,
		executor,
		cloneCore,
		coreCost,
	)
	if err != nil {
		return nil, fmt.Errorf("ranking: create result cache: %w", err)
	}
	return &Service{
		stores:      stores,
		collections: collections,
		collection:  collectionCache,
		results:     resultStore,
	}, nil
}

// Execute evaluates one semantic query and projects one independent view.
func (service *Service) Execute(ctx context.Context, request Request) (Projection, error) {
	if service == nil || ctx == nil {
		return Projection{}, fail(
			CodeNotReady,
			"rankings is not ready",
			"",
			"",
			true,
			nil,
		)
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

	catalogAuthority, err := loadCatalogContext(ctx, store)
	if err != nil {
		return Projection{}, internalOrContext(ctx, err)
	}
	normalized, err := query.Normalize(request.Query, catalogAuthority.Context)
	if err != nil {
		return Projection{}, mapQueryError(err)
	}
	for index, positionKey := range normalized.Effective.PositionKeys {
		if !catalogAuthority.RankingsByPosition[positionKey] {
			return Projection{}, fail(
				CodeCapabilityNotAvailable,
				"position capability is not available",
				fmt.Sprintf("/query/positionKeys/%d", index),
				string(CodeCapabilityNotAvailable),
				false,
				nil,
			)
		}
	}
	view, err := normalizeView(request.View, normalized.Effective.Scope)
	if err != nil {
		return Projection{}, err
	}
	if request.RefreshCollection && normalized.Effective.Scope != "personal" {
		return Projection{}, fail(
			CodeFieldInvalid,
			"refreshCollection requires personal scope",
			"/refreshCollection",
			"VALUE_CONFLICT",
			false,
			nil,
		)
	}

	var access *runtimecache.CollectionAccess
	var entries []query.CollectionEntry
	var resultKey runtimecache.ResultKey
	switch normalized.Effective.Scope {
	case "global":
		resultKey, err = runtimecache.NewGlobalResultKey(
			runtimecache.OperationRankingsV1,
			identity.DataVersion,
			normalized.Digest,
			runtimecache.EmptyInputDigestV1,
		)
	case "personal":
		if service.collections == nil {
			return Projection{}, notReady()
		}
		key, keyErr := runtimecache.NewCollectionKey(
			normalized.Effective.UID,
			normalized.Effective.SubjectType,
			normalized.Effective.CollectionStatuses,
		)
		if keyErr != nil {
			return Projection{}, fail(
				CodeInternal,
				"rankings is unavailable",
				"",
				"",
				true,
				keyErr,
			)
		}
		loaded, loadErr := service.collection.Get(
			ctx,
			key,
			request.RefreshCollection,
			func(loadContext context.Context) (runtimecache.CollectionSnapshot, error) {
				return service.collections.Fetch(
					loadContext,
					normalized.Effective.UID,
					normalized.Effective.SubjectType,
					key.Statuses(),
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
		resultKey, err = runtimecache.NewPersonalResultKey(
			runtimecache.OperationRankingsV1,
			identity.DataVersion,
			normalized.Digest,
			runtimecache.EmptyInputDigestV1,
			loaded.Digest,
		)
	default:
		return Projection{}, fail(
			CodeInternal,
			"rankings is unavailable",
			"",
			"",
			true,
			nil,
		)
	}
	if err != nil {
		return Projection{}, fail(
			CodeInternal,
			"rankings is unavailable",
			"",
			"",
			true,
			err,
		)
	}

	computed, err := service.results.GetOrCompute(
		ctx,
		resultKey,
		func(computeContext context.Context) (core, error) {
			return computeCore(
				computeContext,
				store,
				identity.DataVersion,
				normalized,
				entries,
			)
		},
	)
	if err != nil {
		return Projection{}, withDataVersion(
			mapComputeError(ctx, err),
			identity.DataVersion,
		)
	}
	projected, err := project(ctx, computed, view, access)
	if err != nil {
		return Projection{}, internalOrContext(ctx, err)
	}
	return projected, nil
}

func computeCore(
	ctx context.Context,
	archiveStore *archive.Store,
	dataVersion string,
	normalized query.NormalizedQuery,
	entries []query.CollectionEntry,
) (core, error) {
	if archiveStore == nil {
		return core{}, errors.New("ranking: invalid Archive store")
	}
	facts, err := query.LoadFactSet(ctx, archiveStore, normalized.Effective.SubjectType)
	if err != nil {
		return core{}, err
	}

	var source query.CollectionSource
	if normalized.Effective.Scope == "personal" {
		snapshotEntries := cloneCollectionEntries(entries)
		source = query.CollectionSourceFunc(func(
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
	queryResult, err := query.Evaluate(ctx, normalized, facts, source, nil)
	if err != nil {
		return core{}, err
	}

	var series *statistics.SeriesIndex
	if normalized.Effective.Scope == "personal" || normalized.Effective.MergeSeries {
		series, err = statistics.LoadSeriesIndex(ctx, archiveStore)
		if err != nil {
			return core{}, err
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
		return core{}, err
	}
	people, err := loadPeople(ctx, archiveStore)
	if err != nil {
		return core{}, err
	}

	rows := make([]rowCore, 0, len(evaluation.People))
	for _, evaluated := range evaluation.People {
		if cause := context.Cause(ctx); cause != nil {
			return core{}, cause
		}
		person, found := people[evaluated.PersonID]
		if !found {
			return core{}, errors.New("ranking: eligible person missing from Archive")
		}
		rating := &evaluated.Global
		if normalized.Effective.Scope == "personal" {
			if evaluated.Personal == nil {
				return core{}, errors.New("ranking: personal evaluation missing rating summary")
			}
			rating = evaluated.Personal
		}
		row := rowCore{
			Person:         clonePerson(person),
			WorkCount:      len(evaluated.Units),
			RatedUnitCount: rating.RatedUnitCount,
			Average:        cloneInt64(rating.AverageHundredths),
			Overall:        cloneInt64(rating.OverallHundredths),
		}
		if normalized.Effective.Scope == "personal" {
			row.Preference = projectPreference(evaluated.Preference)
			if row.Preference != nil {
				row.EffectiveEvidence = row.Preference.EffectiveEvidence
			}
		}
		row.SearchName = normalizeSearch(person.Name)
		if person.NameCN != nil {
			row.SearchNameCN = normalizeSearch(*person.NameCN)
		}
		rows = append(rows, row)
	}

	workCount := evaluation.Summary.WorkCount
	if evaluation.UnitKind == statistics.UnitSeries {
		if evaluation.Summary.SeriesCount == nil {
			return core{}, errors.New("ranking: series summary missing count")
		}
		workCount = *evaluation.Summary.SeriesCount
	}
	return core{
		DataVersion: dataVersion,
		Scope:       normalized.Effective.Scope,
		Summary: Summary{
			PersonCount:    evaluation.Summary.PersonCount,
			WorkUnit:       evaluation.UnitKind,
			WorkCount:      workCount,
			CharacterCount: cloneInt(evaluation.Summary.CharacterCount),
		},
		Rows: rows,
	}, nil
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
		if result[index].PersonalScore != nil {
			value := *result[index].PersonalScore
			result[index].PersonalScore = &value
		}
		result[index].Tags = append([]string(nil), result[index].Tags...)
	}
	return result
}

func projectPreference(value *statistics.PreferenceSummary) *Preference {
	if value == nil || value.Mean == nil || value.Score == nil {
		return nil
	}
	return &Preference{
		ComparableCount:       value.ComparableCount,
		ComparableSeriesCount: value.ComparableSeriesCount,
		EffectiveEvidence:     value.EffectiveEvidence,
		Mean:                  *value.Mean,
		EvidenceWeight:        value.EvidenceWeight,
		Score:                 *value.Score,
	}
}

func coreCost(value core) int64 {
	cost := int64(256 + len(value.DataVersion) + len(value.Scope))
	for _, row := range value.Rows {
		cost += int64(192 + len(row.Person.Name) + len(row.SearchName) + len(row.SearchNameCN))
		if row.Person.NameCN != nil {
			cost += int64(len(*row.Person.NameCN))
		}
		if row.Preference != nil {
			cost += int64(
				len(row.Preference.Mean.Numerator) +
					len(row.Preference.Mean.Denominator) +
					len(row.Preference.EvidenceWeight.Numerator) +
					len(row.Preference.EvidenceWeight.Denominator) +
					len(row.Preference.Score.Numerator) +
					len(row.Preference.Score.Denominator) +
					96,
			)
		}
	}
	return cost
}

func notReady() error {
	return fail(CodeNotReady, "rankings is not ready", "", "", true, nil)
}

func mapQueryError(err error) error {
	var contract *query.ContractError
	if !errors.As(err, &contract) {
		return err
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
				"rankings request timed out",
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
				"rankings request timed out",
				"",
				"",
				true,
				err,
			)
		case runtimecache.CodeServerBusy:
			failure := &Failure{
				code:       CodeServerBusy,
				message:    "rankings is busy",
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
		if code == statistics.CodeSourceUnavailable {
			return fail(
				CodeInternal,
				"rankings is unavailable",
				"",
				"",
				true,
				err,
			)
		}
	}
	return fail(CodeInternal, "rankings is unavailable", "", "", true, err)
}

func internalOrContext(ctx context.Context, err error) error {
	if cause := context.Cause(ctx); cause != nil {
		return cause
	}
	return fail(CodeInternal, "rankings is unavailable", "", "", true, err)
}

func decodeRawObject(raw json.RawMessage) (map[string]json.RawMessage, error) {
	if len(raw) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	var value map[string]json.RawMessage
	if err := json.Unmarshal(raw, &value); err != nil || value == nil {
		return nil, err
	}
	return value, nil
}

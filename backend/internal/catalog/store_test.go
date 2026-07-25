package catalog

import (
	"context"
	"errors"
	"fmt"
	"reflect"
	"slices"
	"testing"

	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/httpapi/wire"
)

type scriptedCatalogStore struct {
	identity archive.Identity
	data     map[string][][]any
	opened   []*scriptedCatalogRows
}

func (s *scriptedCatalogStore) Identity() archive.Identity {
	return s.identity
}

func (s *scriptedCatalogStore) QueryContext(
	_ context.Context,
	query string,
	arguments ...any,
) (rows, error) {
	if len(arguments) != 0 {
		return nil, fmt.Errorf("unexpected catalog arguments: %v", arguments)
	}
	values, ok := s.data[query]
	if !ok {
		return nil, fmt.Errorf("unexpected catalog query")
	}
	result := &scriptedCatalogRows{values: values}
	s.opened = append(s.opened, result)
	return result, nil
}

type scriptedCatalogRows struct {
	values   [][]any
	index    int
	err      error
	closeErr error
	closed   bool
}

func (r *scriptedCatalogRows) Next() bool {
	if r.index >= len(r.values) {
		return false
	}
	r.index++
	return true
}

func (r *scriptedCatalogRows) Scan(destinations ...any) error {
	if r.index == 0 || r.index > len(r.values) {
		return errors.New("scan without current row")
	}
	values := r.values[r.index-1]
	if len(values) != len(destinations) {
		return fmt.Errorf("scan width = %d, want %d", len(destinations), len(values))
	}
	for index, value := range values {
		target := reflect.ValueOf(destinations[index])
		if target.Kind() != reflect.Pointer || target.IsNil() {
			return errors.New("scan destination is not a pointer")
		}
		source := reflect.ValueOf(value)
		if !source.IsValid() || !source.Type().AssignableTo(target.Elem().Type()) {
			return fmt.Errorf("scan value %d has type %T", index, value)
		}
		target.Elem().Set(source)
	}
	return nil
}

func (r *scriptedCatalogRows) Err() error {
	return r.err
}

func (r *scriptedCatalogRows) Close() error {
	r.closed = true
	return r.closeErr
}

func TestProjectReadsFixedQueriesClosesRowsAndMatchesGolden(t *testing.T) {
	fixture := loadCatalogGolden(t, true)
	positions, groups, rules := catalogRecordsFromWire(t, fixture.Expected.Body.Data)
	store := &scriptedCatalogStore{
		identity: archive.Identity{
			DataVersion: "dv1-2222222222222222222222222222222222222222222222222222222222222222",
		},
		data: catalogStoreRows(positions, groups, rules),
	}

	result, err := project(context.Background(), store)
	if err != nil {
		t.Fatalf("project: %v", err)
	}
	if result.DataVersion != store.identity.DataVersion {
		t.Fatalf("dataVersion = %q", result.DataVersion)
	}
	assertJSONEquivalent(t, result.Data, fixture.Expected.Body.Data)
	if len(store.opened) != 6 {
		t.Fatalf("opened row sets = %d, want 6", len(store.opened))
	}
	for index, resultRows := range store.opened {
		if !resultRows.closed {
			t.Fatalf("row set %d was not closed", index)
		}
	}
}

func TestQueryRowsClosesOnSuccessFailureAndCancellation(t *testing.T) {
	rowError := errors.New("row iteration failed")
	closeError := errors.New("row close failed")
	for _, test := range []struct {
		name    string
		rows    *scriptedCatalogRows
		visit   func(rows) error
		wantErr error
	}{
		{
			name:  "success",
			rows:  &scriptedCatalogRows{values: [][]any{{"value"}}},
			visit: func(rows) error { return nil },
		},
		{
			name:    "visitor failure",
			rows:    &scriptedCatalogRows{values: [][]any{{"value"}}},
			visit:   func(rows) error { return errors.New("visitor failed") },
			wantErr: errors.New("visitor failed"),
		},
		{
			name:    "rows failure",
			rows:    &scriptedCatalogRows{err: rowError},
			visit:   func(rows) error { return nil },
			wantErr: rowError,
		},
		{
			name:    "close failure",
			rows:    &scriptedCatalogRows{closeErr: closeError},
			visit:   func(rows) error { return nil },
			wantErr: closeError,
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			original := test.rows
			reader := fixedRowsStore{result: original}
			err := queryRows(context.Background(), reader, "query", test.visit)
			if test.wantErr == nil && err != nil {
				t.Fatalf("queryRows: %v", err)
			}
			if test.wantErr != nil &&
				!errors.Is(err, test.wantErr) &&
				(err == nil || err.Error() != test.wantErr.Error()) {
				t.Fatalf("queryRows error = %v, want %v", err, test.wantErr)
			}
			if !original.closed {
				t.Fatal("rows were not closed")
			}
		})
	}

	ctx, cancel := context.WithCancel(context.Background())
	resultRows := &scriptedCatalogRows{values: [][]any{{"first"}, {"second"}}}
	visited := 0
	err := queryRows(ctx, fixedRowsStore{result: resultRows}, "query", func(rows) error {
		visited++
		cancel()
		return nil
	})
	if !errors.Is(err, context.Canceled) || visited != 1 || !resultRows.closed {
		t.Fatalf("cancellation = err %v, visited %d, closed %v", err, visited, resultRows.closed)
	}
}

type fixedRowsStore struct {
	result rows
}

func (s fixedRowsStore) Identity() archive.Identity {
	return archive.Identity{}
}

func (s fixedRowsStore) QueryContext(context.Context, string, ...any) (rows, error) {
	return s.result, nil
}

func catalogStoreRows(
	positions []*positionRecord,
	groups []*groupRecord,
	rules []ruleRecord,
) map[string][][]any {
	data := map[string][][]any{
		positionQuery:    {},
		memberQuery:      {},
		groupQuery:       {},
		groupMemberQuery: {},
		capabilityQuery:  {},
		ruleQuery:        {},
	}
	for _, position := range positions {
		data[positionQuery] = append(data[positionQuery], []any{
			position.key, position.subjectType, position.kind, position.label,
			position.nameCN, position.nameEN, position.nameJP,
			position.displayOrder, position.selectable, position.positionID,
			position.categoriesJSON, position.staffStatus,
		})
		for _, member := range position.members {
			data[memberQuery] = append(data[memberQuery], []any{position.key, member})
		}
		for _, capability := range position.capabilities {
			data[capabilityQuery] = append(data[capabilityQuery], []any{
				position.key, string(capability), int64(1),
			})
		}
	}
	slices.SortFunc(data[memberQuery], compareStringRows)
	slices.SortFunc(data[capabilityQuery], func(left, right []any) int {
		if comparison := stringsCompare(left[0].(string), right[0].(string)); comparison != 0 {
			return comparison
		}
		order := orderedCapabilities()
		leftCapability := wire.CatalogPositionCapabilityNameV1(left[1].(string))
		rightCapability := wire.CatalogPositionCapabilityNameV1(right[1].(string))
		return slices.Index(order, leftCapability) - slices.Index(order, rightCapability)
	})
	for _, group := range groups {
		data[groupQuery] = append(data[groupQuery], []any{
			group.key, group.subjectType, group.label, group.displayOrder,
		})
		for order, member := range group.members {
			data[groupMemberQuery] = append(data[groupMemberQuery], []any{
				group.key, member, int64(order),
			})
		}
	}
	for _, rule := range rules {
		data[ruleQuery] = append(data[ruleQuery], []any{
			rule.key, rule.positionKey, rule.kind, rule.value,
		})
	}
	return data
}

func compareStringRows(left, right []any) int {
	if comparison := stringsCompare(left[0].(string), right[0].(string)); comparison != 0 {
		return comparison
	}
	return stringsCompare(left[1].(string), right[1].(string))
}

func stringsCompare(left, right string) int {
	switch {
	case left < right:
		return -1
	case left > right:
		return 1
	default:
		return 0
	}
}

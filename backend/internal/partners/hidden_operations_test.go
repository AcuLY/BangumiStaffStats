package partners

import (
	"context"
	"database/sql"
	"encoding/json"
	"github.com/AcuLY/BangumiStaffStats/backend/internal/archive"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestHiddenUnrestrictedPartnerDiscovery(t *testing.T) {
	service := newPartnerService(t, hiddenOperationArchive(t), nil)
	r := Request{Query: json.RawMessage(`{"scope":"global","subjectType":"anime","positionScope":"all","positionKeys":[]}`), Input: json.RawMessage(`{"source":{"personId":100,"positionKeys":["staff:anime:2"]}}`)}
	got, err := service.Execute(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, row := range got.page.Items {
		if row.Person.ID == 200 {
			found = true
			if row.Metrics.WorkCount != 1 || !reflect.DeepEqual(row.PositionKeys, []string{"staff:anime:999"}) {
				t.Fatalf("hidden partner=%+v", row)
			}
		}
	}
	if !found {
		t.Fatalf("hidden-only staff missing from partners: %+v", got.page.Items)
	}
	r.Input = json.RawMessage(`{"source":{"personId":100,"positionKeys":["staff:anime:2"]},"candidatePositionKey":"cast:anime:all"}`)
	narrowed, err := service.Execute(context.Background(), r)
	if err != nil {
		t.Fatal(err)
	}
	for _, row := range narrowed.page.Items {
		if row.Person.ID == 200 {
			t.Fatal("explicit cast selection expanded")
		}
	}
}

func hiddenOperationArchive(t *testing.T) *archive.Store {
	t.Helper()
	bundle := filepath.Join("..", "..", "..", "contracts", "goldens", "archive", "valid", "minimal")
	data, err := os.ReadFile(filepath.Join(bundle, "current-pointer.json"))
	if err != nil {
		t.Fatal(err)
	}
	var pointer struct {
		DataVersion string `json:"dataVersion"`
	}
	if err := json.Unmarshal(data, &pointer); err != nil {
		t.Fatal(err)
	}
	root := t.TempDir()
	dir := filepath.Join(root, "versions", pointer.DataVersion)
	if err := os.MkdirAll(dir, 0755); err != nil {
		t.Fatal(err)
	}
	data, err = os.ReadFile(filepath.Join(bundle, "bangumi.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "bangumi.sqlite")
	if err := os.WriteFile(path, data, 0644); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	_, err = db.Exec(`INSERT INTO person(person_id,name) VALUES(200,'Hidden staff');
 INSERT INTO staff_credit VALUES('anime',1,200,999),('anime',2,200,999),('book',1,200,998);`)
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := archive.OpenVersion(context.Background(), root, pointer.DataVersion)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := store.Close(); err != nil {
			t.Error(err)
		}
	})
	return store
}

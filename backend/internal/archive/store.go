package archive

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"strings"
	"sync"

	sqlitevfs "modernc.org/sqlite/vfs"
)

const maxReadQueryBytes = 65_536

// ErrUnsafeQuery is returned when a caller supplies text outside Store's
// deliberately narrow single read-statement boundary.
var ErrUnsafeQuery = errors.New("archive: unsafe query")

// Identity contains the byte identities proven while a candidate is loaded.
type Identity struct {
	DataVersion    string
	ManifestDigest string
	SQLiteDigest   string
}

// Store is one immutable Archive snapshot. It intentionally exposes only
// query operations; the underlying pool remains private.
type Store struct {
	db          *sql.DB
	sqliteVFS   *sqlitevfs.FS
	versionRoot *os.Root
	archiveRoot *os.Root
	identity    Identity

	queryMu    sync.Mutex
	queryCond  *sync.Cond
	closing    bool
	activeRows int
	closeOnce  sync.Once
	closeErr   error
}

// Identity returns the validated immutable snapshot identity.
func (s *Store) Identity() Identity {
	if s == nil {
		return Identity{}
	}
	return s.identity
}

// Rows owns one active Store query. Callers must close it or iterate until Next
// returns false so Store.Close can drain the query before releasing its VFS.
type Rows struct {
	rows  *sql.Rows
	store *Store

	closeOnce sync.Once
	closeErr  error
}

// QueryContext executes a read query against the immutable snapshot.
func (s *Store) QueryContext(ctx context.Context, query string, arguments ...any) (*Rows, error) {
	if s == nil || s.db == nil {
		return nil, sql.ErrConnDone
	}
	if !safeReadQuery(query) {
		return nil, ErrUnsafeQuery
	}

	s.queryMu.Lock()
	if s.closing {
		s.queryMu.Unlock()
		return nil, sql.ErrConnDone
	}
	s.activeRows++
	database := s.db
	s.queryMu.Unlock()

	rows, err := database.QueryContext(ctx, query, arguments...)
	if err != nil {
		s.releaseRows()
		return nil, err
	}
	return &Rows{rows: rows, store: s}, nil
}

// Next prepares the next result row and releases the Store query when exhausted.
func (r *Rows) Next() bool {
	if r == nil || r.rows == nil {
		return false
	}
	if r.rows.Next() {
		return true
	}
	r.finish()
	return false
}

// Scan copies the current row into destinations.
func (r *Rows) Scan(destinations ...any) error {
	if r == nil || r.rows == nil {
		return sql.ErrConnDone
	}
	return r.rows.Scan(destinations...)
}

// Err reports the iteration error, if any.
func (r *Rows) Err() error {
	if r == nil || r.rows == nil {
		return sql.ErrConnDone
	}
	if err := r.rows.Err(); err != nil {
		r.finish()
		return err
	}
	return r.closeErr
}

// Close releases the result and its Store query lifetime exactly once.
func (r *Rows) Close() error {
	if r == nil {
		return nil
	}
	r.finish()
	return r.closeErr
}

func (r *Rows) finish() {
	r.closeOnce.Do(func() {
		if r.rows != nil {
			r.closeErr = r.rows.Close()
		}
		if r.store != nil {
			r.store.releaseRows()
		}
	})
}

func (s *Store) releaseRows() {
	s.queryMu.Lock()
	s.activeRows--
	if s.activeRows == 0 && s.queryCond != nil {
		s.queryCond.Broadcast()
	}
	s.queryMu.Unlock()
}

func safeReadQuery(query string) bool {
	if len(query) == 0 || len(query) > maxReadQueryBytes ||
		strings.Contains(query, "--") ||
		strings.Contains(query, "/*") ||
		strings.Contains(query, "*/") ||
		strings.Contains(query, ";") {
		return false
	}

	index := 0
	for index < len(query) && isASCIISpace(query[index]) {
		index++
	}
	start := index
	for index < len(query) && isASCIIIdentifier(query[index]) {
		index++
	}
	if start == index {
		return false
	}
	keyword := query[start:index]
	return strings.EqualFold(keyword, "SELECT") || strings.EqualFold(keyword, "WITH")
}

func isASCIISpace(value byte) bool {
	switch value {
	case ' ', '\t', '\n', '\r', '\f', '\v':
		return true
	default:
		return false
	}
}

func isASCIIIdentifier(value byte) bool {
	return value >= 'a' && value <= 'z' ||
		value >= 'A' && value <= 'Z' ||
		value >= '0' && value <= '9' ||
		value == '_'
}

// Close releases the snapshot pool exactly once.
func (s *Store) Close() error {
	if s == nil {
		return nil
	}
	s.closeOnce.Do(func() {
		s.queryMu.Lock()
		s.closing = true
		if s.queryCond == nil {
			s.queryCond = sync.NewCond(&s.queryMu)
		}
		for s.activeRows != 0 {
			s.queryCond.Wait()
		}
		s.queryMu.Unlock()

		var closeErrors []error
		if s.db != nil {
			closeErrors = append(closeErrors, s.db.Close())
		}
		if s.sqliteVFS != nil {
			closeErrors = append(closeErrors, s.sqliteVFS.Close())
		}
		if s.versionRoot != nil {
			closeErrors = append(closeErrors, s.versionRoot.Close())
		}
		if s.archiveRoot != nil {
			closeErrors = append(closeErrors, s.archiveRoot.Close())
		}
		s.closeErr = errors.Join(closeErrors...)
	})
	return s.closeErr
}

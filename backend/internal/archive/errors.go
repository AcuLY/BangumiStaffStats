package archive

import "errors"

// Code is a stable Archive validation outcome.
type Code string

const (
	CodeValid                       Code = "VALID"
	CodeManifestSchemaInvalid       Code = "MANIFEST_SCHEMA_INVALID"
	CodePointerSchemaInvalid        Code = "POINTER_SCHEMA_INVALID"
	CodeManifestAccountingInvalid   Code = "MANIFEST_ACCOUNTING_INVALID"
	CodeArchiveVersionUnsupported   Code = "ARCHIVE_VERSION_UNSUPPORTED"
	CodeDataVersionMismatch         Code = "DATA_VERSION_MISMATCH"
	CodeSQLiteDataVersionMismatch   Code = "SQLITE_DATA_VERSION_MISMATCH"
	CodeSQLiteFormatInvalid         Code = "SQLITE_FORMAT_INVALID"
	CodeSQLiteDigestMismatch        Code = "SQLITE_DIGEST_MISMATCH"
	CodeSQLiteRequiredObjectMissing Code = "SQLITE_REQUIRED_OBJECT_MISSING"
	CodeSQLiteTableCountMismatch    Code = "SQLITE_TABLE_COUNT_MISMATCH"

	CodeArchiveRootInvalid            Code = "ARCHIVE_ROOT_INVALID"
	CodeArchiveFileInvalid            Code = "ARCHIVE_FILE_INVALID"
	CodeArchiveImmutableLayoutInvalid Code = "ARCHIVE_IMMUTABLE_LAYOUT_INVALID"
	CodeArchiveContextCanceled        Code = "ARCHIVE_CONTEXT_CANCELED"
	CodeArchiveAlreadyPublished       Code = "ARCHIVE_ALREADY_PUBLISHED"
)

// Error reports only a bounded stable code. Filesystem paths, document bytes,
// and SQLite values are intentionally excluded from its text.
type Error struct {
	code Code
}

// Error implements error.
func (e *Error) Error() string {
	return string(e.code)
}

// Code returns the stable validation outcome.
func (e *Error) Code() Code {
	return e.code
}

func outcome(code Code) error {
	return &Error{code: code}
}

// ErrorCode extracts an Archive outcome without exposing internal details.
func ErrorCode(err error) (Code, bool) {
	var archiveError *Error
	if !errors.As(err, &archiveError) {
		return "", false
	}
	return archiveError.Code(), true
}

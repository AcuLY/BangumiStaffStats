# Query contract retirement verification

Executed locally on Windows with Node 24.18.0, npm 11.16.0, Go 1.26.5,
Redocly 2.40.0, openapi-typescript 7.13.0 and oapi-codegen 2.8.0.

From the repository root:

```powershell
npx --yes --package=node@24.18.0 --package=npm@11.16.0 -c "node contracts/goldens/query/verify.mjs --refresh"
npx --yes --package=node@24.18.0 --package=npm@11.16.0 -c "node contracts/goldens/query/verify.mjs --check"
```

Both passed: 6 strict schemas, 113 golden cases, 95,370 pinned NFKC assertions,
14 public components and 44,170 cross-validator executions. The verifier
generated both disposable projections, Go and TypeScript twice; verified
equivalent schemas/responses, deterministic bytes and production generated
consumer drift; and compiled the Go wire package and ran both query contract
tests. The current manifest records measured artifacts, not historical macOS
execution metadata. Unicode source hashes use canonical LF text so Windows
Git CRLF materialization does not change the pinned Unicode content.

Removing share schemas exposed an oapi-codegen enum-name collision with the
separately generated catalog types. Both current generator entrypoints now
use a disposable configuration with `always-prefix-enum-values: true`.
Wire JSON names and validation semantics remain unchanged; generated Go was
never hand edited.

The broader `go test ./internal/httpapi/wire` compiled but failed the existing
`TestCatalogGeneratedWireIsCatalogOnlyAndCurrent` raw-file digest check:
`catalog.gen.go` hashed to
`8004c0bda795efc5ee659d09f87bd2b248cb2690731c87d6107cca1200dd4434`.
That untouched generated catalog file uses Windows CRLF. This is reported as
a separate failed check; the current query verifier selects only its query
contract tests. Full affected-component acceptance is owned by the primary
agent and is not inferred from these focused results.

Owned contract/generator/generated-file diff hygiene passed. No commit,
push, merge or deployment was performed by this owner.

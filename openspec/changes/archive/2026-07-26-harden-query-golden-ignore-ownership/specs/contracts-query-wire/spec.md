# contracts-query-wire Delta Specification

## ADDED Requirements

### Requirement: Approved root-ignore evolution supersedes the initial whole-file pin

For Query ignore evidence, this requirement supersedes only the whole-root
`.gitignore` byte-equality and editor/foreign-rule ownership clauses in
`Contract tooling is locked, development-only, and removable`. Root
`.gitignore` SHALL remain fatal-UTF-8-decodable, LF-only, and final-LF
terminated, but Query SHALL bind only its exact ordered owned projection:

```text
/contracts/goldens/query/node_modules/
/contracts/goldens/query/.cache/npm/
/contracts/goldens/query/.cache/go-build/
/contracts/goldens/query/.cache/go-mod/
/contracts/goldens/query/.cache/go-path/
/contracts/goldens/query/.tmp/
```

The verifier SHALL extract every non-comment line whose literal prefix is
`/contracts/goldens/query/` and require that array to equal the six lines above
exactly and in order. Missing, duplicate, reordered, extra, wildcard,
unanchored, or broadened Query rules SHALL fail. Lines outside that literal
prefix are owned and reviewed by their respective capabilities and SHALL
neither satisfy nor fail the Query projection.

`manifest.acceptanceEvidence.gitignore` SHALL contain exactly `path`,
`encoding`, `lineEndings`, `finalLf`, `ownedRules`, and
`ownedRulesSha256`. The digest SHALL bind the exact six-rule UTF-8/LF sequence
with one final LF, never the evolving whole-root file. The verifier SHALL
exercise deterministic in-process positive and negative projection cases
without writing the root ignore file.

#### Scenario: Approved unrelated owner rules coexist

- **WHEN** the root ignore file contains the exact Query projection plus exact
  rules owned by editor, API-golden, Archive-tooling, or Impeccable
  capabilities
- **THEN** Query ignore validation passes
- **AND** no unrelated line is copied into Query manifest authority

#### Scenario: Query ownership drifts

- **WHEN** a Query-owned rule is missing, duplicated, reordered, broadened,
  unanchored, wildcarded, or another Query-prefixed rule appears
- **THEN** the Query verifier fails before generation

#### Scenario: Shared file encoding is unsafe

- **WHEN** root `.gitignore` contains invalid UTF-8, CR/CRLF, or lacks its final
  LF
- **THEN** the Query verifier fails before generation

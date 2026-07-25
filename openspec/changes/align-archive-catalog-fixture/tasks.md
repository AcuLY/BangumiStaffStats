## Task Boundary

| Boundary | Declaration |
|---|---|
| Status | Main-agent reviewed after strict validation; apply pending. |
| Owner | One implementation agent; main agent owns acceptance/lifecycle. |
| Writable paths | Exact generator/canonical-corpus/Backend-test paths, two verifier seal literals, the two stale partners/co-star expected outcomes in `backend/internal/app/run_test.go`, one Backend inventory line, and these task markers from the proposal. |
| Read-only protected inputs | Schemas and verifier logic outside the two seals, producer corpus, Updater compiler, Backend production code, every other `run_test.go` assertion, checker logic outside the inventory line, frontend/staged work, guides, siblings, external state. |
| Deletion complement | No deletion, rename, path-set growth, cache/temp/generated residue. |
| Mutable refs | None. |
| Consumes | Current canonical corpus and accepted Updater/catalog semantics. |
| Produces | Correct resealed corpus and real Archive-to-catalog regression. |
| Dependencies | Existing Python/Node/Go toolchains only. |
| Deliverables | Exact diff plus deterministic/verifier/test/runtime evidence. |
| Acceptance | Regeneration replay, inventory seals, focused/race/full Backend gates, strict OpenSpec, runtime smoke, clean exact-path handoff. |
| Non-goals | Legacy compatibility, production-code/schema/API/UI changes, operations. |
| Operations deferred | Release, deploy, activation, production data and host work. |
| Stop/rollback conditions | Stop on branch/HEAD/path drift, owner overlap, protected edit need, non-determinism, failed seal, test fixture mutation, or external write. No `reset --hard`, checkout rollback, `git clean`, `git add -A`, broad deletion, stage, commit, or ref/remote mutation. |

## 1. Align and reseal the canonical fixture

- [ ] 1.1 Record branch, HEAD, exact staged/unstaged paths, canonical index path
  set/digest, and protected sibling work; confirm reviewed strict-valid
  artifacts and stop on any writable overlap.
- [ ] 1.2 Change only the canonical fixture builder's catalog rows for its
  existing three anime positions, `production` category, and compact featured
  members: canonical cast presentation/order, empty ordinary membership, all
  five capabilities, featured/category groups with zero-based members, and
  canonical selection rules. Do not expand to the full production
  configuration. Regenerate all and only existing canonical indexed outputs,
  never hand-editing SQLite or derived identities.
- [ ] 1.3 Run the Archive generator/verifier twice from clean disposable
  output state and prove byte-identical replay, exact closed path inventory,
  valid manifests/pointers/digests/dataVersion/table counts, then update only
  the verifier's two computed canonical seal literals and prove zero
  `producer/**`, schema, or other verifier drift.

## 2. Prove the real Backend boundary

- [ ] 2.1 Add a focused test that loads checked-in `valid/minimal` without
  rewriting SQL, calls catalog projection and/or the application route, and
  proves `/readyz` 200 plus `/api/v1/catalog` 200 with matching dataVersion,
  the exact bounded governed position/group/capability/rule projection, no
  legacy acceptance, and strict envelope validation. Add only that new test
  path to the Backend checker's closed inventory. Update only the existing
  application route test's two stale partners/co-star expectations from
  `400 CAPABILITY_NOT_AVAILABLE` to `503 NOT_READY`, proving capability
  admission now reaches the intentionally absent analytics boundary.
- [ ] 2.2 Run targeted Archive/catalog/app tests repeatedly and under `-race`,
  all catalog/Archive contract verifiers, `backend/scripts/check.sh`, runtime
  smoke against a copied unmodified bundle, `git diff --check`, and strict
  change/all OpenSpec validation.
- [ ] 2.3 Audit exact ownership, generated inventory, no fixture mutation
  inside tests, no production-code/protected/index/external mutation, and no
  disposable residue; report investigated/implemented/verified separately
  from committed/pushed/released/deployed and hand off the unstaged candidate.

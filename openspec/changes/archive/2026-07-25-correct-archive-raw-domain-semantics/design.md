## Context

The accepted DDL currently limits `cast_credit.role_type` to text
`main|support|guest`, while the unaccepted producer evaluator maps upstream
roles `1..4` to `main|supporting|guest|other` and rejects `5/6`. The same
evaluator maps only subject types `2/4` and rewrites relation codes `2/3` to
`sequel/prequel`; this both omits the rest of the source domain and reverses
the accepted `DR-DATA-SERIES-002` labels (`2=prequel`, `3=sequel`).

Read-only local evidence is locked as follows:

| File | SHA-256 | Rows / observed domain |
|---|---|---|
| `subject.jsonlines` | `c5f13042f660ee93951fe9e09062e178927d4f4bf1fe3b1cb5cbaf88d1092812` | 650,665; types `1/2/3/4/6` |
| `subject-characters.jsonlines` | `594095a5a0a11577e1ca01c15304f42dac0317cc4f91751b6062ffd9b112923b` | 434,177; roles `1..6` |
| `subject-relations.jsonlines` | `f79e4ec9c6a23447567da40aefb6343f6614bf7ba9647b944cf67129926c9a1b` | 910,489; 52 positive codes, minimum 1 and maximum 4099 |

The sorted distinct-domain seals are respectively
`5a78c4f014c3f76d16b2d902afb0e5f0ae25540fce9485c6a908f39abff55000`,
`c5d161527c5f9d09a2ed9cd76c4063481472f14da4dda40d19468bbfab4421a7`,
and `a12d764c98b4064df39a139914790aade8b6e887ca3d50e7b4c6a955ea4cd9ca`.
The files are read-only evidence, not deliverables.

| Boundary | Declaration |
|---|---|
| Status | investigated; design/spec candidate pending main review; no implementation |
| Owner | Main agent coordinates recovery; one correction owner applies/archives/commits; producer owner rebuilds afterward |
| Writable paths | Exact proposal path set only |
| Read-only protected inputs | Exact proposal protected set, including the isolated producer candidate and local dump |
| Deletion complement | Exact OpenSpec archive move only; no product deletion or canonical path change |
| Mutable refs | One verified named stash and one local branch commit, owned separately |
| Consumes | Accepted Archive/consumer authorities and cited decision/guide/local evidence |
| Produces | Corrected unpublished v1 plus Go consumer binding |
| Dependencies | `producer candidate -> recoverable isolation -> correction -> sync/archive/commit -> producer recovery/rebuild` |
| Deliverables | DDL/matrix/tooling/corpus/consumer updates and exact evidence |
| Acceptance | Numeric/five-type round trips, full identity propagation, deterministic gates, recovery proof |
| Non-goals | Product/catalog/query expansion, producer completion, external or operations work |
| Operations deferred | Acquisition, activation, release, deploy, production |
| Stop/rollback conditions | Stop on formal v1, overlap, path-set drift, or failed snapshot/recovery; retain prior bytes/ref |

## Goals / Non-Goals

**Goals:**

- Preserve the three accepted upstream domains without lossy conversion.
- Correct the unpublished v1 once and propagate every dependent identity.
- Keep the current producer work recoverable and make its later rework consume
  the corrected authority.

**Non-Goals:**

- Implement series traversal, catalog/query behavior, or the full producer.
- Support the discarded draft identities or change public product behavior.
- Touch another repository, remote, host, or production.

## Decisions

1. **Store raw cast/relation codes as integers.** `role_type` is constrained to
   `1..6`; `relation_type` is a positive JSON-safe integer. Subject type is the
   existing normalized text but its source adapter is a closed total map for
   `1/2/3/4/6`. Text labels were rejected because they lose upstream identity,
   already disagree across DDL/evaluator, and conflate storage with predicates.

2. **Keep predicates outside raw storage.** Main is `role_type=1`; all includes
   all eligible roles. Series eligibility consumes the accepted numeric code
   set and builds an undirected closure without changing the stored directed
   edge. This follows the accepted decisions without adding product semantics.

3. **Correct v1 in place only before its first snapshot.** Apply proves that no
   formal/public/activated/released/deployed v1 exists, retains both schema
   version numbers, regenerates the fixed 32 paths, and removes every old draft
   identity from compatibility. If that precondition fails, a new version is
   required.

4. **Treat identities as one dependency chain.** Canonical SQL changes first,
   followed by matrix object seal, dataVersion, SQLite, manifest, pointer, and
   root index. The builder's second clean run must reproduce identical bytes.

5. **Isolate producer work through a separate recovery owner.** With all owners
   quiescent and an empty index, that owner records the current candidate path
   inventory/hashes and prior `refs/stash`, creates one named path-scoped stash
   including untracked producer paths, and proves both the stash and cleaned
   overlap. The correction owner never reads or changes the stash. After the
   accepted correction is synchronized, archived, and committed, the recovery
   owner applies the recorded stash object without dropping it; the producer
   owner rebuilds expected overlapping files against new authority. The stash
   is dropped only after main review proves recovery. A destructive reset,
   checkout rollback, or clean was rejected.

## Risks / Trade-offs

- [Regeneration touches many canonical bytes] -> keep the 32-path set fixed,
  report every old/new digest, and require deterministic check plus clean build.
- [Stash restoration conflicts in README/builder/verifier] -> retain the stash
  object, accept only those declared overlaps, and rebuild rather than choosing
  either side blindly.
- [Future relation codes appear] -> store any positive JSON-safe integer; use
  downstream predicates to decide series membership without losing the row.
- [A v1 already escaped] -> stop and version the correction; never create two
  meanings for v1.

## Migration Plan

1. Main review accepts the strict-valid plan and proves no formal v1.
2. Recovery owner snapshots and isolates the exact producer candidate.
3. Correction owner updates Contracts and bounded Go evidence, runs all gates,
   synchronizes/archives the change, and creates one accepted local commit.
4. Recovery owner reapplies but retains the stash; producer owner rebuilds its
   overlap and reruns its own acceptance from the new authority.
5. Main review accepts recovery, then the recovery owner removes only the
   recorded stash entry.

## Open Questions

None. The accepted authorities determine numeric preservation, the five-type
map, and downstream predicate boundaries.

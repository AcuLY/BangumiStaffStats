## Why

Production updater run `6d7dd3d4-9eb4-472e-af09-0561dc313617`
successfully acquired and authenticated the 426 MiB official Archive, then
failed after 402 seconds in the SQLite build with `SQLITE_BUILD_FAILED`.
The builder requires `PRAGMA temp_store=FILE`, while the updater currently
offers only a 256 MiB `/tmp` tmpfs for SQLite spill files. No kernel or Docker
OOM occurred, and no data was published.

SQLite's documented Unix selection order gives `SQLITE_TMPDIR` precedence
over `/tmp`. The production updater already has a writable, disk-backed
Archive root with more than 50 GiB free, so routing only SQLite temporary
files there removes the artificial tmpfs ceiling without increasing memory
limits or weakening build validation.

## What Changes

- Give only the updater container the exact fixed environment value
  `SQLITE_TMPDIR=/var/lib/bgmss/archive`.
- Preserve the existing 256 MiB `/tmp` tmpfs for ordinary process temporary
  files and preserve every CPU, memory, PID, security, proxy, mount, and
  publication boundary.
- Extend direct and proxy Compose projection tests to require the SQLite
  variable only on updater and to reject its presence on API or Prometheus.
- Produce green exact-head Development Actions evidence, then separately
  amend production activation with the exact installed Compose blob and one
  new updater invocation. This change itself performs no host write or
  updater invocation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `operations-single-host-deployment`: Require production SQLite file-backed
  temporary work to use the updater's existing disk-backed Archive mount
  rather than its bounded `/tmp` tmpfs.

## Impact

| Field | Declaration |
|---|---|
| Status | Implemented and accepted at source `1505c5d7c36f457ed8d9e3be542e2422fe2811fc`: exact workflow-dispatch run `30452886753` completed with both jobs green and operations-preview artifact `8724804723`; the main spec is synchronized, this change is archived, and the exact production handoff is prepared. |
| Owner | Main agent directly owns specification, implementation, audit, Actions acceptance, Git, and the later activation amendment because this is one small sequential operations correction. |
| Writable paths | This change and archive destination; `operations/compose.yaml`; `operations/test/updater-proxy.sh`; `operations/README.md`; `openspec/specs/operations-single-host-deployment/spec.md`; and the four existing `activate-single-host-production` proposal/design/spec/tasks artifacts. |
| Read-only protected inputs | All product source, contracts, artifact inputs, other operations definitions, current branch history, accepted Actions artifacts, upstream data, and all `myserver`/external state. |
| Deletion complement | No repository dependency/file or external object. Existing exact test-temporary cleanup only. |
| Mutable refs | Change task state, one narrow implementation/lifecycle commit sequence, and branch push. Production refs remain immutable until a separately committed activation amendment. |
| Consumes | Run `6d7dd3d4-9eb4-472e-af09-0561dc313617`; status SHA `a10facccaa15ea9383414350c6a09550a0b2d23927573308292a0ff62ac1d3da`; current source `be48847bc26bcda28c9f08f6807f5dec40d479f4`; current Compose/runtime evidence; SQLite official temporary-file documentation. |
| Produces | One updater-only disk-backed SQLite temporary-directory projection, focused projection tests/documentation, green Actions evidence, and an exact production handoff. |
| Dependencies | Complete artifacts/review → one-line Compose implementation plus focused tests/docs → exact-head Actions → sync/archive and activation amendment → separately authorized host install and one updater invocation. |
| Deliverables | Strict-valid OpenSpec, implementation/tests/docs, green Actions, synchronized/archive lifecycle, and production handoff. |
| Acceptance | Direct and proxy projections contain exact updater-only `SQLITE_TMPDIR`; API/Prometheus lack it; all existing security/resource/proxy/publication gates remain; full Actions pass; repository diff is narrow and clean. |
| Non-goals | No product/parser/builder/schema/data change; no increased tmpfs or memory limit; no retry framework; no extra acquisition; no Nginx/systemd/logrotate/cutover action; no legacy or proxy mutation. |
| Operations deferred | Exact host Compose installation, one newly authorized updater invocation, and remaining production integration stay in `activate-single-host-production`. |
| Stop/rollback conditions | Stop on broader environment/resource/mount drift, any product diff, failed projection/Actions gate, or artifact/host mismatch. Repository rollback reverts only this candidate; production remains private on the minimal fixture. |

External behavior is **PRESERVE_ORACLE** at
`644b7748674e553f863d0ffd61d029f86fdc0717`; the change affects only internal
build scratch placement. It reads but does not mutate official documentation
or any external state. Apply is blocked until proposal, delta spec, design,
and tasks are complete, strict-valid, reviewed, and explicitly approved.

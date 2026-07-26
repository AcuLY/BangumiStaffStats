## Why

Formal integrated acceptance exposed a real sandbox-boundary defect. The
acceptance Harness correctly wraps non-browser commands in a host network-denial
sandbox, while the Query verifier wraps each of its four Go children in its own
macOS sandbox. macOS rejects the nested `sandbox-exec` call with exit 71.

The Query-owned inner profile currently denies only writes to the Go telemetry
directory. Removing the Harness outer sandbox would therefore make the Go
codegen children run without the network denial required by the accepted
development-acceptance contract. The correction belongs to the Query owner,
not to a weakened Harness exception.

## What Changes

- Add `deny network*` to the exact Query-owned Go sandbox profile while
  preserving its telemetry write denial.
- Rebind the profile text/SHA-256, wrapper evidence, verifier self-identity and
  Query manifest without changing Go argv, environment, module locks, generated
  output or wire semantics.
- Propagate only the resulting Query-manifest byte seal through Query Domain and
  Statistics.
- Prove the four Go children still run under the exact inner profile in the
  original checkout and two relocated clones, with identical outputs and zero
  residue.
- After this change archives, update the acceptance Harness so only
  `--verify-codegen-projections` runs without an outer macOS sandbox; the
  verifier's four exact inner profiles then provide the required network
  denial without unsupported nesting.

## Scope

Tracked implementation is limited to:

- `contracts/goldens/query/{verify.mjs,manifest.json}`
- `contracts/goldens/query-domain/{verify.mjs,manifest.json}`
- `contracts/goldens/statistics/index.json`

This change does not modify Query module locks, generated DTOs, Backend,
Frontend, Updater, artifact builders, acceptance implementation, dependencies,
public API/UI behavior, operations or external state.

## Impact

The Query manifest and its byte-seal consumers change. TypeScript and Go
generated outputs, module graph, product runtime payloads and product behavior
remain byte-identical. Formal Product artifacts must nevertheless be rebuilt
after archive because their statements bind the accepted source revision/tree.

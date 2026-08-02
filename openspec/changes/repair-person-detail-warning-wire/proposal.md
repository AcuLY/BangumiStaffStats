## Why

The production personal-scope person-detail endpoint returns HTTP 200 with `meta.collection.warningCodes: null` when the collection is fresh, although the existing wire contract has always required the empty array `[]`. The strict frontend therefore rejects an otherwise valid response and shows “人物详情加载失败”; the reported production failure is reproducible for `lucay126`.

## What Changes

- Preserve the existing person-detail contract and make the Backend serialize a fresh personal collection’s warning set as `[]`, not `null`.
- Add a focused regression test that fails on the deployed implementation and passes only when the response envelope contains the allocated empty array.
- Advance only the immutable operations bundle’s accepted Product revision after the complete Product workflow is green; do not change topology, contracts, frontend behavior, dependencies, or Archive data.
- Build one reviewed `linux/amd64` bundle through manual GitHub Actions, transactionally deploy it to the existing `search.bgmss.fun/v2/` runtime, and verify rollback, public behavior, logs, health, metrics, and legacy-root non-interference.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `backend-person-detail-api`: A fresh personal-scope success envelope explicitly serializes `warningCodes` as the empty array required by the existing contract.

## Impact

| Field | Declaration |
|---|---|
| Status | User-authorized production repair; implementation is blocked until proposal, delta spec, design, and tasks pass strict validation and main-agent zero-P0/P1 review. |
| Owner | Main agent; Backend owns the wire producer correction and Operations owns immutable bundle admission plus deployment. No subagent is used. |
| Writable paths | Repository: `backend/internal/persondetail/service.go`, `backend/internal/persondetail/service_test.go`, `operations/bin/build-bundle.sh`, `openspec/changes/repair-person-detail-warning-wire/**`, and synchronization of `openspec/specs/backend-person-detail-api/spec.md`. External after artifact admission: one absent `/srv/bgmss-v2/incoming/run-<github-run-id>/`, one absent `/srv/bgmss-v2/releases/<source-revision>/`, and only the existing deploy command’s transactional state targets under `/srv/bgmss-v2/state/{current.env,previous.env}` plus `/srv/bgmss-v2/{current,previous}-{frontend,tools}`. |
| Read-only protected inputs | `PRODUCT.md`, `DESIGN.md`, person-detail schemas/goldens/generated consumers, all other repository paths, current production Archive `/srv/bgmss-v2/data/**`, Compose/Prometheus/Nginx/systemd definitions, current/previous release directories, unrelated Docker containers/services, and the legacy root application. |
| Deletion complement | No repository product deletion. Remove only the exact run-owned incoming transfer root after successful deployment and local downloaded bundle after verification; rollback or failed deploy may remove only the exact still-inactive candidate as already defined by `operations/bin/deploy`. |
| Mutable refs | Local `codex/deploy-person-detail-warning-fix`; remote `refs/heads/codex/deploy-person-detail-warning-fix`; GitHub manual workflow run/artifact; the deploy command’s exact current/previous application refs. No tag, release, PR, merge, data pointer, Nginx route, timer, or legacy ref mutation. |
| Consumes | Existing person-detail success schema, the production failure evidence, deployed revision `a714fe7e865c93a4c2f4ed4b9dcbf2ef9ea7286a`, current master `94329c934867302113107d758e5658d7aa05cd1a`, existing artifact workflow, and existing transactional deploy/rollback commands. |
| Produces | One minimal Backend correction, one focused regression, one accepted Product pin, one exact green GitHub Actions run, one one-day AMD64 bundle, and one verified production application revision. |
| Dependencies | Strict-valid planning → RED/GREEN Backend correction → focused and complete Product workflow green → exact Product pin → final manual workflow green and bundle admission → host preflight → transactional deploy → public/live verification. |
| Deliverables | Correct fresh personal detail wire shape; unchanged public contract; rollback-preserving release; evidence for live person detail, `/livez`, `/readyz`, catalog, metrics, Prometheus, logs, root legacy route, and `/v2/` assets/API. |
| Acceptance | The focused test fails against the deployed implementation and passes with the correction; exact-head Product and bundle jobs succeed; bundle checksum/build metadata bind the deployed revision; the public `lucay126` personal detail response contains `warningCodes: []`; browser detail renders; operations check passes; no unexpected 5xx/panic or protected-state drift. |
| Non-goals | No contract relaxation to nullable, frontend fallback, new capability, dependency, Archive update, updater invocation, Nginx reload, routing change, legacy retirement, PR/merge, or unrelated post-production frontend fixes. |
| Operations deferred | Merging to master, tagging/releasing, Archive refresh, Nginx/systemd/timer changes, retention cleanup, image pruning, and legacy service changes remain outside this authorization. |
| Stop/rollback conditions | Stop on dirty/overlapping paths, failed strict validation, failed Product/bundle job, checksum or identity mismatch, occupied operation lock, host topology/data drift, insufficient capacity, or failed pre-deploy health. Deployment failure must use the existing transactional restoration. A post-deploy regression requires `/srv/bgmss-v2/operations/bin/rollback-app --root /srv/bgmss-v2` followed by the complete health/public checks. Never reset hard, clean broadly, overwrite unrelated work, mutate the Archive pointer, or change Nginx. |

Externally visible behavior is `PRESERVE_ORACLE` relative to immutable oracle `644b7748674e553f863d0ffd61d029f86fdc0717`: the intended detail view already exists; this repair only makes the strict existing contract reachable. The user explicitly authorized live deployment to `myserver` for `search.bgmss.fun/v2/` in this conversation.
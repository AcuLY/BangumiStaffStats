## Context

The new static frontend and new API currently occupy root-relative URLs on
`search.bgmss.fun`. The retained legacy SPA is still available at
`/srv/bgmss/frontend/dist`, and the new API remains healthy on loopback
`127.0.0.1:18080`. The user has assigned the domain root back to the legacy
application and selected a path, rather than a hostname, for the new version.

The same-browser-origin requirement is useful, but a path deployment has four
linked concerns: Vite asset URLs, History API navigation, generated share
links, and API/image requests. Nginx-only rewriting cannot safely correct the
compiled browser behavior.

| Field | Declaration |
|---|---|
| Status | Design complete; apply pending strict validation and main-agent zero-P0/P1 review. |
| Owner | Main agent directly owns the sequential frontend, lifecycle, and exact production work. |
| Writable paths | Proposal writable paths and mutable refs only. |
| Read-only protected inputs | Proposal protected inputs, especially visual/CSS/assets, backend/updater/contracts semantics, Archive state, legacy services/data, TLS/DNS/firewall, and unrelated Nginx blocks. |
| Deletion complement | Proposal deletion complement only; no application or legacy deletion. |
| Mutable refs | Proposal refs only. |
| Consumes | Accepted frontend source/build workflow, existing transaction-safe deploy, retained legacy root, new loopback API, and exact active Nginx preimage. |
| Produces | One `/v2/`-based static artifact and one reversible same-vhost legacy/new path split. |
| Dependencies | Frontend → admitted bundle → transactional application deploy → reviewed Nginx candidate → syntax/probes → archive. Nginx cutover never precedes the admitted release. |
| Deliverables | Path utility, targeted call-site/test changes, build base, operations template/docs, deployment/cutover evidence. |
| Acceptance | Proposal acceptance plus strict change/all-spec validation and zero P0/P1 review. |
| Non-goals | Proposal non-goals only. |
| Operations deferred | Proposal deferred items only. |
| Stop/rollback conditions | Proposal stop/rollback conditions only. |

## Goals / Non-Goals

**Goals:**

- Keep the legacy UI at `/` and the complete new browser surface below
  `/v2/**`.
- Preserve the new UI's exact accepted visual and interaction behavior.
- Keep backend handlers unchanged at `/api/v1/**` while exposing them through
  `/v2/api/v1/**`.
- Make deployment and rollback atomic, content-aware, and bounded to one TLS
  vhost.

**Non-Goals:**

- No compatibility redirect from the new application's former root URLs,
  because those URLs now belong to the legacy SPA.
- No API schema, Archive, updater, dependency, DNS, TLS, or legacy lifecycle
  change.

## Decisions

### Use `/v2/` as one compile-time application base

`frontend/vite.config.ts` supplies `/v2/` for production builds. One small
`basePath.ts` module normalizes `import.meta.env.BASE_URL` and maps logical SPA
paths/API references to public paths. Vitest continues to use `/`, so existing
logical-route tests remain meaningful; focused tests explicitly cover the
normalizer and `/v2/` mapping.

This is preferred over Nginx response substitution because compiled dynamic
imports, History API writes, share URLs, and image requests all need the same
base and cannot be corrected reliably by editing only `index.html`.

### Keep logical route and wire identities unchanged

The application continues to reason about `/ranking` and `/co-star`; the
deployment utility adds `/v2` only at the browser boundary. Share envelope
validation still receives the existing logical route identity, while the
generated URL uses the public path. API adapters continue to declare
`/api/v1/**`; the native-fetch client prefixes the public deployment base only
after validating the logical reference. The direct image helper uses the same
mapping.

This avoids changing query/share/API contracts or backend handlers.

### Split Nginx by one reserved prefix

Within only the `search.bgmss.fun` TLS vhost:

- exact `/v2` redirects to `/v2/`;
- `/v2/api/v1/` proxies to the unchanged loopback `/api/v1/`;
- `/v2/` serves the new static root with SPA fallback to `/v2/index.html`;
- the existing legacy `/statistics`, `/timeline`, and `/proxy` locations stay
  byte-equivalent;
- `/` serves `/srv/bgmss/frontend/dist`.

The `/v2` locations precede the legacy catch-all. No root `/api/v1/` route is
retained for the new stack.

This is preferred over leaving the API at root because the requested path
boundary should completely identify the new version and avoid future legacy
collisions.

### Deploy application before public routing

The exact-head green Actions artifact is admitted and deployed through the
existing transaction first. The candidate Nginx file is derived from the exact
active preimage, retained under `/srv/bgmss-v2/config/nginx/nginx.conf`, tested
with `nginx -t`, atomically renamed, reloaded, and content-probed. A new exact
pre-change backup is used for this change; the historical
`.pre-bgmss-v2` file remains untouched as evidence.

## Risks / Trade-offs

- [An overlooked absolute browser URL escapes to the legacy app] → Search the
  complete frontend source, centralize mapping, exercise navigation/share/API/
  image/deferred-chunk paths, and inspect the built index from Actions.
- [Nginx `alias` and SPA fallback resolve incorrectly] → Validate the rendered
  candidate against the real release and probe direct assets plus both client
  routes before acceptance.
- [Root fallback hides a broken `/v2` request by returning legacy HTML] →
  Reserve `/v2` with `^~`/exact locations and require content hashes and JSON
  decoding, not status alone.
- [Application deploy succeeds but cutover fails] → Keep the release private,
  restore the exact Nginx preimage, and leave both application stacks running.

## Migration Plan

1. Implement and test the path mapping, production build base, and operations
   template; strict-validate and review.
2. Commit/push and require exact-head Development Actions green.
3. Admit the exact `linux/amd64` bundle and transactionally deploy it to the
   existing `/srv/bgmss-v2` project without changing Archive data.
4. Re-preflight Nginx and protected legacy/new identities, create the exact new
   backup/candidate, validate, atomically reload, and run content-aware probes.
5. On any failure, restore/reload the new backup and prove legacy recovery.
6. Sync/archive the change, commit/push the evidence, and report exact routes.

## Open Questions

None. The user selected the same domain and a distinct path; `/v2/` is the
bounded version path.

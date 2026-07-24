## Context

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: unaccepted updater candidate only; verified: official CLI/Skill/tag/commit, exact 127-file skill, official hook provenance, and strict planning checks passed; full candidate acceptance pending; committed: planning status is determined by containing Git history and final upgrade commit is not yet claimed; pushed: no; released: no; deployed: no |
| Owner | Main owns specification and acceptance; one implementation subagent owns the idempotent updater/adaptation/validation block. |
| Scope | Only the exact tooling, project-context, surface, ignore, task, and lifecycle paths declared by the proposal may change. |

Official sources currently expose:

- npm CLI `impeccable@3.3.1`;
- latest stable Skill release `skill-v4.0.2`;
- annotated tag `bafff062d54775efdb919f35ac3e387fe9789651`;
- peeled commit `fc2e694afca1ac0cc384b4fe56bab3335fea7912`;
- project skill destination `.agents/skills/impeccable/**`;
- Codex hook destination `.codex/hooks.json`.

CLI and Skill versions are independent. There is no npm
`impeccable@4.0.2`. The supported non-interactive project update command is:

```sh
PATH=/Users/luca/.nvm/versions/node/v24.18.0/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  npx --yes impeccable@3.3.1 update --project --yes
```

The first `--yes` belongs to npx and the final `--yes` belongs to Impeccable.
The updater changes the skill and merges its Codex hook; it does not migrate
PRODUCT, create a surface brief, or edit `.gitignore`.

An unaccepted candidate already exists because this CLI performs `update` even
when called with `update --help`. A read-only comparison has already shown the
127-file skill and hook match the pinned tag. Apply SHALL NOT rerun the updater:
it follows the release that is latest at execution time, so another run would
add a new-release race without adding evidence.

## Decisions

### Verify the existing official-updater result

The implementation owner SHALL validate the current candidate rather than
maintain a custom downloader or filesystem transaction. It SHALL verify:

- the installed `SKILL.md` declares `version: 4.0.2`;
- the installed skill inventory matches the official `skill-v4.0.2` tag after
  excluding only upstream release-runtime cache state that is not project
  content;
- the Impeccable entries in `.codex/hooks.json` match the official Codex
  distribution and preserve any unrelated hook entries;

If the candidate is not exactly v4.0.2, apply stops so the specification can be
revised deliberately.

### Keep project design context at repository root

`PRODUCT.md` SHALL gain this marker immediately after its H1:

```text
<!-- impeccable:product-schema 1 -->
```

The deprecated four-line `## Register` / `product` block SHALL be removed and
all other product content preserved. `DESIGN.md` remains the design authority.
`.impeccable/design.json` is intentionally not regenerated before formal
frontend components exist; doctor may report only the corresponding stale
sidecar finding.

### Define one Operate surface for the formal SPA

Track `.impeccable/surfaces/route.md` with this content:

```markdown
---
version: 1
slug: "route"
primary_target: "route:/"
related_targets: ["route:/ranking","route:/co-star","frontend","frontend/index.html","frontend/src/app/App.vue"]
---

# Formal SPA operate surface

## Mode

Operate

## Scope and task

The formal single-page application covers `/`, `/ranking`, and `/co-star`. Its core task is to let people query and compare Staff relationships, keep the applied query boundary visible, and continue browsing without losing context.

## Authority and continuity

The Go backend and shared contracts remain the sole statistical authority. The frontend must not calculate authoritative statistics, call Bangumi upstream directly, or use fixtures as production data. This surface inherits the trusted community-data-analysis character in root `DESIGN.md` and the immutable prototype oracle's approved final external behavior; it does not establish a new visual identity.

## Memorable moment

After a query is applied, the active conditions, request boundary, and objects available for deeper exploration remain legible together.

## Quality floor

Favor dense but readable information, WCAG 2.2 AA, complete keyboard and touch operation, reduced-motion support, and structural responsiveness from 360px upward. Exact routes, components, and design-sidecar regeneration remain governed by approved frontend OpenSpec changes.
```

The v4 surface tool must resolve the primary route and all five related targets
to that one brief without creating additional derived brief files.

### Ignore runtime state, not design truth

The root `.gitignore` SHALL add one labeled Impeccable block covering only
runtime hook/live/cache/evidence outputs documented by v4. It SHALL NOT ignore
`PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`,
`.impeccable/surfaces/**`, editor settings, application code, or OpenSpec.

### Make v4 the frontend design gate

Any later user-visible frontend implementation SHALL:

1. resolve and read the applicable surface brief;
2. read the owning command playbook plus `reference/craft-floor.md` before UI
   edits;
3. for the first formal SPA, use `reference/new-work.md` to preserve and
   expand the incumbent PRODUCT/DESIGN/oracle visual world, then use
   `reference/operate.md`;
4. verify rendered desktop/mobile behavior and accessibility;
5. obtain a separate read-only `impeccable_finish_reviewer` review before
   frontend acceptance.

This does not require those steps for backend-only or updater-only changes.

## Verification

- Compare installed Skill/hook output with the pinned official tag.
- Run `node --check` for every installed `.mjs` and `.js` file.
- Run v4 context against `frontend`, surface path/list/read checks, doctor JSON,
  and safe hook smoke tests under Node 24.
- Run targeted and repository-wide strict OpenSpec validation, OpenSpec doctor,
  `git diff --check`, and exact path inventory checks.
- Confirm no updater/download/runtime transient remains in the repository.

## Risks / Trade-offs

- The updater follows the current Skill release, so the already-proven candidate
  is retained and verified rather than fetched again.
- Codex may require the user to re-approve the changed project hook in `/hooks`;
  this is a local trust UI action and not repository implementation.
- The design sidecar remains intentionally stale until formal frontend
  components exist; no other doctor finding is accepted.

## Open Questions

None.

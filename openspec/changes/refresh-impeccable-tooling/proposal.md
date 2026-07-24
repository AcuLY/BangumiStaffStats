## Why

The repository-owned Impeccable skill is v3.9.1. The formal frontend rewrite
should start with the current v4 workflow, surface context, doctor checks, and
finish-review support rather than carry the retired global register model into
new code.

## What Changes

- Accept the existing official-updater candidate only after proving its
  project-owned skill and Codex hook match Skill v4.0.2 from tag
  `skill-v4.0.2` (peeled commit
  `fc2e694afca1ac0cc384b4fe56bab3335fea7912`).
- Migrate `PRODUCT.md` from the deprecated global `Register` section to the v4
  product-schema marker.
- Add one root-owned `Operate` surface brief for the formal SPA routes and
  frontend source targets.
- Ignore only Impeccable runtime/transient state while keeping design and
  surface artifacts tracked.
- Verify the v4 skill, hook, context, surface routing, doctor, and JavaScript
  syntax under the accepted Node 24.18.0 toolchain.

Behavior classification:

- `PRESERVE_ORACLE`: no frontend runtime or user-visible behavior changes.
  `PRODUCT.md`, `DESIGN.md`, and oracle
  `644b7748674e553f863d0ffd61d029f86fdc0717` remain the outward-behavior
  authority.
- `INTENTIONAL_DELTA`: Impeccable v3.9.1 becomes v4.0.2, and global product
  register routing becomes one explicit route surface.
- `NEW_CAPABILITY`: future frontend changes gain v4 context, doctor, surface,
  craft-floor, and independent finish-review gates.

## Capabilities

### New Capabilities

- `frontend-impeccable-tooling`: Defines the repository-owned Impeccable
  version, project context migration, surface routing, hook, hygiene, and
  future frontend design gates.

### Modified Capabilities

None.

## Impact

| Boundary | Declaration |
|---|---|
| Status | investigated: complete; specified: approved; implemented: unaccepted updater candidate only; verified: official CLI/Skill/tag/commit, exact 127-file skill, official hook provenance, and strict planning checks passed; full candidate acceptance pending; committed: planning status is determined by containing Git history and final upgrade commit is not yet claimed; pushed: no; released: no; deployed: no |
| Owner | Main owns decisions, specification, acceptance, lifecycle, and small corrections. One implementation subagent owns the idempotent updater rerun, project adaptation, and validation because the large vendored-tree context is worth isolating. |
| Writable paths | Planning: this change's five artifacts. Apply: `.agents/skills/impeccable/**`, `.codex/hooks.json`, `.gitignore`, `PRODUCT.md`, `.impeccable/surfaces/route.md`, and task checkboxes. Lifecycle: the exact archive and `openspec/specs/frontend-impeccable-tooling/spec.md`. |
| Protected inputs | `DESIGN.md`, `.impeccable/design.json`, `.vscode/**`, `contracts/**`, `tmp-formal-development/**`, the three Wave 1B changes, application/runtime roots, remotes, and production state. |
| Deletion complement | The updater may remove only paths retired by official v4 inside `.agents/skills/impeccable/**`. No other repository, host, external, or runtime data may be deleted. Temporary acquisition state must be outside the repository or removed exactly after validation. |
| Mutable refs | Local `codex/formal-rewrite` planning and final commits only. No amend, rebase, tag, remote ref, PR, release, or deployment. |
| Consumes | HEAD `b6513c1`; Node `24.18.0`; official CLI `3.3.1`; official Skill v4.0.2 tag/commit; current v3 skill; PRODUCT/DESIGN/oracle context. |
| Produces | Verified Skill v4.0.2, compatible hook, schema-1 PRODUCT metadata, route surface brief, bounded ignore rules, archived capability. |
| Acceptance | The existing official-updater candidate identifies v4.0.2 and matches the pinned official tag; context/surface/doctor/hook/syntax/OpenSpec/Git checks pass under Node 24; only declared paths change; no transient residue remains. |
| Non-goals | Frontend runtime code, visual redesign, sidecar regeneration, backend/updater code, global CLI installation, or operations. |
| Stop conditions | Stop on source/version mismatch, unexpected path mutation, hook/context/doctor failure, foreign-state conflict, or inability to prove the candidate. Leave the bounded candidate for review; do not automatically reset or clean. |

The planning checkpoint may coexist with the current unstaged updater candidate,
but it stages only this change. The candidate is not accepted merely because
the official CLI produced it.

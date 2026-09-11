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

## Current surface relationships

The shared Query editor offers the exclusive All position scope only in co-star.
Ranking-detail handoff selects that scope and the exact person identities without
origin flags or an extra return-state layer. Co-star candidate selection is an
inline disclosure below 780px; person detail uses the existing drawer below
960px and the inline inspector above it. Full ranking metric groups remain
visible; profile metric columns follow their actual container width. Exact
spacing, motion and breakpoint values stay in root DESIGN.md and its sidecar.

## Quality floor

Favor dense but readable information, WCAG 2.2 AA, complete keyboard and touch operation, reduced-motion support, and structural responsiveness from 360px upward. Exact routes, components, and design-sidecar regeneration remain governed by approved frontend OpenSpec changes.

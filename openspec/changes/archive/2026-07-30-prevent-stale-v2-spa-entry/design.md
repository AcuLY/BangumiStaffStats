## Context

Nginx's default static validators are derived from file mtime and size. The
reproducible frontend pipeline normalizes mtimes, and two different SPA entry
documents can have equal sizes. Those inputs therefore do not uniquely identify
the active release. A stale browser can receive `304` for old HTML even though
the active frontend symlink points at a new, correctly built release.

## Decisions

### Treat SPA entry HTML as a release pointer

The exact `/v2/`, exact `/v2/index.html`, and named SPA fallback responses will:

- disable ETag generation;
- ignore `If-Modified-Since`;
- emit `Cache-Control: no-store`;
- retain the existing security headers in the reviewed standalone template.

This makes every navigation obtain the active entry document and prevents an
old response from surviving the next deployment or rollback.

### Preserve hashed asset behavior

The general `/v2/` prefix location remains unchanged. Existing JS, CSS, font,
and image paths continue to resolve directly, and only requests that fall
through to the SPA entry receive the non-storable policy.

### Apply a bounded host transformation

The live repair changes only the three named locations in the existing
`search.bgmss.fun` TLS server. It records and rechecks the preimage hash, writes
through a same-directory temporary, retains a mode-0600 exact backup, runs
`nginx -t`, reloads, and tests both ordinary and deliberately stale
conditional requests. Any failure restores the preimage and reloads it.

## Risks / Trade-offs

- SPA entry HTML is fetched on each navigation, which is a small and deliberate
  cost for release correctness.
- Adding a child `add_header` prevents inherited headers in Nginx, so the
  standalone template repeats its existing security headers in the three HTML
  locations.
- A broad prefix-level cache directive would also affect hashed assets; the
  change explicitly avoids that.

## Migration Plan

1. Validate this change strictly.
2. Update the reviewed Nginx template and focused static regression.
3. Run source validation, commit, and obtain green Actions before final
   lifecycle alignment.
4. Apply the bounded live transformation under the existing rollback timer.
5. Prove stale validators return current HTML, then repeat desktop/mobile
   browser acceptance.

## Open Questions

None. The production failure and affected request paths are directly observed.

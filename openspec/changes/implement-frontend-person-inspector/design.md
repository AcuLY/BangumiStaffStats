## State and requests

The query coordinator remains the only query-revision and request-sequence
authority. Focusing a ranking row requests `{query,input:{personId},view}` for
the current revision without editing Draft or Applied Query. A new person
replaces the whole detail atomically; a works/characters view request preserves
the accepted header, summary, metrics, evidence, tags, and charts while only
the browser body is pending. Superseded and cancelled responses cannot commit.

Detail view controls are server-side. The frontend displays the returned
nullable values, provenance, ranks, pagination, and omission semantics without
recomputing statistics or filtering result sets locally.

## Presentation

The oracle is presentation evidence, not a source architecture. At desktop
widths the ranking and person inspector remain simultaneously visible; compact
widths open the same detail surface in a dismissible drawer. Row activation and
close controls are keyboard operable, focus is restored safely, controls meet
the 44px target, reduced motion is honored, and neither layout overflows.

The inspector retains the oracle's information hierarchy: identity and
participation summary, metric/evidence cards, tags and rating/timeline
visualization, followed by a works/series browser and a cast-only character
browser. It uses shared same-origin `SafeImage` behavior and never derives
metrics or requests Bangumi directly.

## Verification

Strict adapter/driver tests, sequence and revision tests, component state tests,
full frontend checks, and desktop/mobile Light/Dark browser comparison to the
oracle are required. Browser coverage includes pending, ready, error, empty,
work/character switching, search/sort/page, keyboard/focus, overflow, reduced
motion, and a fresh console.

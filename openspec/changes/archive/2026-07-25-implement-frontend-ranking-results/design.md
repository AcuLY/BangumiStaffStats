## Context

The immutable prototype oracle is
`644b7748674e553f863d0ffd61d029f86fdc0717`. Its ranking summary, compact
toolbar, column language, row density/progress, empty copy, and responsive
pagination are presentation evidence. Its fixture/state/statistics structure is
not reusable.

## Decisions

1. `features/ranking` owns response adaptation, view state, and presentation.
   It consumes the coordinator's ranking resource and never owns Applied Query.
2. The driver posts same-origin `/api/v1/rankings` through the accepted native
   fetch client. It strictly decodes the generated response, returns requestId
   and collection warning metadata, and maps no backend message into logic.
3. Search/sort/order/page/pageSize are server view requests. Draft changes and
   route changes do not silently request; explicit ranking toolbar changes may
   refresh only the existing applied ranking resource without advancing query
   revision.
4. Rows render API rank directly. The frontend never re-ranks, derives summary
   from a page, or computes average/overall/preference.
5. `SafeImage` derives only same-origin person proxy candidates and implements
   loading, loaded, failed, and no-image states without layout shift.
6. At 780px and above the list retains its dense table-like columns. Below
   780px it becomes the approved compact row/pagination form with 44px controls,
   no horizontal overflow, keyboard focus, and reduced-motion behavior.

## Verification

Strict adapter tests, driver cancellation/error/metadata tests, component state
tests, query-revision/view tests, desktop/mobile Light/Dark browser comparison
to the oracle, keyboard/focus, overflow, and fresh-console checks are required.

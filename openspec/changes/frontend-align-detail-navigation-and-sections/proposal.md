## Why
The person drawer disables the visible Header, preventing the requested mode switch. Person section titles use 20px while co-star uses 18px, and both tag label columns reserve 104px for four Chinese characters.
## What Changes
- INTENTIONAL_DELTA: keep Header operable while person drawer isolates only page content. Mode navigation closes the drawer without losing accepted detail state or moving focus back to hidden ranking content.
- Align detail/co-star section titles to 18px and fit tag-name columns to text with an 8px gap.
## Capabilities
### New Capabilities
- None.
### Modified Capabilities
- `frontend-person-inspector`: Header-accessible drawer and section typography.
- `frontend-accessibility`: person drawer focus scope includes Header.
## Impact
Primary owns App.vue, PersonDetailSurface.vue, person-detail.css, co-star-oracle.css, the existing person-detail component and ranking integration tests, DESIGN.md, and these two specs. Current master only; preserve dirty work. No backend/services/dependencies or Git refs.

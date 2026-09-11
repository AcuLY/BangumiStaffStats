## ADDED Requirements
### Requirement: Drawer preserves Header navigation
The person drawer SHALL keep the Header operable by pointer and keyboard while the covered page content remains inert. Switching to co-star SHALL close the drawer, preserve accepted person state and retain navigation focus. The drawer SHALL not claim page-wide aria-modal isolation.
#### Scenario: Switch modes with detail open
- **WHEN** the user activates the Header co-star tab while a person drawer is open
- **THEN** co-star becomes active and the drawer closes without blocking Header interaction
### Requirement: Section typography and tag label columns align
Person detail and co-star section headings SHALL use 18px. Tag label columns SHALL fit their text and retain an 8px gap before wrapping tag values.
#### Scenario: Narrow tag section
- **WHEN** tag groups render at a narrow viewport
- **THEN** label columns do not reserve unused 104px tracks and values wrap without horizontal overflow

## ADDED Requirements
### Requirement: Tags use the component-library primitive
All live content tags, including grouped evidence, work metadata, cast roles and selected identity chips, SHALL use Naive UI NTag or a Naive UI owner such as NDynamicTags. Public size/round/type/close APIs SHALL own visual states; obsolete manual pill styling SHALL be removed. Loading placeholders SHALL remain NSkeleton with corresponding geometry. Group labels SHALL be vertically centered with their associated tags without manual top offsets.
#### Scenario: Role tags wrap or overflow
- **WHEN** role evidence exceeds the available row width
- **THEN** visible, measured and tooltip entries use identical NTag geometry and every role remains accessible
#### Scenario: Selected identity is removed
- **WHEN** a pointer or keyboard user activates identity removal
- **THEN** the exact identity is removed and logical focus is preserved without nested interactive controls
#### Scenario: Grouped evidence wraps on mobile
- **WHEN** tag values wrap onto multiple lines
- **THEN** the label stays vertically centered with its tag block and content does not overflow horizontally

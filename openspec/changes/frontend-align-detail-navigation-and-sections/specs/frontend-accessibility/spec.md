## ADDED Requirements
### Requirement: Person drawer focus includes persistent Header
As an exception to modal-only Drawer focus, the person-detail drawer SHALL permit keyboard access to its visible persistent Header while page content remains inert and aria-hidden. Escape/close SHALL restore a visible opener; Header navigation SHALL retain focus in Header rather than a hidden ranking row.
#### Scenario: Keyboard reaches Header
- **WHEN** a user tabs backward from the person drawer's first control
- **THEN** focus can reach the persistent Header controls without entering covered page content

## ADDED Requirements

### Requirement: Exact rated work evidence in timeline quarters
Every person-detail rating timeline quarter SHALL include a required works array of subject references including original date and integer-hundredths score. The array SHALL contain every eligible rated subject for that quarter exactly once, sorted by date then subject ID; count SHALL equal its length. Evidence SHALL be invariant under view pagination/search. Series timelines SHALL remain empty.

#### Scenario: Two works share one quarter
- **WHEN** two eligible works have ratings in the same quarter
- **THEN** the quarter contains two independently identifiable work points and one canonical mean

#### Scenario: Ineligible dates or ratings
- **WHEN** a work has no valid rating or no month-precise valid date
- **THEN** it is absent from timeline work evidence without inventing dates or ratings

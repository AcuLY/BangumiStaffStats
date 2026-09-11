## ADDED Requirements

### Requirement: Preserve timeline subject evidence
The backend SHALL project complete rated work evidence into each person-detail timeline quarter before view filtering and pagination. Means SHALL use the existing canonical statistics output. Cache clones SHALL deeply isolate nested work evidence and cache cost SHALL account for its storage.

#### Scenario: Cached evidence remains isolated
- **WHEN** one returned timeline work reference is modified by a consumer
- **THEN** subsequent cached results retain their original names, dates, scores and identities

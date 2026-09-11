## ADDED Requirements

### Requirement: Accepted OpenAPI identity SHALL remain synchronized

The artifact validator, Backend packaging pin, and Backend/Frontend positive component statements SHALL bind the same reviewed SHA-256 of contracts/openapi/openapi.yaml. The accepted digest for this synchronization SHALL be sha256:999272f4fcd204c1dfecbe1948c77abcf29230dc1e8a76eb7549c386cab09260. Tests SHALL compare the accepted constant and Backend pin to the source file; incompatible component identities SHALL still be rejected.

#### Scenario: Approved OpenAPI is packaged

- **WHEN** the current reviewed OpenAPI and its synchronized component statements are validated
- **THEN** Backend and Frontend SHALL declare the same accepted OpenAPI identity and pass artifact compatibility validation

#### Scenario: OpenAPI changes without artifact synchronization

- **WHEN** the OpenAPI file or Backend pin differs from the accepted contract constant
- **THEN** the identity regression SHALL fail rather than silently deriving a new accepted value

### Requirement: Frontend packaging SHALL declare current Archive compatibility

The Frontend component statement SHALL declare manifest schema range 1..1 and SQLite schema range 2..2, matching the accepted compatibility matrix and the Contracts-supported SQLite schema version 2.

#### Scenario: Frontend artifact is packaged against current contracts

- **WHEN** the current Frontend artifact is packaged
- **THEN** its emitted Archive compatibility SHALL equal the accepted Backend declaration, include SQLite schema version 2, and pass the unchanged component and assembly validators

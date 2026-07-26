## 1. Validator

- [x] 1.1 Add pure, fail-closed parsers for Node, npm, Go, uv JSON, Buildx, and
  current-builder/BuildKit evidence plus one CLI that collects those outputs.
- [x] 1.2 Add positive and malformed/wrong/ambiguous negative tests, including
  the annotated uv human output regression.

## 2. Workflow

- [x] 2.1 Replace the inline toolchain block with the validator and pin the five
  official actions to the exact reviewed release commits.
- [x] 2.2 Strengthen CI policy tests for the exact pins and validator data flow;
  preserve read-only/no-publication authority and every existing product gate.
- [x] 2.3 After the first fresh run reaches Backend and exposes an external
  setup-go GOROOT, make Go 1.26.4 the reviewed bootstrap, select exact Go 1.26.5
  for semantic admission through a runner-temporary module cache, and lock this
  separation in workflow policy tests without weakening Backend containment.

## 3. Acceptance

- [x] 3.1 Run focused and complete artifact tests, workflow policy/residue,
  strict OpenSpec, YAML/diff hygiene, and hand off unstaged.
- [ ] 3.2 Main agent audits, marks/syncs/archives/commits, pushes the branch,
  and waits for one fresh full GitHub Actions run to finish successfully.

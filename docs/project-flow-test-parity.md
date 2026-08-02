# Project Flow Test Parity Matrix

This matrix tracks the project wizard paths that should remain behaviorally aligned:

- Solo public
- Solo private
- Team public
- Team private

The main gap found during this audit was that lifecycle tests covered the happy path, but not every button/action path. New tests should be added by action category, not only by page sequence.

## Current Action Parity

| Action | Solo Public | Solo Private | Team Public | Team Private | Notes |
|---|---|---|---|---|---|
| Details continue creates/updates draft | Covered | Covered | Covered | Covered | Component specs and lifecycle specs cover this. |
| Details save draft from new project | Covered | Covered | Covered | Covered | Fixed solo private and team public/private parity. |
| Details save draft redirects to draft URL | Covered | Covered | Covered | Covered | Prevents losing project context after first draft save. |
| Details save draft from existing project | Covered | Covered | Needs deeper coverage | Needs deeper coverage | Existing project route should save without redirecting to a new id. |
| Details invalid form blocks save/continue | Covered | Covered | Partial | Partial | Add explicit disabled/no-call tests for team details. |
| Step back navigation | Partial | Partial | Partial | Partial | Some components test this; not yet matrix-complete. |
| Later-step save draft persists current step data | Partial | Partial | Partial | Partial | Many tests only assert navigation/toast; should assert service/API call. |
| Documents continue saves documents | Covered | Covered | Covered | Covered | Covered by component/lifecycle tests. |
| Documents save draft saves documents | Partial | Partial | Partial | Partial | Needs action-level parity tests. |
| Assignments continue saves assignments | Not applicable | Covered | Not applicable | Covered | Private flows only. |
| Assignments save draft saves assignments | Not applicable | Partial | Not applicable | Partial | Needs action-level parity tests. |
| Staff continue saves staff | Not applicable | Covered | Team public staff on details | Not applicable | Solo private staff covered; public staff lives on details. |
| Staff save draft saves staff | Not applicable | Partial | Team public staff on details | Not applicable | Needs explicit solo private staff draft test. |
| Decision activation happy path | Covered | Covered | Covered | Covered | Component specs cover active routing/modals. |
| Decision activation subscription-required path | Covered | Covered | Covered | Covered | Component specs cover billing route. |
| Decision save draft button is wired | Covered | Covered | Covered | Covered | Team public no-op fixed in this pass. |
| Decision cancel button is wired | Covered | Covered | Covered | Covered | Team public no-op fixed in this pass. |
| Active edit hides/avoids activate | Covered | Covered | Covered | Covered | Component specs check active edit does not activate. |
| 25-submission lifecycle | Covered | Covered | Covered | Covered | Service/backend-level lifecycle specs cover this. |
| Backend API lifecycle | Covered | Covered | Covered | Covered | `backend/tests/project-lifecycle-api.test.js`. |
| Live/preview smoke coverage | Partial | Missing | Partial | Missing | Needs Cypress smoke tests with real API and cleanup. |

## High-Risk Gaps To Close Next

1. Existing-project details save draft tests for team public and team private.
2. Later-step save draft tests that assert data is persisted, not only that the page navigates away.
3. Cypress save-draft parity tests for solo private, team public, and team private, matching `cypress/e2e/solo-public-save-draft.cy.ts`.
4. Backend integration tests with real Express routes plus test database schema/migration checks.
5. Live/preview smoke tests for login, save draft, activation subscription redirect, external join, and upload.

## Rule Going Forward

For every new wizard action, add tests in this order:

1. Component unit test for button wiring and validation.
2. Service/API contract test for payload and route.
3. Cypress smoke test for at least one representative UI path.
4. Backend integration/schema test if the action touches persistence.

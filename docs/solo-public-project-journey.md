# Solo Public Project Journey

## Purpose

A Solo Public Project lets one registered owner publish a document-collection project, share a
project code, accept a configured number of registered collaborators, collect the same required
documents from each collaborator, review every submission, and complete the project only after all
requirements are approved.

This document describes the implemented product journey, API behavior, permissions, state
transitions, upload architecture, errors, deployment requirements, and acceptance tests.

## Actors and permissions

### Project owner

The owner can:

- Create and edit the project draft.
- Define required documents, accepted formats, and size limits.
- Activate, cancel, restore, complete, duplicate, or permanently delete the project where the
  current project state permits it.
- See collaborators and all submissions.
- Download approved submissions individually or as a ZIP.
- Approve a document, request a revision, or decline it permanently.

The owner cannot upload or replace a document on behalf of another collaborator. Upload
authorization compares the authenticated email with the selected collaborator slot.

### Collaborator

A collaborator can:

- Join an active public project using its project code.
- See a joined project in their project list.
- Open their own authenticated submission workspace.
- Upload only to their own collaborator slot.
- See submission status and owner feedback.
- Replace a document only after a revision request.

A collaborator cannot edit, activate, cancel, complete, or delete the project and cannot review or
download another collaborator's private document.

### Support staff

Support staff is optional project contact information. Support staff can receive project
notifications but does not automatically receive owner permissions or a separate application role.

## Project states

| State           | Meaning                                                                          | Normal next states                        |
| --------------- | -------------------------------------------------------------------------------- | ----------------------------------------- |
| `draft`         | Owner is configuring the project. It cannot accept joins or submissions.         | `active`, `cancelled`                     |
| `active`        | Project code can be used and collaborators can submit before the deadline.       | `completed`, `not_completed`, `cancelled` |
| `not_completed` | The active deadline passed before completion. New submissions are blocked.       | `completed`, `cancelled`                  |
| `completed`     | All required submission slots were approved and the owner completed the project. | Terminal through the normal workflow      |
| `cancelled`     | Soft-deleted/cancelled project. It does not accept joins or submissions.         | `draft` when restored                     |

The general PATCH endpoint validates both the requested status value and its transition from the
current state. Arbitrary status strings and transitions such as `cancelled` directly to `active` are
rejected.

## Phase 1: Owner creates the project

1. The owner signs in.
2. The owner opens **Create Solo Project**.
3. The owner selects **Public Project**.
4. The public wizard opens at `/new-solo-project/public/details`.
5. The owner enters:
   - Project name.
   - Description.
   - Future deadline.
   - Expected collaborator count.
   - Optional attachments.
   - Optional support-staff details.
6. The owner saves a draft or continues.

The API creates the project with `type = public`, `status = draft`, and an authenticated owner ID. A
request cannot create a project for a different user ID. `expectedCollaborators` must be a positive
integer when supplied.

### Draft persistence

The owner can leave and reopen the draft. The route guard reloads stored project data after a
browser refresh and sends public and private projects through their appropriate wizard paths.

## Phase 2: Owner defines required documents

For every requirement, the owner configures:

- Document name.
- Accepted file formats, such as PDF or DOCX.
- Maximum size and unit.
- Optional template name or template attachment.

At least one required document must exist before activation. In a public project, every configured
document applies to every collaborator. Public projects do not need the per-collaborator assignment
map used by private projects.

The project type is immutable through the general PATCH endpoint. A public project cannot silently
be changed to private after creation, and vice versa.

## Phase 3: Owner reviews and activates

1. The decision page summarizes project details, collaborator count, deadline, documents,
   attachments, and support staff.
2. The owner selects **Activate Project**.
3. `PATCH /api/projects/:id/activate` requires:
   - A valid JWT.
   - Project ownership.
   - An active subscription.
   - A future deadline.
   - At least one required document.
4. The API changes the status to `active` and sets the completed wizard step.
5. A code shaped like `PRJ-XXXX-XXXX` is generated.
6. Activation is written to the activity log.
7. Activation notifications are sent to the owner and configured contacts.
8. The owner shares the code with prospective collaborators.

An authenticated non-owner receives `403 Forbidden` when attempting to activate, edit, cancel, or
delete the project.

## Phase 4: Collaborator joins

1. The collaborator registers or signs in.
2. The collaborator opens **Add External Project**.
3. The collaborator enters the project code.
4. The client calls `POST /api/teams/projects/join` with the code and current user ID.
5. The API verifies:
   - The JWT is valid.
   - The submitted user ID belongs to the authenticated user.
   - The project exists.
   - The project is public and `active`.
   - The collaborator has not joined by user ID or email.
   - The expected collaborator limit has not been reached.
6. The collaborator is appended to the project collaborator collection.
7. Capacity is checked again in the database update to reduce concurrent over-capacity joins.
8. The response includes the collaborator index and workspace path.
9. A join notification email is sent.
10. The UI navigates directly to `/collaborator-view/:projectId/:collabIndex`.

The joined project is then returned in that collaborator's Solo Projects list. Project list requests
are restricted to the authenticated user's own records.

### Join responses

| Condition                                           | Response          |
| --------------------------------------------------- | ----------------- |
| Successful join                                     | `201 Created`     |
| Missing code or user ID                             | `400 Bad Request` |
| Authenticated user does not match submitted user ID | `403 Forbidden`   |
| Invalid/inactive code                               | `404 Not Found`   |
| Duplicate join                                      | `409 Conflict`    |
| Expected collaborator capacity reached              | `409 Conflict`    |

## Phase 5: Collaborator opens the workspace

The workspace requires authentication.

1. The client loads `GET /api/projects/:projectId`.
2. The API returns the project only if the current user is its owner or a matching collaborator.
3. The client loads `GET /api/projects/:projectId/submissions?collabIndex=:collabIndex`.
4. The API verifies that the requester is the owner or the matching collaborator.
5. Every public-project document becomes a submission slot.
6. Existing submission state and feedback are merged into each slot.

The workspace displays the project name, owner, deadline, progress, required document names,
accepted formats, maximum sizes, selected files, submission status, and revision/rejection feedback.

An arbitrary authenticated user cannot read a draft or active project and receives `403 Forbidden`,
protecting collaborator and support-staff information.

## Phase 6: File selection and local validation

Before upload, the UI checks the selected file against the displayed requirement. The server remains
authoritative and independently validates:

- Collaborator index.
- Document index.
- Authenticated collaborator identity.
- Project status.
- Deadline.
- Public/private assignment rules.
- File size.
- MIME type or extension.
- Blob URL hostname and project/collaborator folder.

The owner can see the collaborator workspace as part of project management, but an owner email that
does not match that collaborator slot receives `403` when attempting to upload there.

## Phase 7: Secure production upload

Production uses a two-stage private Vercel Blob client upload so large files do not pass through the
API Function body limit.

### Step 1: Generate a client token

The Angular client calls:

`POST /api/projects/:projectId/submissions/upload-token`

The request is made through Angular `HttpClient`, so the normal authentication interceptor adds the
bearer token. Its body identifies the Blob token event, pathname, collaborator index, document
index, and multipart mode.

The backend verifies:

- `BLOB_READ_WRITE_TOKEN` is configured.
- The project exists and is accepting submissions.
- The deadline has not passed.
- The authenticated email matches the collaborator index.
- The Blob pathname belongs to `submissions/solo/:projectId/:collabIndex/`.
- The global MIME type is allowed.
- The global maximum is 50 MB.

The backend returns a short-lived client token.

### Step 2: Upload directly to private Blob

The browser passes the client token to `@vercel/blob` and uploads the file directly with
`access = private` and multipart support.

### Step 3: Record submission metadata

After Blob succeeds, the client calls:

`POST /api/projects/:projectId/submissions`

It sends the private Blob URL, original file name, size, MIME type, collaborator index, and document
index. The backend repeats the project/document/identity validation before inserting or updating the
submission row.

For a first upload, status becomes `submitted`. For a revision resubmission, the existing row is
replaced, previous feedback is cleared, the submission timestamp is refreshed, and status returns to
`submitted`.

The owner receives an activity entry and email notification.

### Local development upload

In non-production development, multipart form data is sent to the API and stored using the
configured local-storage path. Production does not silently fall back to ephemeral local disk when
Blob configuration is missing.

## Upload errors shown to the user

The UI obtains the token through Angular rather than allowing the Blob SDK to hide the backend
response. Upload failures are displayed using the application's error-toast pattern, with the actual
backend message, instead of an inline generic `Vercel Blob: Failed to retrieve the client token`
message.

| Condition                              | Expected response/message                              |
| -------------------------------------- | ------------------------------------------------------ |
| Missing/invalid authentication         | `401 Unauthorized`; user returns to sign-in            |
| User is not the selected collaborator  | `403` – not authorized to upload for this collaborator |
| Invalid collaborator or document index | `400 Bad Request`                                      |
| Project does not exist                 | `404 Not Found`                                        |
| Project inactive or deadline passed    | `409 Conflict`                                         |
| File exceeds configured limit          | `400 Bad Request`                                      |
| File format not allowed                | `400 Bad Request`                                      |
| Wrong Blob host or folder              | `400 Bad Request`                                      |
| Private Blob is not configured         | `503` – secure file storage temporarily unavailable    |
| Permanently rejected slot              | `409 Conflict`; resubmission is blocked                |

## Phase 8: Owner reviews submissions

1. The owner opens **Check Submissions**.
2. The owner selects the Solo tab and active project.
3. The UI loads all project submissions.
4. Database status `submitted` is displayed as **Pending**.
5. The owner opens a submission and securely downloads the document if necessary.

Submission review PATCH requests verify project ownership. A collaborator or unrelated authenticated
user cannot approve, revise, or reject a submission.

### Approve

1. Owner selects **Approve**.
2. Optional notes may be entered.
3. Status becomes `approved`.
4. The collaborator receives an approval email.
5. The slot contributes full completion progress.

### Request revision

1. Owner selects **Request Revision**.
2. Feedback is required.
3. Status becomes `revision`.
4. The collaborator receives feedback by email and sees it in the workspace.
5. The collaborator can upload a replacement.
6. Replacement status returns to `submitted` for another review.

### Decline permanently

1. Owner selects **Decline Permanently**.
2. Feedback is required.
3. Status becomes `rejected`.
4. The collaborator receives the final decision and sees the feedback.
5. The slot remains incomplete and cannot be resubmitted.

If a review request fails, the modal shows an error and remains available for retry.

## Phase 9: Secure owner downloads

The owner can download:

- One approved submission.
- The document displayed in the review modal.
- A ZIP containing all approved submissions.

Download endpoints resolve the authenticated owner ID and query by both project ID and owner ID.
Private Blob content is fetched by the backend and streamed to the owner; the private storage token
is never sent to the browser.

## Phase 10: Progress

For a public project:

`total required slots = joined collaborators × required documents`

- `approved` contributes full progress.
- `submitted` can contribute partial UI progress but is not complete.
- Missing, `revision`, and `rejected` slots remain incomplete.

The denominator does not depend on the private-project assignment map.

## Phase 11: Deadline reminders and expiry

The reminder job evaluates every required public document for every collaborator.

- Missing-document reminders are scheduled 7, 3, and 1 day before the deadline.
- Approved requirements are excluded from missing work.
- After the deadline, active projects are persisted as `not_completed`.
- `not_completed` projects do not accept new uploads.

## Phase 12: Completion

The owner selects **Mark Complete**. The server allows `status = completed` only when:

1. The configured number of collaborators has joined.
2. At least one required slot exists.
3. Every collaborator/document slot has a submission.
4. Every required submission is `approved`.

Missing, pending, revision-requested, or rejected documents return `409 Conflict` and block
completion. A successful project appears under Completed.

## Other owner operations

- **Save draft:** Preserve wizard state for later.
- **Cancel:** Soft-delete by changing status to `cancelled`.
- **Restore:** Return a cancelled project to `draft`.
- **Duplicate:** Create a separate draft from existing configuration.
- **Permanent delete:** Delete submissions first, then delete the project.

Every modifying endpoint is authenticated and owner-authorized.

## Deployment requirements

The backend Vercel project serving `api.docsndocs.com` must be connected to the private Blob store.

Required configuration:

- `BLOB_READ_WRITE_TOKEN` exists in the backend project's Production environment.
- The token belongs to the connected private store.
- The private store and backend project are in an authorized Vercel scope.
- Frontend and backend are redeployed after code or environment changes.
- CORS allows `https://www.docsndocs.com`, `Content-Type`, and `Authorization`.
- `APP_BASE_URL` points to the frontend for email workspace links.
- JWT, database, email, subscription, Stripe, and cron variables are configured.

Safe token validation from the linked backend directory:

```powershell
vercel env ls production
vercel env run -e production -- vercel blob list
```

The token value must never be printed, logged, committed, or sent to the browser.

## Known limitations and follow-up work

### Owner self-join prevention

The current join flow prevents duplicate collaborators and enforces capacity, but it does not yet
explicitly compare the joining user with the solo project owner. The owner could join their own
active public project and consume a collaborator slot. Add an owner-ID check before inserting a
collaborator. The same policy should be applied to team project owners/hosts.

### Positional collaborator identity

Solo submissions identify collaborators by the index of the collaborator in a JSON array. Removing
or reordering collaborators could associate historical submissions with the wrong person. Before
adding collaborator removal or reordering, migrate submissions to a stable collaborator ID.

### Production verification

Automated tests verify controllers and frontend behavior, but an authenticated production smoke test
is still required after deployment to confirm the production JWT, private store connection, token,
domain, and database work together.

## End-to-end acceptance test

### Owner setup

1. Register/sign in as Owner.
2. Create a public solo project with a future deadline, two expected collaborators, and two required
   documents.
3. Verify zero/negative/non-integer expected collaborator values are rejected.
4. Save the draft, refresh, and reopen it.
5. Verify an unrelated authenticated user cannot GET or PATCH the draft.
6. Activate without a subscription and verify the subscription requirement.
7. Activate after subscription and verify the generated project code.

### Join and capacity

8. Join as Collaborator A and verify workspace navigation and notification.
9. Verify a duplicate join returns `409`.
10. Join as Collaborator B.
11. Attempt Collaborator C and verify capacity returns `409`.
12. Until owner self-join prevention is implemented, record that case as a known failing security
    test.

### Upload

13. Open Collaborator A's workspace while authenticated.
14. Upload valid files for both requirements.
15. Verify the token request returns a client token and the Blob URL uses the private store.
16. Verify invalid type, oversize file, invalid collaborator index, invalid document index, wrong
    Blob folder, expired deadline, and inactive project are rejected with the documented messages.
17. Attempt upload as Owner or Collaborator B into Collaborator A's slot and verify `403`.

### Review

18. As Owner, open Check Submissions and securely download the files.
19. Approve one document.
20. Request revision on the other with required feedback.
21. As Collaborator A, verify both statuses and resubmit the revision.
22. Approve the replacement.
23. Permanently reject a separate test submission and verify it cannot be resubmitted.
24. Verify a collaborator cannot call the review PATCH endpoint.

### Completion

25. Attempt completion while Collaborator B's documents are missing and verify `409`.
26. Submit and approve every Collaborator B requirement.
27. Download the approved ZIP.
28. Complete the project and verify it appears under Completed.
29. Separately verify reminders at 7, 3, and 1 days.
30. Separately verify an overdue active project becomes `not_completed` and rejects uploads.

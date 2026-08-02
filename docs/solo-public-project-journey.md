# Solo Public Project Journey

This is the implemented end-to-end journey for a solo public project in DocsNDocs.

## 1. Host creates and activates the project

1. A registered host opens **Create Solo Project** and selects **Public Project**.
2. The host enters project details, a future deadline, the expected collaborator count, and optional support contact details.
3. The host configures at least one required document, including its allowed formats and maximum size.
4. The host reviews and activates the project. Activation requires an active subscription, a future deadline, and at least one document.
5. The backend changes the project to `active`, generates a `PRJ-XXXX-XXXX` code, logs activation, and sends activation emails.
6. The host shares the project code with collaborators.

Draft projects can be saved and reopened. The wizard guard reloads the stored draft on a browser refresh and routes public and private projects through their correct steps.

## 2. Collaborator joins

1. A registered, signed-in collaborator opens **Add External Project** and enters the code.
2. The join API verifies that the project is active and public, prevents duplicate membership, and enforces the expected collaborator limit.
3. The collaborator is appended to the project and receives a stable workspace path for their current collaborator index.
4. A join notification email is sent, and the UI navigates directly to `/collaborator-view/:projectId/:collabIndex`.
5. Joined projects appear in the collaborator's Solo Projects list.

The collaborator route and APIs require authentication. The API verifies that the current user is either the owner or the matching project collaborator.

## 3. Collaborator uploads required documents

For public projects, every configured document is required from every collaborator.

1. The workspace loads the project and the collaborator's existing submissions.
2. The collaborator selects a required file.
3. The browser requests an authenticated upload token. The API verifies the project state, deadline, collaborator identity, upload path, global size limit, and MIME type.
4. In production, the browser uploads to private Vercel Blob storage. Local development uses local upload storage.
5. The submission API verifies the collaborator index, document index, project status, deadline, per-document size and format rules, and Blob folder ownership.
6. A valid submission becomes `submitted`; a revision resubmission replaces the prior file and clears feedback.
7. The host receives an activity entry and notification email.

Files cannot be uploaded after the deadline or to cancelled, completed, or not-completed projects. A permanently rejected document cannot be resubmitted.

## 4. Owner reviews each submission

The owner opens **Check Submissions**, chooses the Solo tab and project, and reviews submitted files. Owner authorization is enforced by the API.

The owner has three decisions:

- **Approve:** sets `approved`; notes are optional. The collaborator is notified and no further action is needed.
- **Request Revision:** requires feedback and sets `revision`. The collaborator sees the feedback and may upload a replacement, which returns to `submitted`.
- **Decline Permanently:** requires feedback and sets `rejected`. The collaborator sees the final decision and cannot resubmit that requirement.

Failed review requests display an error in the modal so the owner can retry. The owner can securely download an individual approved document or a ZIP containing all approved documents. Download endpoints verify project ownership and proxy private files rather than exposing storage URLs.

## 5. Progress, reminders, and completion

Public progress uses this denominator:

`joined collaborators × required documents`

Approved files contribute full progress, submitted files contribute partial progress, and missing, revision, or rejected files are incomplete.

The reminder job checks every public document for every collaborator and sends missing-document reminders 7, 3, and 1 day before the deadline. After a deadline passes, active solo and team projects are persisted as `not_completed`.

The host can mark a public project `completed` only when:

1. The configured number of collaborators has joined.
2. Every required collaborator/document slot has a submission.
3. Every required submission is `approved`.

The API returns `409` with a useful message when missing, submitted, revision, or rejected documents still block completion.

## 6. Other host actions

- Save and reopen a draft.
- Cancel a project (soft delete).
- Restore a cancelled project to draft.
- Duplicate a project into a new draft.
- Permanently delete a project and its submissions.

All project read/update/cancel/delete operations verify owner or collaborator access as appropriate.

## Deployment requirement

Production direct upload and private download require a valid `BLOB_READ_WRITE_TOKEN` for a private Vercel Blob store on the deployed API.

## Remaining architectural note

Solo submissions still identify a collaborator by their position in the project's JSON collaborator array. The current UI does not reorder collaborators, but a future collaborator-removal feature should first migrate this relationship to a stable collaborator ID so historical submissions cannot be reassociated.

## Acceptance test

1. Create a public project with two collaborators, two required documents, and a future deadline.
2. Verify a draft survives refresh, then activate it and copy its project code.
3. Join as Collaborator A; verify the project is visible, the join email is sent, and navigation opens the correct workspace.
4. Upload valid documents; also verify invalid index, format, oversize, wrong Blob path, and unauthenticated uploads are rejected.
5. As owner, download and approve one file, request revision on the other, and verify feedback and resubmission.
6. Permanently decline a test submission and verify resubmission is disabled.
7. Verify completion is blocked while collaborators or approvals are missing.
8. Join and complete submissions as Collaborator B; approve every required file.
9. Download the approved ZIP, complete the project, and verify it appears under Completed.
10. Separately verify reminders at 7, 3, and 1 days and automatic `not_completed` persistence after expiry.

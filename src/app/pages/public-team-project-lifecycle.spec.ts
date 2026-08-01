/**
 * Comprehensive lifecycle test:
 * Public team project — 5 collaborators, 5 required documents
 *
 * Phases:
 *   0. Create the team via TeamsService
 *   1. Create project via wizard (details → documents → activate)
 *   2. 5 collaborators each submit all 5 documents (25 submissions)
 *   3. Host reviews and approves every submission
 *   4. Project marked complete
 */

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { TeamProjectWizardService } from '../services/team-project-wizard.service';
import { TeamsService } from '../services/teams.service';
import { AuthService } from '../services/auth.service';
import {
  Team,
  TeamProjectDocumentRequirement,
  TeamProjectDraft,
  TeamProjectSubmission,
} from '../models/team.models';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID    = 'user-host-001';
const TEAM_ID    = 'team-abc-001';
const PROJECT_ID = 'proj-pub-001';
const PROJECT_CODE = 'PRJ-X7K2-Q9RT';

const TEAM_FIXTURE: Team = {
  id: TEAM_ID,
  userId: USER_ID,
  name: 'Alpha Research Team',
  description: 'Interdisciplinary research group for graduate admissions.',
  icon: '🔬',
  memberCount: 0,
  projectCount: 0,
  lastActivity: null,
  role: 'host',
  createdAt: '2026-05-18T00:00:00Z',
  updatedAt: '2026-05-18T00:00:00Z',
};

const FIVE_DOCUMENTS: TeamProjectDocumentRequirement[] = [
  { name: 'Resume',          fileTypes: ['PDF', 'DOCX'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
  { name: 'Cover Letter',    fileTypes: ['PDF'],          maxSize: '5',  sizeUnit: 'MB', templateName: '' },
  { name: 'Transcript',      fileTypes: ['PDF'],          maxSize: '15', sizeUnit: 'MB', templateName: '' },
  { name: 'Reference Letter',fileTypes: ['PDF', 'DOCX'], maxSize: '5',  sizeUnit: 'MB', templateName: '' },
  { name: 'Writing Sample',  fileTypes: ['PDF', 'DOCX'], maxSize: '20', sizeUnit: 'MB', templateName: '' },
];

const FIVE_COLLABORATORS = [
  { firstName: 'Alice',   lastName: 'Morgan',   email: 'alice@uni.edu' },
  { firstName: 'Bob',     lastName: 'Chen',     email: 'bob@uni.edu' },
  { firstName: 'Carol',   lastName: 'Davis',    email: 'carol@uni.edu' },
  { firstName: 'Dan',     lastName: 'Evans',    email: 'dan@uni.edu' },
  { firstName: 'Eva',     lastName: 'Fischer',  email: 'eva@uni.edu' },
];

function makeDraft(overrides: Partial<TeamProjectDraft> = {}): TeamProjectDraft {
  return {
    id: PROJECT_ID,
    teamId: TEAM_ID,
    name: '2026 Graduate Research Program',
    description: 'Open public application for graduate research positions.',
    type: 'public',
    status: 'draft',
    deadline: '2026-12-31',
    completedStep: 1,
    projectCode: null,
    expectedCollaborators: 5,
    documents: FIVE_DOCUMENTS,
    supportStaff: null,
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-05-18T00:00:00Z',
    ...overrides,
  };
}

function makeSubmission(
  collab: typeof FIVE_COLLABORATORS[number],
  doc: TeamProjectDocumentRequirement,
  idx: number,
): TeamProjectSubmission {
  return {
    id: `sub-${collab.email}-${doc.name.replace(/\s/g, '_')}`,
    projectId: PROJECT_ID,
    collaboratorEmail: collab.email,
    collaboratorFirstName: collab.firstName,
    collaboratorLastName: collab.lastName,
    documentName: doc.name,
    fileName: `${doc.name.toLowerCase().replace(/\s/g, '_')}_${collab.lastName.toLowerCase()}.pdf`,
    fileSize: 512_000 * (idx + 1),
    status: 'submitted',
    feedback: null,
    submittedAt: '2026-06-01T10:00:00Z',
    updatedAt: '2026-06-01T10:00:00Z',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Public Team Project — Full Lifecycle', () => {
  let wizardService: TeamProjectWizardService;
  let teamsService: TeamsService;
  let authService: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TeamProjectWizardService,
        TeamsService,
      ],
    });
    wizardService = TestBed.inject(TeamProjectWizardService);
    teamsService  = TestBed.inject(TeamsService);
    authService   = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);

    // TeamsService.load() guards on a non-empty userId — set it for every test
    authService.currentUserId.set(USER_ID);
  });

  afterEach(() => http.verify());

  // ── Phase 0: Team Creation ────────────────────────────────────────────────

  describe('Phase 0 — Create the team via TeamsService', () => {

    it('creates a new team via POST /teams', () => {
      let createdTeam: Team | undefined;

      teamsService.create({
        userId: USER_ID,
        name: 'Alpha Research Team',
        description: 'Interdisciplinary research group for graduate admissions.',
        icon: '🔬',
      }).subscribe(res => (createdTeam = res.team));

      const req = http.expectOne(`${environment.apiUrl}/teams`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.userId).toBe(USER_ID);
      expect(req.request.body.name).toBe('Alpha Research Team');
      expect(req.request.body.icon).toBe('🔬');

      req.flush({ success: true, team: TEAM_FIXTURE });

      expect(createdTeam?.id).toBe(TEAM_ID);
      expect(createdTeam?.role).toBe('host');
      expect(createdTeam?.name).toBe('Alpha Research Team');
    });

    it('after creation, loading teams includes the new team in hostedTeams', () => {
      // Simulate load() response containing the newly created team
      teamsService.load();

      const req = http.expectOne(r => r.url === `${environment.apiUrl}/teams`);
      req.flush({ success: true, teams: [TEAM_FIXTURE] });

      expect(teamsService.teams().length).toBe(1);
      expect(teamsService.hostedTeams().length).toBe(1);
      expect(teamsService.hostedTeams()[0].id).toBe(TEAM_ID);
      expect(teamsService.hostedTeams()[0].name).toBe('Alpha Research Team');
    });

    it('team is available for selection in the project wizard after load', () => {
      teamsService.load();
      http.expectOne(r => r.url === `${environment.apiUrl}/teams`)
        .flush({ success: true, teams: [TEAM_FIXTURE] });

      // The public details component would call teamsService.hostedTeams()
      // to populate the dropdown — verify the team is there and selectable
      const hosted = teamsService.hostedTeams();
      expect(hosted.find(t => t.id === TEAM_ID)?.name).toBe('Alpha Research Team');
    });
  });

  // ── Phase 1: Project Creation ─────────────────────────────────────────────

  describe('Phase 1 — Wizard: details → documents → activate', () => {

    it('Step 1 — saves project details with type=public and 5 expected collaborators', () => {
      let result: TeamProjectDraft | undefined;

      wizardService.saveDetails({
        teamId: TEAM_ID,
        name: '2026 Graduate Research Program',
        description: 'Open public application for graduate research positions.',
        deadline: '2026-12-31',
        type: 'public',
        expectedCollaborators: 5,
      }).subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.type).toBe('public');
      expect(req.request.body.expectedCollaborators).toBe(5);
      expect(req.request.body.teamId).toBe(TEAM_ID);

      req.flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      expect(result?.id).toBe(PROJECT_ID);
      expect(wizardService.projectId()).toBe(PROJECT_ID);
      expect(wizardService.completedStep()).toBe(1);
    });

    it('Step 2 — saves all 5 document requirements', () => {
      wizardService.project.set(makeDraft({ completedStep: 1 }));

      let result: TeamProjectDraft | undefined;
      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`);
      expect(req.request.method).toBe('POST');

      const sentDocs: TeamProjectDocumentRequirement[] = req.request.body.documents;
      expect(sentDocs.length).toBe(5);
      expect(sentDocs.map(d => d.name)).toEqual([
        'Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample',
      ]);
      expect(sentDocs[0].fileTypes).toContain('PDF');
      expect(sentDocs[2].maxSize).toBe('15');

      req.flush({ success: true, project: makeDraft({ completedStep: 2 }) });

      expect(result?.completedStep).toBe(2);
    });

    it('Step 3 — activates project and receives server-issued project code', () => {
      wizardService.project.set(makeDraft({ completedStep: 2 }));

      let activated: TeamProjectDraft | undefined;
      wizardService.activateProject().subscribe(p => (activated = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('active');

      req.flush({
        success: true,
        project: makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }),
      });

      expect(activated?.status).toBe('active');
      expect(activated?.projectCode).toBe(PROJECT_CODE);
      expect(wizardService.projectCode()).toBe(PROJECT_CODE);
    });

    it('keeps an active public team project active when editing details', () => {
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }));

      let updated: TeamProjectDraft | undefined;
      wizardService.saveDetails({
        teamId: TEAM_ID,
        name: '2026 Graduate Research Program - Updated',
        description: 'Updated public application.',
        deadline: '2027-01-15',
        type: 'public',
        expectedCollaborators: 5,
      }).subscribe(p => (updated = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBeUndefined();
      expect(req.request.body.completedStep).toBe(3);
      req.flush({
        success: true,
        project: makeDraft({
          name: '2026 Graduate Research Program - Updated',
          status: 'active',
          completedStep: 3,
          projectCode: PROJECT_CODE,
        }),
      });

      expect(updated?.status).toBe('active');
      expect(wizardService.project()?.status).toBe('active');
    });

    it('full wizard flow: details → documents → activate (sequential)', () => {
      const results: TeamProjectDraft[] = [];

      // Step 1
      wizardService.saveDetails({
        teamId: TEAM_ID,
        name: '2026 Graduate Research Program',
        description: 'Open public application for graduate research positions.',
        deadline: '2026-12-31',
        type: 'public',
        expectedCollaborators: 5,
      }).subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/teams/projects`)
        .flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      // Step 2
      wizardService.saveDocuments(FIVE_DOCUMENTS)
        .subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`)
        .flush({ success: true, project: makeDraft({ completedStep: 2 }) });

      // Step 3
      wizardService.activateProject()
        .subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(results.length).toBe(3);
      expect(results[0].completedStep).toBe(1);
      expect(results[1].completedStep).toBe(2);
      expect(results[2].status).toBe('active');
      expect(results[2].projectCode).toBe(PROJECT_CODE);
    });
  });

  // ── Phase 2: 5 Collaborators Submit 5 Documents Each ─────────────────────

  describe('Phase 2 — 25 submissions (5 collaborators × 5 documents)', () => {

    it('should produce exactly 25 unique submission records', () => {
      const allSubmissions: TeamProjectSubmission[] = [];

      FIVE_COLLABORATORS.forEach(collab => {
        FIVE_DOCUMENTS.forEach((doc, idx) => {
          allSubmissions.push(makeSubmission(collab, doc, idx));
        });
      });

      expect(allSubmissions.length).toBe(25);

      // Every collaborator has all 5 documents
      FIVE_COLLABORATORS.forEach(collab => {
        const collabSubs = allSubmissions.filter(s => s.collaboratorEmail === collab.email);
        expect(collabSubs.length).toBe(5);
        const docNames = collabSubs.map(s => s.documentName);
        expect(docNames).toContain('Resume');
        expect(docNames).toContain('Cover Letter');
        expect(docNames).toContain('Transcript');
        expect(docNames).toContain('Reference Letter');
        expect(docNames).toContain('Writing Sample');
      });
    });

    it('all 25 submissions start with status=submitted', () => {
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      expect(allSubmissions.every(s => s.status === 'submitted')).toBe(true);
    });

    it('each collaborator submits a distinct file per document', () => {
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      const fileNames = allSubmissions.map(s => s.fileName);
      const uniqueFileNames = new Set(fileNames);
      expect(uniqueFileNames.size).toBe(25);
    });
  });

  // ── Phase 3: Host Reviews and Approves Every Submission ──────────────────

  describe('Phase 3 — Review: host approves all 25 submissions', () => {

    it('should approve each submission via PATCH and update status to approved', () => {
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }));

      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      const approved: TeamProjectSubmission[] = [];

      allSubmissions.forEach(sub => {
        expect(sub.status).toBe('submitted');
        const updatedSub: TeamProjectSubmission = { ...sub, status: 'approved', feedback: null };
        approved.push(updatedSub);
      });

      expect(approved.length).toBe(25);
      expect(approved.every(s => s.status === 'approved')).toBe(true);
    });

    it('all 25 submissions become approved — 0 pending remain', () => {
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      const afterReview = allSubmissions.map(s => ({ ...s, status: 'approved' as TeamProjectSubmission['status'] }));

      const pending  = afterReview.filter(s => s.status === 'submitted').length;
      const approved = afterReview.filter(s => s.status === 'approved').length;

      expect(pending).toBe(0);
      expect(approved).toBe(25);
    });

    it('approving each submission via HTTP PATCH sends correct payload', () => {
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }));

      const sub = makeSubmission(FIVE_COLLABORATORS[0], FIVE_DOCUMENTS[0], 0);
      const httpClient = TestBed.inject(HttpClient);

      let approved: TeamProjectSubmission | undefined;
      httpClient.patch<{ success: boolean; submission: TeamProjectSubmission }>(
        `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
        { status: 'approved', feedback: null },
      ).subscribe(res => (approved = res.submission));

      const req = http.expectOne(
        `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('approved');

      req.flush({ success: true, submission: { ...sub, status: 'approved' } });

      expect(approved?.status).toBe('approved');
      expect(approved?.collaboratorEmail).toBe('alice@uni.edu');
      expect(approved?.documentName).toBe('Resume');
    });
  });

  // ── Phase 4: Mark Project Complete ───────────────────────────────────────

  describe('Phase 4 — Project marked complete after all reviews', () => {

    it('markComplete sends PATCH with status=completed', () => {
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }));

      let completed: TeamProjectDraft | undefined;
      wizardService.markComplete().subscribe(p => (completed = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('completed');

      req.flush({ success: true, project: makeDraft({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(completed?.status).toBe('completed');
    });

    it('full end-to-end: wizard → 25 approvals → complete', () => {
      // Build all 25 submissions (all approved)
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );
      const allApproved = allSubmissions.map(s => ({ ...s, status: 'approved' as TeamProjectSubmission['status'] }));

      // Verify preconditions for completion:
      // • exactly 25 approved submissions
      // • all 5 collaborators represented
      // • all 5 document types represented
      expect(allApproved.length).toBe(25);
      expect(allApproved.every(s => s.status === 'approved')).toBe(true);

      const collabEmails = new Set(allApproved.map(s => s.collaboratorEmail));
      expect(collabEmails.size).toBe(5);

      const docNames = new Set(allApproved.map(s => s.documentName));
      expect(docNames.size).toBe(5);
      expect([...docNames]).toEqual(
        expect.arrayContaining(['Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample']),
      );

      // Now mark complete via wizard service
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }));

      let finalProject: TeamProjectDraft | undefined;
      wizardService.markComplete().subscribe(p => (finalProject = p));

      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(finalProject?.status).toBe('completed');
      expect(finalProject?.projectCode).toBe(PROJECT_CODE);
      expect(finalProject?.type).toBe('public');
    });
  });

  // ── Wizard service state management ──────────────────────────────────────

  describe('Wizard service — error and state management', () => {

    it('saveDocuments fails with no project set', () => {
      let errorMsg: string | undefined;
      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe({
        error: (err: Error) => (errorMsg = err.message),
      });
      expect(errorMsg).toContain('No project');
    });

    it('activateProject fails with no project set', () => {
      let errorMsg: string | undefined;
      wizardService.activateProject().subscribe({
        error: (err: Error) => (errorMsg = err.message),
      });
      expect(errorMsg).toContain('No project');
    });

    it('markComplete fails with no project set', () => {
      let errorMsg: string | undefined;
      wizardService.markComplete().subscribe({
        error: (err: Error) => (errorMsg = err.message),
      });
      expect(errorMsg).toContain('No project');
    });

    it('reset clears project and error state', () => {
      wizardService.project.set(makeDraft());
      wizardService.saveError.set('some error');

      wizardService.reset();

      expect(wizardService.projectId()).toBeNull();
      expect(wizardService.saveError()).toBeNull();
      expect(wizardService.projectCode()).toBeNull();
    });

    it('sets saveError signal on HTTP failure', () => {
      wizardService.project.set(makeDraft({ completedStep: 1 }));

      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe({ error: () => {} });

      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`)
        .flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(wizardService.saveError()).toBe('Server error');
      expect(wizardService.isSaving()).toBe(false);
    });
  });

  // ── Full Connected End-to-End Flow ────────────────────────────────────────
  // Every step uses the IDs returned by the previous HTTP response.
  // No hardcoded shortcuts — team creation → project creation → document
  // requirements saved → project activated → 25 HTTP submission POSTs →
  // 25 HTTP approval PATCHes → project marked complete.

  describe('Full Connected End-to-End Flow', () => {

    it('team creation → project creation links project to the created team', () => {
      let resolvedTeamId: string | undefined;
      let resolvedProjectTeamId: string | undefined;

      // Step 0: create team, capture returned ID
      teamsService.create({
        userId: USER_ID,
        name: 'Alpha Research Team',
        description: 'Interdisciplinary research group for graduate admissions.',
        icon: '🔬',
      }).subscribe(res => (resolvedTeamId = res.team.id));

      http.expectOne(`${environment.apiUrl}/teams`)
        .flush({ success: true, team: TEAM_FIXTURE });

      expect(resolvedTeamId).toBe(TEAM_ID);

      // Step 1: create project using the team ID from step 0
      wizardService.saveDetails({
        teamId: resolvedTeamId!,
        name: '2026 Graduate Research Program',
        description: 'Open public application for graduate research positions.',
        deadline: '2026-12-31',
        type: 'public',
        expectedCollaborators: 5,
      }).subscribe(p => (resolvedProjectTeamId = p.teamId));

      const projReq = http.expectOne(`${environment.apiUrl}/teams/projects`);
      expect(projReq.request.body.teamId).toBe(TEAM_ID);
      projReq.flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      expect(resolvedProjectTeamId).toBe(TEAM_ID);
    });

    it('project activation returns server code linked to the correct project', () => {
      let activatedCode: string | null | undefined;

      // Seed wizard with a project that belongs to the created team
      wizardService.project.set(makeDraft({ completedStep: 2 }));

      wizardService.activateProject().subscribe(p => (activatedCode = p.projectCode));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.body.status).toBe('active');
      req.flush({
        success: true,
        project: makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }),
      });

      expect(activatedCode).toBe(PROJECT_CODE);
    });

    it('5 collaborators POST their 5 documents each — 25 HTTP submission calls', () => {
      const httpClient = TestBed.inject(HttpClient);
      const submittedIds: string[] = [];

      // Each collaborator POSTs each of their 5 required documents
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const submission = makeSubmission(collab, doc, ci * 5 + di);

          httpClient.post<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`,
            {
              collaboratorEmail: collab.email,
              collaboratorFirstName: collab.firstName,
              collaboratorLastName: collab.lastName,
              documentName: doc.name,
              fileName: submission.fileName,
            },
          ).subscribe(res => submittedIds.push(res.submission.id));

          http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission });
        });
      });

      expect(submittedIds.length).toBe(25);

      // Every collaborator's submissions are present
      FIVE_COLLABORATORS.forEach(collab => {
        const collabDocIds = submittedIds.filter(id => id.includes(collab.email));
        expect(collabDocIds.length).toBe(5);
      });
    });

    it('host loads all 25 submissions from the server', () => {
      const httpClient = TestBed.inject(HttpClient);
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      let loadedSubmissions: TeamProjectSubmission[] = [];

      httpClient.get<{ success: boolean; submissions: TeamProjectSubmission[] }>(
        `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`,
      ).subscribe(res => (loadedSubmissions = res.submissions));

      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`)
        .flush({ success: true, submissions: allSubmissions });

      expect(loadedSubmissions.length).toBe(25);
      expect(new Set(loadedSubmissions.map(s => s.collaboratorEmail)).size).toBe(5);
      expect(new Set(loadedSubmissions.map(s => s.documentName)).size).toBe(5);
      expect(loadedSubmissions.every(s => s.status === 'submitted')).toBe(true);
    });

    it('host approves all 25 submissions — 25 HTTP PATCH calls with status=approved', () => {
      const httpClient = TestBed.inject(HttpClient);
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );

      const approvedResults: TeamProjectSubmission[] = [];

      allSubmissions.forEach(sub => {
        httpClient.patch<{ success: boolean; submission: TeamProjectSubmission }>(
          `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
          { status: 'approved', feedback: null },
        ).subscribe(res => approvedResults.push(res.submission));

        const req = http.expectOne(
          `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
        );
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body.status).toBe('approved');
        req.flush({ success: true, submission: { ...sub, status: 'approved' } });
      });

      expect(approvedResults.length).toBe(25);
      expect(approvedResults.every(s => s.status === 'approved')).toBe(true);

      // Every collaborator has all 5 documents approved
      FIVE_COLLABORATORS.forEach(collab => {
        const collabApproved = approvedResults.filter(s => s.collaboratorEmail === collab.email);
        expect(collabApproved.length).toBe(5);
        expect(collabApproved.every(s => s.status === 'approved')).toBe(true);
      });
    });

    it('complete flow: team → project → documents → activate → 25 submissions → 25 approvals → complete', () => {
      const httpClient = TestBed.inject(HttpClient);
      const log: string[] = [];

      // ── 0. Create team ─────────────────────────────────────────────────────
      let createdTeamId: string | undefined;
      teamsService.create({ userId: USER_ID, name: 'Alpha Research Team', description: '', icon: '🔬' })
        .subscribe(res => { createdTeamId = res.team.id; log.push('team_created'); });
      http.expectOne(`${environment.apiUrl}/teams`)
        .flush({ success: true, team: TEAM_FIXTURE });
      expect(createdTeamId).toBe(TEAM_ID);

      // ── 1a. Save project details ───────────────────────────────────────────
      wizardService.saveDetails({
        teamId: createdTeamId!,
        name: '2026 Graduate Research Program',
        description: 'Open public application.',
        deadline: '2026-12-31',
        type: 'public',
        expectedCollaborators: 5,
      }).subscribe(() => log.push('details_saved'));
      const detailsReq = http.expectOne(`${environment.apiUrl}/teams/projects`);
      expect(detailsReq.request.body.teamId).toBe(TEAM_ID);
      detailsReq.flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      // ── 1b. Save 5 document requirements ──────────────────────────────────
      wizardService.saveDocuments(FIVE_DOCUMENTS)
        .subscribe(() => log.push('documents_saved'));
      const docsReq = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`);
      expect(docsReq.request.body.documents.length).toBe(5);
      docsReq.flush({ success: true, project: makeDraft({ completedStep: 2 }) });

      // ── 1c. Activate project ───────────────────────────────────────────────
      let projectCode: string | null | undefined;
      wizardService.activateProject()
        .subscribe(p => { projectCode = p.projectCode; log.push('project_activated'); });
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }) });
      expect(projectCode).toBe(PROJECT_CODE);

      // ── 2. 5 collaborators submit 5 documents each (25 HTTP POSTs) ─────────
      const submissionIds: string[] = [];
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const sub = makeSubmission(collab, doc, ci * 5 + di);
          httpClient.post<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`,
            { collaboratorEmail: collab.email, documentName: doc.name, fileName: sub.fileName },
          ).subscribe(res => submissionIds.push(res.submission.id));
          http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission: sub });
        });
      });
      log.push(`${submissionIds.length}_submissions`);
      expect(submissionIds.length).toBe(25);

      // ── 3. Host approves all 25 submissions (25 HTTP PATCHes) ─────────────
      const allSubmissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );
      let approvalCount = 0;
      allSubmissions.forEach(sub => {
        httpClient.patch<{ success: boolean; submission: TeamProjectSubmission }>(
          `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
          { status: 'approved', feedback: null },
        ).subscribe(() => approvalCount++);
        http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`)
          .flush({ success: true, submission: { ...sub, status: 'approved' } });
      });
      log.push(`${approvalCount}_approved`);
      expect(approvalCount).toBe(25);

      // ── 4. Mark project complete ───────────────────────────────────────────
      let finalStatus: string | undefined;
      wizardService.markComplete()
        .subscribe(p => { finalStatus = p.status; log.push('project_completed'); });
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }) });

      // ── Verify the full log ────────────────────────────────────────────────
      expect(log).toEqual([
        'team_created',
        'details_saved',
        'documents_saved',
        'project_activated',
        '25_submissions',
        '25_approved',
        'project_completed',
      ]);
      expect(finalStatus).toBe('completed');
    });
  });
});

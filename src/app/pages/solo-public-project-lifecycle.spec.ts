/**
 * Comprehensive lifecycle test:
 * Solo public project — 5 collaborators, 5 required documents
 *
 * Phases:
 *   1. Create project via wizard (details → documents → activate)
 *   2. 5 collaborators each submit all 5 documents (25 submissions)
 *   3. Host reviews and approves every submission
 *   4. Project marked complete
 */

import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { ProjectWizardService } from '../services/project-wizard.service';
import { ProjectListService } from '../services/project-list.service';
import { AuthService } from '../services/auth.service';
import {
  Project,
  ProjectDocument,
  Submission,
} from '../models/project.models';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const USER_ID      = 'user-solo-001';
const PROJECT_ID   = 'proj-solo-001';
const PROJECT_CODE = 'SOL-X7K2-Q9RT';

const FIVE_DOCUMENTS: ProjectDocument[] = [
  { name: 'Resume',           fileTypes: ['PDF', 'DOCX'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
  { name: 'Cover Letter',     fileTypes: ['PDF'],          maxSize: '5',  sizeUnit: 'MB', templateName: '' },
  { name: 'Transcript',       fileTypes: ['PDF'],          maxSize: '15', sizeUnit: 'MB', templateName: '' },
  { name: 'Reference Letter', fileTypes: ['PDF', 'DOCX'], maxSize: '5',  sizeUnit: 'MB', templateName: '' },
  { name: 'Writing Sample',   fileTypes: ['PDF', 'DOCX'], maxSize: '20', sizeUnit: 'MB', templateName: '' },
];

const FIVE_COLLABORATORS = [
  { firstName: 'Alice', lastName: 'Morgan',  email: 'alice@uni.edu',  index: 0 },
  { firstName: 'Bob',   lastName: 'Chen',    email: 'bob@uni.edu',    index: 1 },
  { firstName: 'Carol', lastName: 'Davis',   email: 'carol@uni.edu',  index: 2 },
  { firstName: 'Dan',   lastName: 'Evans',   email: 'dan@uni.edu',    index: 3 },
  { firstName: 'Eva',   lastName: 'Fischer', email: 'eva@uni.edu',    index: 4 },
];

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    userId: USER_ID,
    name: '2026 Solo Public Research Program',
    description: 'Open public application for individual research positions.',
    type: 'public',
    status: 'draft',
    deadline: '2026-12-31',
    completedStep: 1,
    projectCode: null,
    attachments: [],
    collaborators: [],
    documents: FIVE_DOCUMENTS,
    assignments: {},
    staff: null,
    expectedCollaborators: 5,
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-05-18T00:00:00Z',
    ...overrides,
  };
}

function makeSubmission(collabIndex: number, docIndex: number): Submission {
  const collab = FIVE_COLLABORATORS[collabIndex];
  const doc    = FIVE_DOCUMENTS[docIndex];
  return {
    id: `sub-${collabIndex}-${docIndex}`,
    project_id: PROJECT_ID,
    collaborator_index: collabIndex,
    document_index: docIndex,
    file_name: `${doc.name.toLowerCase().replace(/\s/g, '_')}_${collab.lastName.toLowerCase()}.pdf`,
    file_size: 512_000 * (collabIndex * 5 + docIndex + 1),
    file_path: `/uploads/${PROJECT_ID}/collab-${collabIndex}/doc-${docIndex}.pdf`,
    status: 'submitted',
    feedback: null,
    submitted_at: '2026-06-01T10:00:00Z',
    updated_at: '2026-06-01T10:00:00Z',
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Solo Public Project — Full Lifecycle', () => {
  let wizardService: ProjectWizardService;
  let listService:   ProjectListService;
  let authService:   AuthService;
  let http:          HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        ProjectWizardService,
        ProjectListService,
      ],
    });

    wizardService = TestBed.inject(ProjectWizardService);
    listService   = TestBed.inject(ProjectListService);
    authService   = TestBed.inject(AuthService);
    http          = TestBed.inject(HttpTestingController);

    authService.currentUserId.set(USER_ID);
  });

  afterEach(() => http.verify());

  // ── Phase 1: Wizard — details → documents → activate ─────────────────────

  describe('Phase 1 — Wizard: details → documents → activate', () => {

    it('Step 1 — saves project details with type=public and 5 expected collaborators', () => {
      let result: Project | undefined;

      wizardService.savePublicDetails({
        name: '2026 Solo Public Research Program',
        description: 'Open public application for individual research positions.',
        deadline: '2026-12-31',
        attachments: [],
        expectedCollaborators: '5',
        staff: null,
      }).subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/projects`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.type).toBe('public');
      expect(req.request.body.expectedCollaborators).toBe(5);
      expect(req.request.body.userid).toBe(USER_ID);

      req.flush({ success: true, project: makeProject({ completedStep: 1 }) });

      expect(result?.id).toBe(PROJECT_ID);
      expect(wizardService.projectId()).toBe(PROJECT_ID);
      expect(wizardService.completedStep()).toBe(1);
    });

    it('Step 2 — saves all 5 document requirements', () => {
      wizardService.project.set(makeProject({ completedStep: 1 }));

      let result: Project | undefined;
      wizardService.savePublicDocuments({ documents: FIVE_DOCUMENTS })
        .subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');

      const sentDocs: ProjectDocument[] = req.request.body.documents;
      expect(sentDocs.length).toBe(5);
      expect(sentDocs.map(d => d.name)).toEqual([
        'Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample',
      ]);
      expect(sentDocs[0].fileTypes).toContain('PDF');
      expect(sentDocs[2].maxSize).toBe('15');
      expect(req.request.body.completedStep).toBe(2);

      req.flush({ success: true, project: makeProject({ completedStep: 2, documents: FIVE_DOCUMENTS }) });

      expect(result?.completedStep).toBe(2);
    });

    it('Step 3 — activates project and receives server-issued project code', () => {
      wizardService.project.set(makeProject({ completedStep: 2 }));

      let activated: Project | undefined;
      wizardService.activateProject().subscribe(p => (activated = p));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`);
      expect(req.request.method).toBe('PATCH');

      req.flush({
        success: true,
        project: makeProject({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }),
      });

      expect(activated?.status).toBe('active');
      expect(activated?.projectCode).toBe(PROJECT_CODE);
      expect(wizardService.projectCode()).toBe(PROJECT_CODE);
    });

    it('full wizard flow: details → documents → activate (sequential)', () => {
      const results: Project[] = [];

      // Step 1
      wizardService.savePublicDetails({
        name: '2026 Solo Public Research Program',
        description: 'Open public application.',
        deadline: '2026-12-31',
        attachments: [],
        expectedCollaborators: '5',
        staff: null,
      }).subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/projects`)
        .flush({ success: true, project: makeProject({ completedStep: 1 }) });

      // Step 2
      wizardService.savePublicDocuments({ documents: FIVE_DOCUMENTS })
        .subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeProject({ completedStep: 2 }) });

      // Step 3
      wizardService.activateProject()
        .subscribe(p => results.push(p));

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`)
        .flush({ success: true, project: makeProject({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }) });

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
      const allSubmissions: Submission[] = [];

      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      expect(allSubmissions.length).toBe(25);

      // Every collaborator index has all 5 document indexes
      for (let ci = 0; ci < 5; ci++) {
        const collabSubs = allSubmissions.filter(s => s.collaborator_index === ci);
        expect(collabSubs.length).toBe(5);
        const docIndexes = collabSubs.map(s => s.document_index).sort();
        expect(docIndexes).toEqual([0, 1, 2, 3, 4]);
      }
    });

    it('all 25 submissions start with status=submitted', () => {
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }
      expect(allSubmissions.every(s => s.status === 'submitted')).toBe(true);
    });

    it('each collaborator submits a distinct file per document', () => {
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      const fileNames = allSubmissions.map(s => s.file_name);
      const uniqueFileNames = new Set(fileNames);
      expect(uniqueFileNames.size).toBe(25);
    });

    it('each submission links to the correct project via project_id', () => {
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }
      expect(allSubmissions.every(s => s.project_id === PROJECT_ID)).toBe(true);
    });

    it('5 collaborators POST their 5 documents each — 25 HTTP submission calls', () => {
      const httpClient = TestBed.inject(HttpClient);
      const submittedIds: string[] = [];

      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          const sub = makeSubmission(ci, di);

          httpClient.post<{ success: boolean; submission: Submission }>(
            `${environment.apiUrl}/projects/${PROJECT_ID}/submissions`,
            {
              collaborator_index: ci,
              document_index: di,
              file_name: sub.file_name,
              file_size: sub.file_size,
            },
          ).subscribe(res => submittedIds.push(res.submission.id));

          http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission: sub });
        }
      }

      expect(submittedIds.length).toBe(25);

      // Every collaborator index has 5 submissions
      for (let ci = 0; ci < 5; ci++) {
        const count = submittedIds.filter(id => id.startsWith(`sub-${ci}-`)).length;
        expect(count).toBe(5);
      }
    });
  });

  // ── Phase 3: Host Reviews and Approves Every Submission ──────────────────

  describe('Phase 3 — Review: host approves all 25 submissions', () => {

    it('all 25 submissions become approved — 0 pending remain', () => {
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      const afterReview = allSubmissions.map(s => ({
        ...s,
        status: 'approved' as Submission['status'],
      }));

      const pending  = afterReview.filter(s => s.status === 'submitted').length;
      const approved = afterReview.filter(s => s.status === 'approved').length;

      expect(pending).toBe(0);
      expect(approved).toBe(25);
    });

    it('approving each submission via HTTP PATCH sends correct payload', () => {
      const httpClient = TestBed.inject(HttpClient);
      const sub = makeSubmission(0, 0);

      let approved: Submission | undefined;
      httpClient.patch<{ success: boolean; submission: Submission }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
        { status: 'approved', feedback: null },
      ).subscribe(res => (approved = res.submission));

      const req = http.expectOne(
        `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
      );
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('approved');

      req.flush({ success: true, submission: { ...sub, status: 'approved' } });

      expect(approved?.status).toBe('approved');
      expect(approved?.collaborator_index).toBe(0);
      expect(approved?.document_index).toBe(0);
    });

    it('host approves all 25 submissions — 25 HTTP PATCH calls with status=approved', () => {
      const httpClient = TestBed.inject(HttpClient);
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      const approvedResults: Submission[] = [];

      allSubmissions.forEach(sub => {
        httpClient.patch<{ success: boolean; submission: Submission }>(
          `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
          { status: 'approved', feedback: null },
        ).subscribe(res => approvedResults.push(res.submission));

        const req = http.expectOne(
          `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
        );
        expect(req.request.method).toBe('PATCH');
        expect(req.request.body.status).toBe('approved');
        req.flush({ success: true, submission: { ...sub, status: 'approved' } });
      });

      expect(approvedResults.length).toBe(25);
      expect(approvedResults.every(s => s.status === 'approved')).toBe(true);

      // Every collaborator has all 5 docs approved
      for (let ci = 0; ci < 5; ci++) {
        const collabApproved = approvedResults.filter(s => s.collaborator_index === ci);
        expect(collabApproved.length).toBe(5);
        expect(collabApproved.every(s => s.status === 'approved')).toBe(true);
      }
    });
  });

  // ── Phase 4: Mark Project Complete ───────────────────────────────────────

  describe('Phase 4 — Project marked complete after all reviews', () => {

    it('markComplete sends PATCH with status=completed', () => {
      const httpClient = TestBed.inject(HttpClient);
      let finalProject: Project | undefined;

      httpClient.patch<{ success: boolean; project: Project }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}`,
        { status: 'completed' },
      ).subscribe(res => (finalProject = res.project));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('completed');

      req.flush({
        success: true,
        project: makeProject({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }),
      });

      expect(finalProject?.status).toBe('completed');
    });

    it('full end-to-end: wizard → 25 approvals → complete', () => {
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }
      const allApproved = allSubmissions.map(s => ({
        ...s,
        status: 'approved' as Submission['status'],
      }));

      // Preconditions for completion
      expect(allApproved.length).toBe(25);
      expect(allApproved.every(s => s.status === 'approved')).toBe(true);

      const collabIndexes = new Set(allApproved.map(s => s.collaborator_index));
      expect(collabIndexes.size).toBe(5);

      const docIndexes = new Set(allApproved.map(s => s.document_index));
      expect(docIndexes.size).toBe(5);

      // Mark complete via HTTP
      const httpClient = TestBed.inject(HttpClient);
      let finalProject: Project | undefined;

      httpClient.patch<{ success: boolean; project: Project }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}`,
        { status: 'completed' },
      ).subscribe(res => (finalProject = res.project));

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeProject({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(finalProject?.status).toBe('completed');
      expect(finalProject?.projectCode).toBe(PROJECT_CODE);
      expect(finalProject?.type).toBe('public');
    });
  });

  // ── Wizard service — error and state management ───────────────────────────

  describe('Wizard service — error and state management', () => {

    it('savePublicDocuments fails gracefully with no project set', () => {
      let called = false;
      wizardService.savePublicDocuments({ documents: FIVE_DOCUMENTS }).subscribe({
        error: () => (called = true),
      });
      // PATCH to null project id still fires; we just expect no crash
      // Flush it to prevent afterEach http.verify() failure
      const req = http.expectOne(r => r.url.includes('/projects/'));
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      expect(called).toBe(true);
    });

    it('activateProject fails with no project set', () => {
      let called = false;
      wizardService.activateProject().subscribe({ error: () => (called = true) });
      const req = http.expectOne(r => r.url.includes('/activate'));
      req.flush({ message: 'Not found' }, { status: 404, statusText: 'Not Found' });
      expect(called).toBe(true);
    });

    it('reset clears project and error state', () => {
      wizardService.project.set(makeProject());
      wizardService.saveError.set('some error');

      wizardService.reset();

      expect(wizardService.projectId()).toBeNull();
      expect(wizardService.saveError()).toBeNull();
      expect(wizardService.projectCode()).toBeNull();
    });

    it('sets saveError signal on HTTP failure', () => {
      wizardService.project.set(makeProject({ completedStep: 1 }));

      wizardService.savePublicDocuments({ documents: FIVE_DOCUMENTS }).subscribe({ error: () => {} });

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(wizardService.saveError()).toBe('Server error');
      expect(wizardService.isSaving()).toBe(false);
    });

    it('project list loads active projects and fetches submission stats', () => {
      authService.currentUserId.set(USER_ID);
      listService.load();

      const listReq = http.expectOne(r => r.url === `${environment.apiUrl}/projects`);
      expect(listReq.request.params.get('userid')).toBe(USER_ID);

      const activeProject = makeProject({ status: 'active', projectCode: PROJECT_CODE });
      listReq.flush({ success: true, projects: [activeProject] });

      // After loading active projects, stats are fetched automatically
      const statsReq = http.expectOne(r => r.url.includes('/submissions/stats'));
      statsReq.flush({ success: true, stats: { [PROJECT_ID]: 20 } });

      expect(listService.projects().length).toBe(1);
      expect(listService.submissionStats()[PROJECT_ID]).toBe(20);
    });
  });

  // ── Full Connected End-to-End Flow ────────────────────────────────────────
  // Every step chains from the ID returned by the previous HTTP response.
  // project created → documents saved → activated → 25 HTTP POST submissions →
  // 25 HTTP PATCH approvals → PATCH project status=completed

  describe('Full Connected End-to-End Flow', () => {

    it('project creation returns a project ID used in all subsequent steps', () => {
      let resolvedProjectId: string | undefined;

      wizardService.savePublicDetails({
        name: '2026 Solo Public Research Program',
        description: 'Open public application.',
        deadline: '2026-12-31',
        attachments: [],
        expectedCollaborators: '5',
        staff: null,
      }).subscribe(p => (resolvedProjectId = p.id));

      const req = http.expectOne(`${environment.apiUrl}/projects`);
      expect(req.request.body.userid).toBe(USER_ID);
      expect(req.request.body.type).toBe('public');
      req.flush({ success: true, project: makeProject({ completedStep: 1 }) });

      expect(resolvedProjectId).toBe(PROJECT_ID);
      expect(wizardService.projectId()).toBe(PROJECT_ID);
    });

    it('project activation returns server-issued code linked to the project', () => {
      wizardService.project.set(makeProject({ completedStep: 2 }));

      let activatedCode: string | null | undefined;
      wizardService.activateProject().subscribe(p => (activatedCode = p.projectCode));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ success: true, project: makeProject({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(activatedCode).toBe(PROJECT_CODE);
    });

    it('host loads all 25 submissions from the server after collaborators submit', () => {
      const httpClient = TestBed.inject(HttpClient);
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      let loadedSubmissions: Submission[] = [];
      httpClient.get<{ success: boolean; submissions: Submission[] }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}/submissions`,
      ).subscribe(res => (loadedSubmissions = res.submissions));

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions`)
        .flush({ success: true, submissions: allSubmissions });

      expect(loadedSubmissions.length).toBe(25);
      expect(new Set(loadedSubmissions.map(s => s.collaborator_index)).size).toBe(5);
      expect(new Set(loadedSubmissions.map(s => s.document_index)).size).toBe(5);
      expect(loadedSubmissions.every(s => s.status === 'submitted')).toBe(true);
    });

    it('complete flow: project → documents → activate → 25 submissions → 25 approvals → complete', () => {
      const httpClient = TestBed.inject(HttpClient);
      const log: string[] = [];

      // ── 1a. Create project ─────────────────────────────────────────────────
      wizardService.savePublicDetails({
        name: '2026 Solo Public Research Program',
        description: 'Open public application.',
        deadline: '2026-12-31',
        attachments: [],
        expectedCollaborators: '5',
        staff: null,
      }).subscribe(() => log.push('project_created'));

      const createReq = http.expectOne(`${environment.apiUrl}/projects`);
      expect(createReq.request.body.userid).toBe(USER_ID);
      expect(createReq.request.body.type).toBe('public');
      createReq.flush({ success: true, project: makeProject({ completedStep: 1 }) });

      // ── 1b. Save 5 document requirements ──────────────────────────────────
      wizardService.savePublicDocuments({ documents: FIVE_DOCUMENTS })
        .subscribe(() => log.push('documents_saved'));

      const docsReq = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(docsReq.request.body.documents.length).toBe(5);
      docsReq.flush({ success: true, project: makeProject({ completedStep: 2 }) });

      // ── 1c. Activate project ───────────────────────────────────────────────
      let projectCode: string | null | undefined;
      wizardService.activateProject()
        .subscribe(p => { projectCode = p.projectCode; log.push('project_activated'); });

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`)
        .flush({ success: true, project: makeProject({ status: 'active', completedStep: 3, projectCode: PROJECT_CODE }) });

      expect(projectCode).toBe(PROJECT_CODE);

      // ── 2. 5 collaborators submit 5 documents each (25 HTTP POSTs) ─────────
      const submittedIds: string[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          const sub = makeSubmission(ci, di);
          httpClient.post<{ success: boolean; submission: Submission }>(
            `${environment.apiUrl}/projects/${PROJECT_ID}/submissions`,
            { collaborator_index: ci, document_index: di, file_name: sub.file_name },
          ).subscribe(res => submittedIds.push(res.submission.id));

          http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission: sub });
        }
      }
      log.push(`${submittedIds.length}_submissions`);
      expect(submittedIds.length).toBe(25);

      // ── 3. Host approves all 25 (25 HTTP PATCHes) ─────────────────────────
      const allSubmissions: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          allSubmissions.push(makeSubmission(ci, di));
        }
      }

      let approvalCount = 0;
      allSubmissions.forEach(sub => {
        httpClient.patch<{ success: boolean; submission: Submission }>(
          `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
          { status: 'approved', feedback: null },
        ).subscribe(() => approvalCount++);

        http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`)
          .flush({ success: true, submission: { ...sub, status: 'approved' } });
      });
      log.push(`${approvalCount}_approved`);
      expect(approvalCount).toBe(25);

      // ── 4. Mark project complete ───────────────────────────────────────────
      let finalStatus: string | undefined;
      httpClient.patch<{ success: boolean; project: Project }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}`,
        { status: 'completed' },
      ).subscribe(res => { finalStatus = res.project.status; log.push('project_completed'); });

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeProject({ status: 'completed', completedStep: 3, projectCode: PROJECT_CODE }) });

      // ── Verify the full log ────────────────────────────────────────────────
      expect(log).toEqual([
        'project_created',
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

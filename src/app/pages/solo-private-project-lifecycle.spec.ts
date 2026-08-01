import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { ProjectListService } from '../services/project-list.service';
import { ProjectWizardService } from '../services/project-wizard.service';
import { Project, ProjectAssignments, ProjectCollaborator, ProjectDocument, Submission } from '../models/project.models';

const USER_ID = 'user-solo-private-001';
const PROJECT_ID = 'proj-solo-private-001';

const FIVE_DOCUMENTS: ProjectDocument[] = [
  { name: 'Resume', fileTypes: ['PDF', 'DOCX'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
  { name: 'Cover Letter', fileTypes: ['PDF'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
  { name: 'Transcript', fileTypes: ['PDF'], maxSize: '15', sizeUnit: 'MB', templateName: '' },
  { name: 'Reference Letter', fileTypes: ['PDF', 'DOCX'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
  { name: 'Writing Sample', fileTypes: ['PDF', 'DOCX'], maxSize: '20', sizeUnit: 'MB', templateName: '' },
];

const FIVE_COLLABORATORS: ProjectCollaborator[] = [
  { firstName: 'Alice', lastName: 'Morgan', email: 'alice@uni.edu', affiliation: 'University' },
  { firstName: 'Bob', lastName: 'Chen', email: 'bob@uni.edu', affiliation: 'University' },
  { firstName: 'Carol', lastName: 'Davis', email: 'carol@uni.edu', affiliation: 'University' },
  { firstName: 'Dan', lastName: 'Evans', email: 'dan@uni.edu', affiliation: 'University' },
  { firstName: 'Eva', lastName: 'Fischer', email: 'eva@uni.edu', affiliation: 'University' },
];

const ALL_DOCS_ASSIGNED: ProjectAssignments = {
  0: [0, 1, 2, 3, 4],
  1: [0, 1, 2, 3, 4],
  2: [0, 1, 2, 3, 4],
  3: [0, 1, 2, 3, 4],
  4: [0, 1, 2, 3, 4],
};

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: PROJECT_ID,
    userId: USER_ID,
    name: '2026 Solo Private Research Program',
    description: 'Private application for invited collaborators.',
    type: 'private',
    status: 'draft',
    deadline: '2026-12-31',
    completedStep: 1,
    projectCode: null,
    attachments: [],
    collaborators: FIVE_COLLABORATORS,
    documents: FIVE_DOCUMENTS,
    assignments: ALL_DOCS_ASSIGNED,
    staff: { firstName: 'Support', lastName: 'Staff', email: 'support@example.com', affiliation: 'DocsNDocs' },
    expectedCollaborators: null,
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-05-18T00:00:00Z',
    ...overrides,
  };
}

function makeSubmission(collabIndex: number, docIndex: number): Submission {
  const collab = FIVE_COLLABORATORS[collabIndex];
  const doc = FIVE_DOCUMENTS[docIndex];
  return {
    id: `solo-private-sub-${collabIndex}-${docIndex}`,
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

describe('Solo Private Project - Full Lifecycle', () => {
  let wizardService: ProjectWizardService;
  let listService: ProjectListService;
  let authService: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ProjectWizardService, ProjectListService],
    });
    wizardService = TestBed.inject(ProjectWizardService);
    listService = TestBed.inject(ProjectListService);
    authService = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    authService.currentUserId.set(USER_ID);
  });

  afterEach(() => http.verify());

  describe('Phase 1 - Wizard: details -> collaborators -> documents -> assignments -> staff -> activate', () => {
    it('Step 1 saves private project details', () => {
      let result: Project | undefined;
      wizardService.saveDetails({
        name: '2026 Solo Private Research Program',
        description: 'Private application for invited collaborators.',
        deadline: '2026-12-31',
        attachments: [],
      }).subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/projects`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.type).toBe('private');
      expect(req.request.body.userid).toBe(USER_ID);
      req.flush({ success: true, project: makeProject({ completedStep: 1 }) });

      expect(result?.id).toBe(PROJECT_ID);
      expect(wizardService.completedStep()).toBe(1);
    });

    it('Step 2 saves 5 invited collaborators', () => {
      wizardService.project.set(makeProject({ completedStep: 1, collaborators: [] }));
      wizardService.saveCollaborators({ collaborators: FIVE_COLLABORATORS }).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.collaborators.length).toBe(5);
      expect(req.request.body.completedStep).toBe(2);
      req.flush({ success: true, project: makeProject({ completedStep: 2 }) });

      expect(wizardService.project()?.collaborators.length).toBe(5);
    });

    it('Step 3 saves all 5 document requirements', () => {
      wizardService.project.set(makeProject({ completedStep: 2 }));
      wizardService.saveDocuments({ documents: FIVE_DOCUMENTS }).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.body.documents.map((d: ProjectDocument) => d.name)).toEqual([
        'Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample',
      ]);
      expect(req.request.body.completedStep).toBe(3);
      req.flush({ success: true, project: makeProject({ completedStep: 3 }) });
    });

    it('Step 4 assigns all 5 documents to each of 5 collaborators', () => {
      wizardService.project.set(makeProject({ completedStep: 3 }));
      wizardService.saveAssignments({ assignments: ALL_DOCS_ASSIGNED }).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.body.assignments).toEqual(ALL_DOCS_ASSIGNED);
      expect(req.request.body.completedStep).toBe(4);
      req.flush({ success: true, project: makeProject({ completedStep: 4 }) });
    });

    it('Step 5 saves support staff', () => {
      wizardService.project.set(makeProject({ completedStep: 4 }));
      wizardService.saveStaff({ staff: makeProject().staff }).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.body.staff.email).toBe('support@example.com');
      expect(req.request.body.completedStep).toBe(5);
      req.flush({ success: true, project: makeProject({ completedStep: 5 }) });
    });

    it('Step 6 activates the private project without a public code', () => {
      wizardService.project.set(makeProject({ completedStep: 5 }));
      let activated: Project | undefined;
      wizardService.activateProject().subscribe(p => (activated = p));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`);
      expect(req.request.method).toBe('PATCH');
      req.flush({ success: true, project: makeProject({ status: 'active', completedStep: 6, projectCode: null }) });

      expect(activated?.status).toBe('active');
      expect(activated?.projectCode).toBeNull();
    });

    it('keeps an active private project active when editing details', () => {
      wizardService.project.set(makeProject({ status: 'active', completedStep: 6, projectCode: null }));

      let updated: Project | undefined;
      wizardService.saveDetails({
        name: 'Updated Solo Private Research Program',
        description: 'Updated private project details.',
        deadline: '2027-01-15',
        attachments: [],
      }).subscribe(p => (updated = p));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('active');
      expect(req.request.body.completedStep).toBe(6);
      req.flush({
        success: true,
        project: makeProject({
          name: 'Updated Solo Private Research Program',
          status: 'active',
          completedStep: 6,
          projectCode: null,
        }),
      });

      expect(updated?.status).toBe('active');
      expect(wizardService.project()?.status).toBe('active');
    });
  });

  describe('Phase 2 - 25 submissions (5 collaborators x 5 documents)', () => {
    it('produces exactly 25 unique submission records', () => {
      const submissions = Array.from({ length: 5 }).flatMap((_, ci) =>
        Array.from({ length: 5 }).map((__, di) => makeSubmission(ci, di))
      );
      expect(submissions.length).toBe(25);
      expect(new Set(submissions.map(s => s.id)).size).toBe(25);
      for (let ci = 0; ci < 5; ci++) {
        expect(submissions.filter(s => s.collaborator_index === ci).length).toBe(5);
      }
    });

    it('5 collaborators POST their 5 assigned documents each', () => {
      const httpClient = TestBed.inject(HttpClient);
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
      expect(submittedIds.length).toBe(25);
    });
  });

  describe('Phase 3 - Review: host approves all 25 submissions', () => {
    it('host approves all 25 submissions with status=approved', () => {
      const httpClient = TestBed.inject(HttpClient);
      const approved: Submission[] = [];
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          const sub = makeSubmission(ci, di);
          httpClient.patch<{ success: boolean; submission: Submission }>(
            `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
            { status: 'approved', feedback: null },
          ).subscribe(res => approved.push(res.submission));
          const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`);
          expect(req.request.body.status).toBe('approved');
          req.flush({ success: true, submission: { ...sub, status: 'approved' } });
        }
      }
      expect(approved.length).toBe(25);
      expect(approved.every(s => s.status === 'approved')).toBe(true);
    });
  });

  describe('Phase 4 - Project marked complete after all reviews', () => {
    it('marks the project completed', () => {
      const httpClient = TestBed.inject(HttpClient);
      let finalProject: Project | undefined;
      httpClient.patch<{ success: boolean; project: Project }>(
        `${environment.apiUrl}/projects/${PROJECT_ID}`,
        { status: 'completed' },
      ).subscribe(res => (finalProject = res.project));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.body.status).toBe('completed');
      req.flush({ success: true, project: makeProject({ status: 'completed', completedStep: 6 }) });

      expect(finalProject?.status).toBe('completed');
    });

    it('closeProject sends PATCH with status=completed', () => {
      wizardService.project.set(makeProject({ status: 'active', completedStep: 6, projectCode: null }));

      let closed: Project | undefined;
      wizardService.closeProject().subscribe(p => (closed = p));

      const req = http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body.status).toBe('completed');
      req.flush({ success: true, project: makeProject({ status: 'completed', completedStep: 6 }) });

      expect(closed?.status).toBe('completed');
      expect(wizardService.project()?.status).toBe('completed');
    });
  });

  describe('Wizard service - error and state management', () => {
    it('sets saveError signal on HTTP failure', () => {
      wizardService.project.set(makeProject({ completedStep: 2 }));
      wizardService.saveDocuments({ documents: FIVE_DOCUMENTS }).subscribe({ error: () => {} });

      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });

      expect(wizardService.saveError()).toBe('Server error');
      expect(wizardService.isSaving()).toBe(false);
    });

    it('reset clears project and error state', () => {
      wizardService.project.set(makeProject());
      wizardService.saveError.set('some error');
      wizardService.reset();
      expect(wizardService.projectId()).toBeNull();
      expect(wizardService.saveError()).toBeNull();
    });

    it('project list loads active private projects and submission stats', () => {
      listService.load();
      const listReq = http.expectOne(r => r.url === `${environment.apiUrl}/projects`);
      listReq.flush({ success: true, projects: [makeProject({ status: 'active' })] });
      http.expectOne(r => r.url.includes('/submissions/stats'))
        .flush({ success: true, stats: { [PROJECT_ID]: 25 } });
      expect(listService.projects().length).toBe(1);
      expect(listService.submissionStats()[PROJECT_ID]).toBe(25);
    });
  });

  describe('Full Connected End-to-End Flow', () => {
    it('completes details -> collaborators -> documents -> assignments -> staff -> activate -> 25 submissions -> 25 approvals -> complete', () => {
      const httpClient = TestBed.inject(HttpClient);
      const log: string[] = [];

      wizardService.saveDetails({ name: '2026 Solo Private Research Program', description: 'Private', deadline: '2026-12-31', attachments: [] })
        .subscribe(() => log.push('details_saved'));
      http.expectOne(`${environment.apiUrl}/projects`).flush({ success: true, project: makeProject({ completedStep: 1 }) });

      wizardService.saveCollaborators({ collaborators: FIVE_COLLABORATORS }).subscribe(() => log.push('collaborators_saved'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`).flush({ success: true, project: makeProject({ completedStep: 2 }) });

      wizardService.saveDocuments({ documents: FIVE_DOCUMENTS }).subscribe(() => log.push('documents_saved'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`).flush({ success: true, project: makeProject({ completedStep: 3 }) });

      wizardService.saveAssignments({ assignments: ALL_DOCS_ASSIGNED }).subscribe(() => log.push('assignments_saved'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`).flush({ success: true, project: makeProject({ completedStep: 4 }) });

      wizardService.saveStaff({ staff: makeProject().staff }).subscribe(() => log.push('staff_saved'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`).flush({ success: true, project: makeProject({ completedStep: 5 }) });

      wizardService.activateProject().subscribe(() => log.push('project_activated'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/activate`)
        .flush({ success: true, project: makeProject({ status: 'active', completedStep: 6 }) });

      let submitted = 0;
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          const sub = makeSubmission(ci, di);
          httpClient.post<{ success: boolean; submission: Submission }>(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions`, {})
            .subscribe(() => submitted++);
          http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions`).flush({ success: true, submission: sub });
        }
      }
      log.push(`${submitted}_submissions`);

      let approved = 0;
      for (let ci = 0; ci < 5; ci++) {
        for (let di = 0; di < 5; di++) {
          const sub = makeSubmission(ci, di);
          httpClient.patch<{ success: boolean; submission: Submission }>(
            `${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`,
            { status: 'approved', feedback: null },
          ).subscribe(() => approved++);
          http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}/submissions/${sub.id}`)
            .flush({ success: true, submission: { ...sub, status: 'approved' } });
        }
      }
      log.push(`${approved}_approved`);

      httpClient.patch<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects/${PROJECT_ID}`, { status: 'completed' })
        .subscribe(() => log.push('project_completed'));
      http.expectOne(`${environment.apiUrl}/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeProject({ status: 'completed' }) });

      expect(log).toEqual([
        'details_saved',
        'collaborators_saved',
        'documents_saved',
        'assignments_saved',
        'staff_saved',
        'project_activated',
        '25_submissions',
        '25_approved',
        'project_completed',
      ]);
    });
  });
});

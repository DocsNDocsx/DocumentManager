import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../environments/environment';
import { AuthService } from '../services/auth.service';
import { TeamProjectWizardService } from '../services/team-project-wizard.service';
import { TeamsService } from '../services/teams.service';
import {
  Team,
  TeamProjectCollaboratorInput,
  TeamProjectDocumentRequirement,
  TeamProjectDraft,
  TeamProjectSubmission,
} from '../models/team.models';

const USER_ID = 'user-team-private-001';
const TEAM_ID = 'team-private-001';
const PROJECT_ID = 'team-project-private-001';

const TEAM_FIXTURE: Team = {
  id: TEAM_ID,
  userId: USER_ID,
  name: 'Private Research Team',
  description: 'Private document collection team.',
  icon: 'fa-users',
  memberCount: 0,
  projectCount: 0,
  lastActivity: null,
  role: 'host',
  createdAt: '2026-05-18T00:00:00Z',
  updatedAt: '2026-05-18T00:00:00Z',
};

const FIVE_DOCUMENTS: TeamProjectDocumentRequirement[] = [
  { name: 'Resume', fileTypes: ['PDF', 'DOCX'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
  { name: 'Cover Letter', fileTypes: ['PDF'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
  { name: 'Transcript', fileTypes: ['PDF'], maxSize: '15', sizeUnit: 'MB', templateName: '' },
  { name: 'Reference Letter', fileTypes: ['PDF', 'DOCX'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
  { name: 'Writing Sample', fileTypes: ['PDF', 'DOCX'], maxSize: '20', sizeUnit: 'MB', templateName: '' },
];

const FIVE_COLLABORATORS: TeamProjectCollaboratorInput[] = [
  { firstName: 'Alice', lastName: 'Morgan', email: 'alice@uni.edu', affiliation: 'University', role: 'contributor' },
  { firstName: 'Bob', lastName: 'Chen', email: 'bob@uni.edu', affiliation: 'University', role: 'contributor' },
  { firstName: 'Carol', lastName: 'Davis', email: 'carol@uni.edu', affiliation: 'University', role: 'contributor' },
  { firstName: 'Dan', lastName: 'Evans', email: 'dan@uni.edu', affiliation: 'University', role: 'contributor' },
  { firstName: 'Eva', lastName: 'Fischer', email: 'eva@uni.edu', affiliation: 'University', role: 'supervisor' },
];

function makeDraft(overrides: Partial<TeamProjectDraft> = {}): TeamProjectDraft {
  return {
    id: PROJECT_ID,
    teamId: TEAM_ID,
    name: '2026 Team Private Research Program',
    description: 'Private project for selected collaborators.',
    type: 'private',
    status: 'draft',
    deadline: '2026-12-31',
    completedStep: 1,
    projectCode: null,
    expectedCollaborators: null,
    documents: FIVE_DOCUMENTS,
    supportStaff: { firstName: 'Support', lastName: 'Staff', email: 'support@example.com', affiliation: 'DocsNDocs' },
    createdAt: '2026-05-18T00:00:00Z',
    updatedAt: '2026-05-18T00:00:00Z',
    ...overrides,
  };
}

function makeSubmission(collab: TeamProjectCollaboratorInput, doc: TeamProjectDocumentRequirement, idx: number): TeamProjectSubmission {
  return {
    id: `team-private-sub-${idx}`,
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

describe('Private Team Project - Full Lifecycle', () => {
  let wizardService: TeamProjectWizardService;
  let teamsService: TeamsService;
  let authService: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), TeamProjectWizardService, TeamsService],
    });
    wizardService = TestBed.inject(TeamProjectWizardService);
    teamsService = TestBed.inject(TeamsService);
    authService = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    authService.currentUserId.set(USER_ID);
  });

  afterEach(() => http.verify());

  describe('Phase 0 - Create the team via TeamsService', () => {
    it('creates a private host team', () => {
      let createdTeam: Team | undefined;
      teamsService.create({
        userId: USER_ID,
        name: 'Private Research Team',
        description: 'Private document collection team.',
        icon: 'fa-users',
      }).subscribe(res => (createdTeam = res.team));

      const req = http.expectOne(`${environment.apiUrl}/teams`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.userId).toBe(USER_ID);
      req.flush({ success: true, team: TEAM_FIXTURE });

      expect(createdTeam?.id).toBe(TEAM_ID);
    });

    it('loads hosted teams for team project selection', () => {
      teamsService.load();
      http.expectOne(r => r.url === `${environment.apiUrl}/teams`)
        .flush({ success: true, teams: [TEAM_FIXTURE] });
      expect(teamsService.hostedTeams()[0].id).toBe(TEAM_ID);
    });
  });

  describe('Phase 1 - Wizard: details -> collaborators -> documents -> assignments -> activate', () => {
    it('Step 1 saves private team project details', () => {
      let result: TeamProjectDraft | undefined;
      wizardService.saveDetails({
        teamId: TEAM_ID,
        name: '2026 Team Private Research Program',
        description: 'Private project for selected collaborators.',
        deadline: '2026-12-31',
        type: 'private',
        supportStaff: makeDraft().supportStaff,
      }).subscribe(p => (result = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects`);
      expect(req.request.body.type).toBe('private');
      expect(req.request.body.teamId).toBe(TEAM_ID);
      req.flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      expect(result?.id).toBe(PROJECT_ID);
      expect(wizardService.completedStep()).toBe(1);
    });

    it('Step 2 saves 5 invited collaborators', () => {
      wizardService.project.set(makeDraft({ completedStep: 1 }));
      wizardService.saveCollaborators(FIVE_COLLABORATORS).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/collaborators`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body.collaborators.length).toBe(5);
      req.flush({ success: true, project: makeDraft({ completedStep: 2 }) });
    });

    it('Step 3 saves all 5 document requirements', () => {
      wizardService.project.set(makeDraft({ completedStep: 2 }));
      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe();

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`);
      expect(req.request.body.documents.map((d: TeamProjectDocumentRequirement) => d.name)).toEqual([
        'Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample',
      ]);
      req.flush({ success: true, project: makeDraft({ completedStep: 3 }) });
    });

    it('Step 4 saves assignment step progress', () => {
      wizardService.project.set(makeDraft({ completedStep: 3 }));
      wizardService.saveAssignments().subscribe();

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.body.completedStep).toBe(4);
      req.flush({ success: true, project: makeDraft({ completedStep: 4 }) });
    });

    it('Step 5 activates private team project', () => {
      wizardService.project.set(makeDraft({ completedStep: 4 }));
      let activated: TeamProjectDraft | undefined;
      wizardService.activateProject().subscribe(p => (activated = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.body.status).toBe('active');
      expect(req.request.body.completedStep).toBe(5);
      req.flush({ success: true, project: makeDraft({ status: 'active', completedStep: 5, projectCode: null }) });

      expect(activated?.status).toBe('active');
    });
  });

  describe('Phase 2 - 25 submissions (5 collaborators x 5 documents)', () => {
    it('produces exactly 25 unique submission records', () => {
      const submissions = FIVE_COLLABORATORS.flatMap((collab, ci) =>
        FIVE_DOCUMENTS.map((doc, di) => makeSubmission(collab, doc, ci * 5 + di))
      );
      expect(submissions.length).toBe(25);
      expect(new Set(submissions.map(s => s.id)).size).toBe(25);
      FIVE_COLLABORATORS.forEach(collab => {
        expect(submissions.filter(s => s.collaboratorEmail === collab.email).length).toBe(5);
      });
    });

    it('5 collaborators POST their 5 documents each', () => {
      const httpClient = TestBed.inject(HttpClient);
      const submittedIds: string[] = [];
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const sub = makeSubmission(collab, doc, ci * 5 + di);
          httpClient.post<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`,
            { collaboratorEmail: collab.email, documentName: doc.name, fileName: sub.fileName },
          ).subscribe(res => submittedIds.push(res.submission.id));
          http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission: sub });
        });
      });
      expect(submittedIds.length).toBe(25);
    });
  });

  describe('Phase 3 - Review: host approves all 25 submissions', () => {
    it('host approves all 25 submissions with status=approved', () => {
      const httpClient = TestBed.inject(HttpClient);
      const approved: TeamProjectSubmission[] = [];
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const sub = makeSubmission(collab, doc, ci * 5 + di);
          httpClient.patch<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
            { status: 'approved', feedback: null },
          ).subscribe(res => approved.push(res.submission));
          const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`);
          expect(req.request.body.status).toBe('approved');
          req.flush({ success: true, submission: { ...sub, status: 'approved' } });
        });
      });
      expect(approved.length).toBe(25);
      expect(approved.every(s => s.status === 'approved')).toBe(true);
    });
  });

  describe('Phase 4 - Project marked complete after all reviews', () => {
    it('marks the team project completed', () => {
      wizardService.project.set(makeDraft({ status: 'active', completedStep: 5 }));
      let completed: TeamProjectDraft | undefined;
      wizardService.markComplete().subscribe(p => (completed = p));

      const req = http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`);
      expect(req.request.body.status).toBe('completed');
      req.flush({ success: true, project: makeDraft({ status: 'completed', completedStep: 5 }) });

      expect(completed?.status).toBe('completed');
    });
  });

  describe('Wizard service - error and state management', () => {
    it('saveCollaborators fails with no project set', () => {
      let errorMsg = '';
      wizardService.saveCollaborators(FIVE_COLLABORATORS).subscribe({ error: (err: Error) => (errorMsg = err.message) });
      expect(errorMsg).toContain('No project');
    });

    it('sets saveError signal on HTTP failure', () => {
      wizardService.project.set(makeDraft({ completedStep: 2 }));
      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe({ error: () => {} });
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`)
        .flush({ message: 'Server error' }, { status: 500, statusText: 'Internal Server Error' });
      expect(wizardService.saveError()).toBe('Server error');
      expect(wizardService.isSaving()).toBe(false);
    });

    it('reset clears project and team name state', () => {
      wizardService.project.set(makeDraft());
      wizardService.teamName.set('Private Research Team');
      wizardService.saveError.set('some error');
      wizardService.reset();
      expect(wizardService.projectId()).toBeNull();
      expect(wizardService.teamName()).toBe('');
      expect(wizardService.saveError()).toBeNull();
    });
  });

  describe('Full Connected End-to-End Flow', () => {
    it('completes team -> project -> collaborators -> documents -> assignments -> activate -> 25 submissions -> 25 approvals -> complete', () => {
      const httpClient = TestBed.inject(HttpClient);
      const log: string[] = [];

      teamsService.create({ userId: USER_ID, name: 'Private Research Team', description: '', icon: 'fa-users' })
        .subscribe(() => log.push('team_created'));
      http.expectOne(`${environment.apiUrl}/teams`).flush({ success: true, team: TEAM_FIXTURE });

      wizardService.saveDetails({
        teamId: TEAM_ID,
        name: '2026 Team Private Research Program',
        description: 'Private',
        deadline: '2026-12-31',
        type: 'private',
      }).subscribe(() => log.push('details_saved'));
      http.expectOne(`${environment.apiUrl}/teams/projects`).flush({ success: true, project: makeDraft({ completedStep: 1 }) });

      wizardService.saveCollaborators(FIVE_COLLABORATORS).subscribe(() => log.push('collaborators_saved'));
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/collaborators`)
        .flush({ success: true, project: makeDraft({ completedStep: 2 }) });

      wizardService.saveDocuments(FIVE_DOCUMENTS).subscribe(() => log.push('documents_saved'));
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/documents`)
        .flush({ success: true, project: makeDraft({ completedStep: 3 }) });

      wizardService.saveAssignments().subscribe(() => log.push('assignments_saved'));
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ completedStep: 4 }) });

      wizardService.activateProject().subscribe(() => log.push('project_activated'));
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'active', completedStep: 5 }) });

      let submitted = 0;
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const sub = makeSubmission(collab, doc, ci * 5 + di);
          httpClient.post<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`,
            {},
          ).subscribe(() => submitted++);
          http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions`)
            .flush({ success: true, submission: sub });
        });
      });
      log.push(`${submitted}_submissions`);

      let approved = 0;
      FIVE_COLLABORATORS.forEach((collab, ci) => {
        FIVE_DOCUMENTS.forEach((doc, di) => {
          const sub = makeSubmission(collab, doc, ci * 5 + di);
          httpClient.patch<{ success: boolean; submission: TeamProjectSubmission }>(
            `${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`,
            { status: 'approved', feedback: null },
          ).subscribe(() => approved++);
          http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}/submissions/${sub.id}`)
            .flush({ success: true, submission: { ...sub, status: 'approved' } });
        });
      });
      log.push(`${approved}_approved`);

      wizardService.markComplete().subscribe(() => log.push('project_completed'));
      http.expectOne(`${environment.apiUrl}/teams/projects/${PROJECT_ID}`)
        .flush({ success: true, project: makeDraft({ status: 'completed' }) });

      expect(log).toEqual([
        'team_created',
        'details_saved',
        'collaborators_saved',
        'documents_saved',
        'assignments_saved',
        'project_activated',
        '25_submissions',
        '25_approved',
        'project_completed',
      ]);
    });
  });
});

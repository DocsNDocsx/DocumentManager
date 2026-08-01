import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterModule } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewTeamProjectPublicDetailsComponent } from './left-menu-new-team-project-public-details';
import { TeamsService } from '../../services/teams.service';
import { Team } from '../../models/team.models';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { environment } from '../../../environments/environment';

const MOCK_TEAMS: Team[] = [
  {
    id: 'team-001',
    userId: 'user-001',
    name: 'Alpha Research Team',
    description: 'Primary research group',
    icon: '🔬',
    memberCount: 5,
    projectCount: 2,
    lastActivity: '2026-05-01',
    role: 'host',
    createdAt: '2026-01-01',
    updatedAt: '2026-05-01',
  },
  {
    id: 'team-002',
    userId: 'user-001',
    name: 'Beta Engineering Team',
    description: 'Engineering group',
    icon: '⚙️',
    memberCount: 8,
    projectCount: 4,
    lastActivity: '2026-04-15',
    role: 'host',
    createdAt: '2026-02-01',
    updatedAt: '2026-04-15',
  },
];

function mockTeamsService(teams: Team[] = MOCK_TEAMS): Partial<TeamsService> {
  const teamsSignal = signal(teams);
  return {
    teams: teamsSignal,
    hostedTeams: signal(teams.filter(t => t.role === 'host')),
    isLoading: signal(false),
    error: signal(null),
    load: () => {},
  };
}

describe('LeftMenuNewTeamProjectPublicDetailsComponent', () => {
  let component: LeftMenuNewTeamProjectPublicDetailsComponent;
  let fixture: ComponentFixture<LeftMenuNewTeamProjectPublicDetailsComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPublicDetailsComponent, RouterModule.forRoot([])],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TeamsService, useValue: mockTeamsService() },
        {
          provide: ProjectAttachmentUploadService,
          useValue: {
            upload: () => of({
              name: 'test.pdf',
              size: '7 B',
              iconClass: 'fa-file-pdf',
              url: 'https://blob.example.com/test.pdf',
              bytes: 7,
              mimeType: 'application/pdf',
            }),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeftMenuNewTeamProjectPublicDetailsComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should pre-select the first hosted team on init', () => {
    expect(component.selectedTeamId()).toBe('team-001');
  });

  it('should expose both hosted teams in the dropdown', () => {
    expect(component.teams().length).toBe(2);
    expect(component.teams()[0].name).toBe('Alpha Research Team');
    expect(component.teams()[1].name).toBe('Beta Engineering Team');
  });

  it('should resolve selectedTeamName from the selected ID', () => {
    component.selectedTeamId.set('team-002');
    expect(component.selectedTeamName()).toBe('Beta Engineering Team');
  });

  it('should be invalid when form is empty', () => {
    component.selectedTeamId.set('');
    expect(component.isFormValid()).toBe(false);
  });

  it('should be valid with all required fields including 7 collaborators', () => {
    component.selectedTeamId.set('team-001');
    component.projectName.set('2026 Open Application Program');
    component.projectDeadline.set('2026-12-31');
    component.expectedCollaborators.set('7');

    expect(component.isFormValid()).toBe(true);
  });

  it('should be invalid when expectedCollaborators is 0', () => {
    component.selectedTeamId.set('team-001');
    component.projectName.set('2026 Open Application Program');
    component.projectDeadline.set('2026-12-31');
    component.expectedCollaborators.set('0');

    expect(component.isFormValid()).toBe(false);
  });

  it('should be invalid when team is missing', () => {
    component.selectedTeamId.set('');
    component.projectName.set('2026 Open Application Program');
    component.projectDeadline.set('2026-12-31');
    component.expectedCollaborators.set('7');

    expect(component.isFormValid()).toBe(false);
  });

  it('should be invalid when project name is missing', () => {
    component.selectedTeamId.set('team-001');
    component.projectDeadline.set('2026-12-31');
    component.expectedCollaborators.set('7');

    expect(component.isFormValid()).toBe(false);
  });

  it('should be invalid when deadline is missing', () => {
    component.selectedTeamId.set('team-001');
    component.projectName.set('2026 Open Application Program');
    component.expectedCollaborators.set('7');

    expect(component.isFormValid()).toBe(false);
  });

  it('should allow 7 collaborators and not allow 0', () => {
    component.selectedTeamId.set('team-001');
    component.projectName.set('2026 Open Application Program');
    component.projectDeadline.set('2026-12-31');

    component.expectedCollaborators.set('7');
    expect(component.isFormValid()).toBe(true);

    component.expectedCollaborators.set('0');
    expect(component.isFormValid()).toBe(false);
  });

  it('should add uploaded files', () => {
    const mockFile = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    const mockFileList = {
      0: mockFile,
      length: 1,
      item: (i: number) => mockFile,
      [Symbol.iterator]: function* () { yield mockFile; },
    } as unknown as FileList;

    component['handleFiles'](mockFileList);

    expect(component.uploadedFiles().length).toBe(1);
    expect(component.uploadedFiles()[0].name).toBe('test.pdf');
    expect(component.uploadedFiles()[0].url).toBe('https://blob.example.com/test.pdf');
  });

  it('should remove a file by index', () => {
    component.uploadedFiles.set([
      { name: 'a.pdf', size: '1 KB', iconClass: 'fa-file-pdf' },
      { name: 'b.pdf', size: '2 KB', iconClass: 'fa-file-pdf' },
    ]);

    component.removeFile(0);

    expect(component.uploadedFiles().length).toBe(1);
    expect(component.uploadedFiles()[0].name).toBe('b.pdf');
  });

  it('should toggle dropdown open and close', () => {
    expect(component.dropdownOpen()).toBe(false);

    const event = new MouseEvent('click');
    component.toggleDropdown(event);
    expect(component.dropdownOpen()).toBe(true);

    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);
  });

  it('saveAsDraft creates a new public team draft and redirects into the draft URL', () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigate').mockImplementation(() => Promise.resolve(true));

    component.selectedTeamId.set('team-001');
    component.projectName.set('Team Public Draft');
    component.projectDescription.set('Saved from details page');
    component.projectDeadline.set('2027-12-31');
    component.expectedCollaborators.set('7');

    component.saveAsDraft();

    const req = httpMock.expectOne(`${environment.apiUrl}/teams/projects`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(expect.objectContaining({
      teamId: 'team-001',
      name: 'Team Public Draft',
      description: 'Saved from details page',
      deadline: '2027-12-31',
      type: 'public',
      expectedCollaborators: 7,
      completedStep: 1,
    }));

    req.flush({
      success: true,
      project: {
        id: 'team-public-draft-1',
        teamId: 'team-001',
        name: 'Team Public Draft',
        description: 'Saved from details page',
        deadline: '2027-12-31',
        status: 'draft',
        type: 'public',
        completedStep: 1,
        expectedCollaborators: 7,
        projectCode: null,
        documents: [],
        attachments: [],
        supportStaff: null,
        createdAt: '2026-08-01T00:00:00.000Z',
        updatedAt: '2026-08-01T00:00:00.000Z',
      },
    });

    expect(component.toastMsg()).toBe('Project saved as draft');
    expect(navigateSpy).toHaveBeenCalledWith(
      ['/new-team-project/public', 'team-public-draft-1', 'details'],
      { replaceUrl: true },
    );
  });
});

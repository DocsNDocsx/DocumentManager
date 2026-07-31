import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewTeamProjectPrivateDetailsComponent } from './left-menu-new-team-project-private-details';
import { TeamsService } from '../../services/teams.service';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewTeamProjectPrivateDetailsComponent', () => {
  let component: LeftMenuNewTeamProjectPrivateDetailsComponent;
  let router: any;
  let teamsService: any;
  let wizard: any;
  let uploader: any;

  beforeEach(async () => {
    const teams = [
      { id: 'team-1', name: 'Alpha', role: 'host' },
      { id: 'team-2', name: 'Beta', role: 'host' },
    ];
    teamsService = {
      teams: signal(teams),
      hostedTeams: signal(teams),
      load: vi.fn(),
    };
    wizard = {
      projectId: signal(null),
      project: signal<any>(null),
      teamName: signal(''),
      saveError: signal(null),
      reset: vi.fn(),
      loadDraft: vi.fn(() => of({})),
      saveDetails: vi.fn(() => of({})),
    };
    uploader = {
      upload: vi.fn(() => of({
        name: 'team.pdf',
        size: '1 KB',
        iconClass: 'fa-file-pdf',
        url: 'https://blob.example.com/team.pdf',
      })),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPrivateDetailsComponent],
      providers: [
        { provide: TeamsService, useValue: teamsService },
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: ProjectAttachmentUploadService, useValue: uploader },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateDetailsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('resets new wizard state and preselects the first hosted team', () => {
    expect(wizard.reset).toHaveBeenCalled();
    expect(component.selectedTeamId()).toBe('team-1');
    expect(component.selectedTeamName()).toBe('Alpha');
    expect(component.isFormValid()).toBe(false);
  });

  it('updates form fields from DOM events and validates required data', () => {
    component.onTeamChange({ target: { value: 'team-2' } } as unknown as Event);
    component.onNameInput({ target: { value: 'Team Project' } } as unknown as Event);
    component.onDescInput({ target: { value: 'Description' } } as unknown as Event);
    component.onDeadlineChange({ target: { value: '2026-09-15' } } as unknown as Event);

    expect(component.selectedTeamName()).toBe('Beta');
    expect(component.projectDescription()).toBe('Description');
    expect(component.isFormValid()).toBe(true);
  });

  it('uploads team attachments, skips duplicates/oversized files, and handles errors', () => {
    component.onFileChange({
      target: {
        files: [
          new File(['x'], 'team.pdf'),
          new File(['x'], 'team.pdf'),
          new File([new ArrayBuffer(51 * 1024 * 1024)], 'large.pdf'),
        ],
        value: 'x',
      },
    } as unknown as Event);

    expect(uploader.upload).toHaveBeenCalledTimes(2);
    expect(component.uploadedFiles()[0].name).toBe('team.pdf');

    uploader.upload.mockReturnValueOnce(throwError(() => new Error('fail')));
    component.onFileChange({ target: { files: [new File(['x'], 'bad.pdf')], value: 'x' } } as unknown as Event);
    expect(wizard.saveError()).toBe('Failed to upload bad.pdf');
    expect(component.isUploading()).toBe(false);
  });

  it('saves valid details and navigates to team collaborators', () => {
    component.selectedTeamId.set('team-1');
    component.projectName.set('Team Project');
    component.projectDescription.set('Description');
    component.projectDeadline.set('2026-09-15');

    component.onContinue();

    expect(wizard.teamName()).toBe('Alpha');
    expect(wizard.saveDetails).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 'team-1',
      name: 'Team Project',
      description: 'Description',
      deadline: '2026-09-15',
      attachments: component.uploadedFiles(),
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/collaborators']);
  });
});

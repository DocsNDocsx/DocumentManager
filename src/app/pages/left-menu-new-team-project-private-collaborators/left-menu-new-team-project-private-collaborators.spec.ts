import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewTeamProjectPrivateCollaboratorsComponent } from './left-menu-new-team-project-private-collaborators';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

describe('LeftMenuNewTeamProjectPrivateCollaboratorsComponent', () => {
  let component: LeftMenuNewTeamProjectPrivateCollaboratorsComponent;
  let http: HttpTestingController;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      projectId: signal('team-project-1'),
      project: signal({ status: 'draft' }),
      isSaving: signal(false),
      saveCollaborators: vi.fn(() => of({})),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPrivateCollaboratorsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateCollaboratorsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http?.verify());

  it('loads existing team collaborators on init', () => {
    const req = http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`);
    req.flush({
      success: true,
      collaborators: [
        { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com', affiliation: 'Uni', role: 'contributor' },
      ],
    });

    expect(component.formsGenerated()).toBe(true);
    expect(component.collaboratorCount()).toBe(1);
    expect(component.isFormValid()).toBe(true);
  });

  it('generates, edits, validates, removes, and saves collaborators', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });

    component.onCountInput({ target: { value: '2' } } as unknown as Event);
    component.generateForms();
    component.updateField(0, 'firstName', 'Alice');
    component.updateField(0, 'lastName', 'Morgan');
    component.updateField(0, 'email', 'alice@example.com');
    component.updateField(1, 'firstName', 'Bob');
    component.updateField(1, 'lastName', 'Chen');
    component.updateField(1, 'email', 'bad-email');
    expect(component.isFormValid()).toBe(false);

    component.updateField(1, 'email', 'bob@example.com');
    component.removeCollab(1);
    component.onContinue();

    expect(wizard.saveCollaborators).toHaveBeenCalledWith(component.collaborators());
    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/documents']);
  });

  it('does not reduce collaborators while editing an active project', () => {
    wizard.project.set({ status: 'active' });
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({
      success: true,
      collaborators: [
        { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com', affiliation: '', role: 'contributor' },
        { firstName: 'Bob', lastName: 'Chen', email: 'bob@example.com', affiliation: '', role: 'contributor' },
      ],
    });

    component.removeCollab(1);
    component.onCountInput({ target: { value: '1' } } as unknown as Event);
    component.generateForms();

    expect(component.minimumCollaboratorCount()).toBe(2);
    expect(component.collaborators()).toHaveLength(2);
    expect(component.collaboratorCount()).toBe(2);
  });

  it('redirects to details when project id is missing', async () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });
    wizard.projectId.set(null);

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateCollaboratorsComponent);
    fixture.componentInstance.ngOnInit();

    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/details']);
  });
});

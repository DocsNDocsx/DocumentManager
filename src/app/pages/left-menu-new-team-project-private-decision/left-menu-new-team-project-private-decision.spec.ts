import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewTeamProjectPrivateDecisionComponent } from './left-menu-new-team-project-private-decision';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { AuthService } from '../../services/auth.service';
import { environment } from '../../../environments/environment';

describe('LeftMenuNewTeamProjectPrivateDecisionComponent', () => {
  let component: LeftMenuNewTeamProjectPrivateDecisionComponent;
  let http: HttpTestingController;
  let wizard: any;
  let billing: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      projectId: signal('team-project-1'),
      teamName: signal('Alpha'),
      project: signal<any>({
        name: 'Team Private Project',
        description: 'Private team collection',
        deadline: '2026-09-15',
        documents: [{ name: 'Resume' }],
      }),
      isSaving: signal(false),
      activateProject: vi.fn(() => of({})),
      markComplete: vi.fn(() => of({ status: 'completed' })),
      reset: vi.fn(),
    };
    billing = { buildTeamActivationQuery: vi.fn(() => ({ type: 'team', monthly: '10.00' })) };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPrivateDecisionComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: BillingEstimateService, useValue: billing },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateDecisionComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http?.verify());

  it('loads collaborators for decision summary', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({
      success: true,
      collaborators: [{ firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' }],
    });

    expect(component.projectName()).toBe('Team Private Project');
    expect(component.teamName()).toBe('Alpha');
    expect(component.collabCount()).toBe(1);
  });

  it('activates successfully and returns to team projects', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });

    component.openModal();
    component.confirmActivation();

    expect(component.modalOpen()).toBe(false);
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('routes subscription-required activation to billing', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({
      success: true,
      collaborators: [{ firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' }],
    });
    wizard.activateProject.mockReturnValueOnce(throwError(() => ({ status: 402 })));

    component.confirmActivation();

    expect(component.toastMsg()).toBe('Please subscribe before activating a project');
    expect(billing.buildTeamActivationQuery).toHaveBeenCalledWith(wizard.project(), 1);
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'team', monthly: '10.00' },
    });
  });

  it('returns to team projects without activating when editing an active project', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    expect(component.isActiveProject()).toBe(true);

    component.finishEditing();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('closes an active private team project without activating again', () => {
    http.expectOne(`${environment.apiUrl}/teams/projects/team-project-1/collaborators`).flush({ success: true, collaborators: [] });
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    component.closeProject();

    expect(wizard.markComplete).toHaveBeenCalled();
    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });
});

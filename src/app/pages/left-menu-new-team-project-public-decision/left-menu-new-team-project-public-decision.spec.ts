import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewTeamProjectPublicDecisionComponent } from './left-menu-new-team-project-public-decision';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewTeamProjectPublicDecisionComponent', () => {
  let component: LeftMenuNewTeamProjectPublicDecisionComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      projectId: signal('team-project-1'),
      teamName: signal('Alpha'),
      project: signal<any>({
        name: 'Team Public Project',
        description: 'Public team collection',
        deadline: '2026-09-15',
        expectedCollaborators: 8,
        documents: [{ name: 'Resume' }],
      }),
      activateProject: vi.fn(() => of({ projectCode: 'TEAM-PUB-1' })),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPublicDecisionComponent],
      providers: [
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: BillingEstimateService, useValue: { buildTeamActivationQuery: vi.fn(() => ({ type: 'team', monthly: '12.00' })) } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPublicDecisionComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('summarizes public team project state and activates to show code modal', () => {
    expect(component.teamName()).toBe('Alpha');
    expect(component.expectedCollaborators()).toBe(8);

    component.openConfirmModal();
    component.confirmActivation();

    expect(component.confirmModalOpen()).toBe(false);
    expect(component.projectCode()).toBe('TEAM-PUB-1');
    expect(component.codeModalOpen()).toBe(true);
  });

  it('closes code modal and returns to team projects', () => {
    component.closeCodeModal();

    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('routes subscription-required activation to billing', () => {
    wizard.activateProject.mockReturnValueOnce(throwError(() => ({ error: { code: 'SUBSCRIPTION_REQUIRED' } })));

    component.confirmActivation();

    expect(component.toastMsg()).toBe('Please subscribe before activating a project');
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'team', monthly: '12.00' },
    });
  });

  it('returns to team projects without activating when editing an active project', () => {
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    expect(component.isActiveProject()).toBe(true);

    component.finishEditing();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('saves decision as draft by returning to team projects', () => {
    component.saveAsDraft();

    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('cancels public team project setup back to team landing', () => {
    component.cancelProject();

    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/left-menu-new-team-project-landing']);
  });
});

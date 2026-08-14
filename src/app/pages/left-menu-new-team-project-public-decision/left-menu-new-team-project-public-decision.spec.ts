import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewTeamProjectPublicDecisionComponent } from './left-menu-new-team-project-public-decision';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewTeamProjectPublicDecisionComponent', () => {
  let component: LeftMenuNewTeamProjectPublicDecisionComponent;
  let wizard: any;
  let billing: any;
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
      markComplete: vi.fn(() => of({ status: 'completed' })),
      reset: vi.fn(),
    };
    billing = { buildTeamActivationQuery: vi.fn(() => ({ type: 'team', monthly: '12.00' })) };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPublicDecisionComponent],
      providers: [
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: BillingEstimateService, useValue: billing },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPublicDecisionComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('summarizes public team project state and routes directly to billing', () => {
    expect(component.teamName()).toBe('Alpha');
    expect(component.expectedCollaborators()).toBe(8);

    component.goToPayment();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'team', monthly: '12.00' },
    });
  });

  it('shows a validation message when a payment estimate cannot be created', () => {
    billing.buildTeamActivationQuery.mockReturnValueOnce(null);

    component.goToPayment();

    expect(component.toastVisible()).toBe(true);
    expect(component.toastMsg()).toBe('Please add a valid deadline before continuing to payment');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('returns to team projects without activating when editing an active project', () => {
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    expect(component.isActiveProject()).toBe(true);

    component.finishEditing();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-team-projects']);
  });

  it('closes an active public team project without activating again', () => {
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    component.closeProject();

    expect(wizard.markComplete).toHaveBeenCalled();
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

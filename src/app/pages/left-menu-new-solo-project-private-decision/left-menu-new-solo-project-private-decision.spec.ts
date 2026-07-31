import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateDecisionComponent } from './left-menu-new-solo-project-private-decision';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { LoggingService } from '../../services/logging.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPrivateDecisionComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateDecisionComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(6),
      project: signal<any>({
        name: 'Private Project',
        description: 'Private collection',
        deadline: '2026-09-15',
        collaborators: [{ firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' }],
        documents: [{ name: 'Resume' }, { name: 'Transcript' }],
        assignments: { 0: [0, 1] },
        staff: { firstName: 'Sam', lastName: 'Staff', email: 'sam@example.com', affiliation: 'Support' },
      }),
      activateProject: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
      cancelProject: vi.fn(() => of({})),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateDecisionComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: BillingEstimateService, useValue: { buildSoloActivationQuery: vi.fn(() => ({ type: 'solo' })) } },
        { provide: LoggingService, useValue: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateDecisionComponent);
    component = fixture.componentInstance;
  });

  it('summarizes project details and assigned document names', () => {
    expect(component.projectName()).toBe('Private Project');
    expect(component.totalEmails()).toBe(2);
    expect(component.getAssignedDocNames(0)).toBe('Resume, Transcript');
    expect(component.getAssignedDocNames(99)).toBe('No documents assigned');
  });

  it('activates successfully and returns to solo projects', () => {
    component.openModal();
    component.confirmActivation();

    expect(component.modalOpen()).toBe(false);
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-solo-projects']);
  });

  it('routes subscription-required activation to billing', () => {
    wizard.activateProject.mockReturnValueOnce(throwError(() => ({ error: { code: 'SUBSCRIPTION_REQUIRED' } })));

    component.confirmActivation();

    expect(component.toastMsg()).toBe('Please subscribe before activating a project');
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'solo' },
    });
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPublicDecisionComponent } from './left-menu-new-solo-project-public-decision';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPublicDecisionComponent', () => {
  let component: LeftMenuNewSoloProjectPublicDecisionComponent;
  let wizard: any;
  let billing: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      projectId: signal('new-project'),
      projectCode: signal('PUB-123'),
      project: signal<any>({
        name: 'Public Project',
        description: 'Open collection',
        deadline: '2026-09-15',
        expectedCollaborators: 5,
        documents: [{ name: 'Resume' }],
        staff: null,
      }),
      activateProject: vi.fn(() => of({ projectCode: 'PUB-123' })),
      closeProject: vi.fn(() => of({ status: 'completed' })),
      saveDraft: vi.fn(() => of({})),
      cancelProject: vi.fn(() => of({})),
      reset: vi.fn(),
    };
    billing = { buildSoloActivationQuery: vi.fn(() => ({ type: 'solo', monthly: '9.00' })) };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPublicDecisionComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: BillingEstimateService, useValue: billing },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPublicDecisionComponent);
    component = fixture.componentInstance;
  });

  it('routes directly to the billing page without activating', () => {
    component.goToPayment();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'solo', monthly: '9.00' },
    });
  });

  it('shows a validation message when a payment estimate cannot be created', () => {
    billing.buildSoloActivationQuery.mockReturnValueOnce(null);

    component.goToPayment();

    expect(component.toastVisible()).toBe(true);
    expect(component.toastMsg()).toBe('Please add a valid deadline before continuing to payment');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('cancels and resets project state', () => {
    component.cancelProject();

    expect(wizard.cancelProject).toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/left-menu-new-solo-project-landing']);
  });

  it('returns to project list without activating when editing an active project', () => {
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    expect(component.isActiveProject()).toBe(true);

    component.finishEditing();

    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-solo-projects']);
  });

  it('closes an active public project without activating again', () => {
    wizard.project.update((project: any) => ({ ...project, status: 'active' }));

    component.closeProject();

    expect(wizard.closeProject).toHaveBeenCalled();
    expect(wizard.activateProject).not.toHaveBeenCalled();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-solo-projects']);
  });
});

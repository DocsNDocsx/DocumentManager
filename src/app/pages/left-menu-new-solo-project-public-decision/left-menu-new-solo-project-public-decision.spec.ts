import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

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

  it('opens confirm modal, activates, shows code modal, and closes to project list', () => {
    component.openConfirmModal();
    expect(component.confirmModalOpen()).toBe(true);

    component.confirmActivation();
    expect(component.confirmModalOpen()).toBe(false);
    expect(component.codeModalOpen()).toBe(true);

    component.closeCodeModal();
    expect(wizard.reset).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/top-menu-solo-projects']);
  });

  it('routes subscription-required activation to the billing page', () => {
    wizard.activateProject.mockReturnValueOnce(throwError(() => ({ status: 402 })));

    component.confirmActivation();

    expect(component.toastMsg()).toBe('Please subscribe before activating a project');
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: { type: 'solo', monthly: '9.00' },
    });
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

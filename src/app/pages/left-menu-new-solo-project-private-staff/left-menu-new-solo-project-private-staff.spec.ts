import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateStaffComponent } from './left-menu-new-solo-project-private-staff';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPrivateStaffComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateStaffComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(5),
      project: signal<any>({
        staff: { firstName: 'Sam', lastName: 'Staff', email: 'sam@example.com', affiliation: 'Support' },
      }),
      saveStaff: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateStaffComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateStaffComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('populates existing support staff and can clear it', () => {
    expect(component.addStaff()).toBe(true);
    expect(component.staffEmail()).toBe('sam@example.com');

    component.toggleStaff();

    expect(component.addStaff()).toBe(false);
    expect(component.staffEmail()).toBe('');
  });

  it('saves support staff and navigates to decision', () => {
    component.continue();

    expect(wizard.saveStaff).toHaveBeenCalledWith({
      staff: {
        firstName: 'Sam',
        lastName: 'Staff',
        email: 'sam@example.com',
        affiliation: 'Support',
      },
    });
    expect(router.navigate).toHaveBeenCalledWith(['/new-solo-project/private/decision']);
  });

  it('saves null staff when support staff is disabled', () => {
    component.toggleStaff();
    component.continue();

    expect(wizard.saveStaff).toHaveBeenCalledWith({ staff: null });
  });
});

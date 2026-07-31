import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateAssignmentsComponent } from './left-menu-new-solo-project-private-assignments';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPrivateAssignmentsComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateAssignmentsComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(4),
      projectId: signal('project-1'),
      project: signal<any>({
        collaborators: [
          { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com' },
          { firstName: 'Bob', lastName: 'Chen', email: 'bob@example.com' },
        ],
        documents: [{ name: 'Resume' }, { name: 'Transcript' }],
        assignments: { 0: [0], 1: [] },
      }),
      loadDraft: vi.fn(() => of({})),
      saveAssignments: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateAssignmentsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateAssignmentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('populates collaborators, documents, assignments, and warning state', () => {
    expect(component.collaborators().length).toBe(2);
    expect(component.documents().length).toBe(2);
    expect(component.isChecked(0, 0)).toBe(true);
    expect(component.warnings()).toEqual(['Bob Chen has no documents assigned']);
    expect(component.allAssigned()).toBe(false);
  });

  it('toggles individual, column, select all, and clear all assignments', () => {
    component.toggleAssignment(1, 1, true);
    expect(component.isChecked(1, 1)).toBe(true);

    component.toggleColumn(0);
    expect(component.isColumnAllSelected(0)).toBe(true);

    component.selectAll();
    expect(component.allAssigned()).toBe(true);

    component.clearAll();
    expect(component.warnings().length).toBe(2);
  });

  it('serializes assignments and navigates to staff', () => {
    component.selectAll();
    component.continue();

    expect(wizard.saveAssignments).toHaveBeenCalledWith({
      assignments: { 0: [0, 1], 1: [0, 1] },
    });
    expect(router.navigate).toHaveBeenCalledWith(['../staff'], expect.anything());
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateCollaboratorsComponent } from './left-menu-new-solo-project-private-collaborators';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPrivateCollaboratorsComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateCollaboratorsComponent;
  let fixture: ComponentFixture<LeftMenuNewSoloProjectPrivateCollaboratorsComponent>;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(2),
      projectId: signal('project-1'),
      project: signal<any>({
        collaborators: [
          { firstName: 'Alice', lastName: 'Morgan', email: 'alice@example.com', affiliation: 'Uni' },
        ],
      }),
      loadDraft: vi.fn(() => of({})),
      saveCollaborators: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateCollaboratorsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { parent: { snapshot: { paramMap: { get: () => null } } } },
        },
        {
          provide: AuthService,
          useValue: {
            currentUserId: signal('123'),
            currentUserFirstname: signal('Mridul'),
            currentUserLastname: signal('Mishra'),
            currentUserEmail: signal('mridul@example.com'),
            currentUserAvatar: signal(''),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateCollaboratorsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('populates existing collaborators from the wizard draft', () => {
    expect(component.formsGenerated()).toBe(true);
    expect(component.collaboratorCount()).toBe(1);
    expect(component.collaborators()[0].email).toBe('alice@example.com');
    expect(component.isFormValid()).toBe(true);
  });

  it('generates collaborator forms and validates required fields and email format', () => {
    component.collaboratorCount.set(2);
    component.generateForms();

    expect(component.collaborators().length).toBe(2);
    expect(component.isFormValid()).toBe(false);

    component.updateField(0, 'firstName', 'Alice');
    component.updateField(0, 'lastName', 'Morgan');
    component.updateField(0, 'email', 'bad-email');
    component.updateField(1, 'firstName', 'Bob');
    component.updateField(1, 'lastName', 'Chen');
    component.updateField(1, 'email', 'bob@example.com');
    expect(component.isFormValid()).toBe(false);

    component.updateField(0, 'email', 'alice@example.com');
    expect(component.isFormValid()).toBe(true);
  });

  it('removes collaborators but keeps the last remaining form', () => {
    component.collaborators.set([
      { firstName: 'A', lastName: 'A', email: 'a@example.com', affiliation: '' },
      { firstName: 'B', lastName: 'B', email: 'b@example.com', affiliation: '' },
    ]);

    component.removeCollaborator(0);
    expect(component.collaborators().length).toBe(1);
    expect(component.collaboratorCount()).toBe(1);

    component.removeCollaborator(0);
    expect(component.collaborators().length).toBe(1);
  });

  it('saves valid collaborators and navigates to documents', () => {
    component.continue();

    expect(wizard.saveCollaborators).toHaveBeenCalledWith({
      collaborators: component.collaborators(),
    });
    expect(router.navigate).toHaveBeenCalledWith(['../documents'], expect.anything());
  });

  it('does not continue when collaborators are invalid and handles draft errors', () => {
    wizard.saveDraft.mockReturnValueOnce(throwError(() => new Error('fail')));
    component.collaborators.set([]);

    component.continue();
    component.saveAsDraft();

    expect(wizard.saveCollaborators).not.toHaveBeenCalled();
    expect(component.toastMsg()).toContain('Failed to save draft');
    expect(component.toastMsg()).toContain('please try again');
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPublicDetailsComponent } from './left-menu-new-solo-project-public-details';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPublicDetailsComponent', () => {
  let component: LeftMenuNewSoloProjectPublicDetailsComponent;
  let wizard: any;
  let router: any;
  let uploader: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(1),
      projectId: signal(null),
      project: signal<any>(null),
      savePublicDetails: vi.fn(() => of({ id: 'new-project' })),
      loadDraft: vi.fn(() => of({})),
      reset: vi.fn(() => wizard.project.set(null)),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };
    uploader = { upload: vi.fn(() => of({ name: 'a.pdf', size: '1 KB', iconClass: 'fa-file-pdf' })) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPublicDetailsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: ProjectAttachmentUploadService, useValue: uploader },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPublicDetailsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('resets stale wizard state on a new public project route', () => {
    expect(wizard.reset).toHaveBeenCalled();
    expect(component.projectName()).toBe('');
    expect(component.projectDeadline()).toBe('');
    expect(component.expectedCollaborators()).toBe('');
  });

  it('requires name, deadline, and positive expected collaborators', () => {
    expect(component.isFormValid()).toBe(false);

    component.projectName.set('Public Project');
    component.projectDeadline.set('2026-09-15');
    component.expectedCollaborators.set('0');
    expect(component.isFormValid()).toBe(false);

    component.expectedCollaborators.set('5');
    expect(component.isFormValid()).toBe(true);
  });

  it('allows an active project target to be reduced to its joined collaborator count', () => {
    wizard.project.set({
      status: 'active',
      name: 'Public Project',
      description: '',
      deadline: '2026-09-15',
      expectedCollaborators: 10,
      attachments: [],
      collaborators: [
        { email: 'one@example.com' },
        { email: 'two@example.com' },
        { email: 'removed@example.com', status: 'inactive' },
      ],
      staff: null,
    });
    (component as any).populateForm();

    expect(component.minimumCollaborators()).toBe(2);
    component.expectedCollaborators.set('2');
    expect(component.isFormValid()).toBe(true);
    component.expectedCollaborators.set('1');
    expect(component.isFormValid()).toBe(false);
  });

  it('saves support staff when first name is present and continues to documents', () => {
    component.projectName.set('Public Project');
    component.projectDeadline.set('2026-09-15');
    component.expectedCollaborators.set('5');
    component.supportName.set('Sam Support');
    component.supportEmail.set('sam@example.com');
    component.supportAffiliation.set('DocsNDocs');

    component.continue();

    expect(wizard.savePublicDetails).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Public Project',
      expectedCollaborators: '5',
      staff: {
        firstName: 'Sam',
        lastName: 'Support',
        email: 'sam@example.com',
        affiliation: 'DocsNDocs',
      },
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/new-solo-project/public', 'new-project', 'documents']);
  });

  it('saveAsDraft redirects newly created public projects into the draft URL', () => {
    component.projectName.set('Public Project');
    component.projectDeadline.set('2026-09-15');
    component.expectedCollaborators.set('5');

    component.saveAsDraft();

    expect(router.navigate).toHaveBeenCalledWith(
      ['/new-solo-project/public', 'new-project', 'details'],
      { replaceUrl: true },
    );
  });

  it('shows the uploaded filename and a success notification', () => {
    const file = new File(['pdf'], 'research-plan.pdf', { type: 'application/pdf' });
    uploader.upload.mockReturnValue(of({
      name: 'research-plan.pdf',
      size: '3 B',
      iconClass: 'fa-file-pdf',
      url: 'https://files.example.com/research-plan.pdf',
    }));

    (component as any).uploadFile(file);

    expect(component.uploadedFiles()).toEqual([
      expect.objectContaining({ name: 'research-plan.pdf', size: '3 B' }),
    ]);
    expect(component.toastVisible()).toBe(true);
    expect(component.toastMsg()).toBe('research-plan.pdf uploaded successfully');
    expect(component.uploadStatusMessage()).toBe('research-plan.pdf uploaded successfully');
    expect(component.uploadStatusError()).toBe(false);
    expect(component.uploadingFileNames()).toEqual([]);
  });
});

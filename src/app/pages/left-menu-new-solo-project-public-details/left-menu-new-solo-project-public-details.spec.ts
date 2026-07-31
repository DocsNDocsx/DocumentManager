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

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(1),
      projectId: signal(null),
      project: signal<any>(null),
      savePublicDetails: vi.fn(() => of({ id: 'new-project' })),
      loadDraft: vi.fn(() => of({})),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPublicDetailsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: ProjectAttachmentUploadService, useValue: { upload: vi.fn(() => of({ name: 'a.pdf', size: '1 KB', iconClass: 'fa-file-pdf' })) } },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPublicDetailsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
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

  it('saves support staff when first name is present and continues to documents', () => {
    component.projectName.set('Public Project');
    component.projectDeadline.set('2026-09-15');
    component.expectedCollaborators.set('5');
    component.supportFirstName.set('Sam');
    component.supportLastName.set('Support');
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
    expect(router.navigate).toHaveBeenCalledWith(['/new-solo-project/public/documents']);
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
});

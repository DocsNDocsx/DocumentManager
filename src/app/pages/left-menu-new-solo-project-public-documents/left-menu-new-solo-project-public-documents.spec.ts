import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPublicDocumentsComponent } from './left-menu-new-solo-project-public-documents';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';

describe('LeftMenuNewSoloProjectPublicDocumentsComponent', () => {
  let component: LeftMenuNewSoloProjectPublicDocumentsComponent;
  let wizard: any;
  let router: any;
  let uploader: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      projectId: signal('new-project'),
      project: signal<any>({ documents: [] }),
      savePublicDocuments: vi.fn(() => of({ id: 'new-project' })),
      cancelProject: vi.fn(() => of({ id: 'new-project' })),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };
    uploader = { upload: vi.fn(() => of({ name: 'template.pdf', size: '2 KB', iconClass: 'fa-file-pdf', url: 'https://blob.example/template', mimeType: 'application/pdf' })) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPublicDocumentsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
        { provide: ProjectAttachmentUploadService, useValue: uploader },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPublicDocumentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('uploads and retains the template file metadata', () => {
    component.documentCount.set(1);
    component.generateForms();
    const file = new File(['template'], 'template.pdf', { type: 'application/pdf' });
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [file] });

    component.handleTemplateUpload(0, { target: input } as unknown as Event);

    expect(uploader.upload).toHaveBeenCalledWith(file, 'solo');
    expect(component.documents()[0]).toEqual(expect.objectContaining({
      templateName: 'template.pdf',
      templateUrl: 'https://blob.example/template',
      templateMimeType: 'application/pdf',
    }));
  });

  it('generates, validates, and saves public document requirements', () => {
    component.documentCount.set(1);
    component.generateForms();
    component.updateName(0, 'Resume');
    component.updateMaxSize(0, '10');
    component.toggleFileType(0, 'PDF', true);

    expect(component.isFormValid()).toBe(true);

    component.continue();

    expect(wizard.savePublicDocuments).toHaveBeenCalledWith({ documents: component.documents() });
    expect(router.navigate).toHaveBeenCalledWith(['/new-solo-project/public', 'new-project', 'decision']);
  });

  it('blocks invalid document counts and invalid documents', () => {
    component.documentCount.set(51);
    component.generateForms();
    expect(component.formsGenerated()).toBe(false);

    component.documentCount.set(1);
    component.generateForms();
    component.updateName(0, 'Resume');
    component.updateMaxSize(0, '0');
    component.toggleFileType(0, 'PDF', true);

    component.continue();

    expect(component.isFormValid()).toBe(false);
    expect(wizard.savePublicDocuments).not.toHaveBeenCalled();
  });

  it('preserves existing document data when adding more forms', () => {
    const existing = [
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
      { name: 'Cover Letter', fileTypes: ['DOCX'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
    ];
    component.documents.set(existing);
    component.documentCount.set(4);

    component.generateForms();

    expect(component.documents().slice(0, 2)).toEqual(existing);
    expect(component.documents()).toHaveLength(4);
  });

  it('cancels the project and returns to the project landing page', () => {
    component.cancelProject();

    expect(wizard.cancelProject).toHaveBeenCalledOnce();
    expect(wizard.reset).toHaveBeenCalledOnce();
    expect(router.navigate).toHaveBeenCalledWith(['/left-menu-new-solo-project-landing']);
  });
});

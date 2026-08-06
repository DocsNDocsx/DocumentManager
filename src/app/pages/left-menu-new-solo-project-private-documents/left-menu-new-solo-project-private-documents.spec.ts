import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateDocumentsComponent } from './left-menu-new-solo-project-private-documents';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPrivateDocumentsComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateDocumentsComponent;
  let fixture: ComponentFixture<LeftMenuNewSoloProjectPrivateDocumentsComponent>;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(3),
      projectId: signal('project-1'),
      project: signal<any>({ documents: [] }),
      loadDraft: vi.fn(() => of({})),
      saveDocuments: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateDocumentsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateDocumentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('generates document requirement forms and validates each field', () => {
    component.documentCount.set(2);
    component.generateForms();

    expect(component.documents().length).toBe(2);
    expect(component.isFormValid()).toBe(false);

    component.updateName(0, 'Resume');
    component.updateMaxSize(0, '10');
    component.toggleFileType(0, 'PDF', true);
    component.updateName(1, 'Transcript');
    component.updateMaxSize(1, '5');
    component.toggleFileType(1, 'DOCX', true);

    expect(component.isFileTypeChecked(1, 'DOCX')).toBe(true);
    expect(component.isFormValid()).toBe(true);
  });

  it('handles template uploads, unit updates, and removals', () => {
    component.documentCount.set(2);
    component.generateForms();

    component.updateSizeUnit(0, 'KB');
    component.handleTemplateUpload(0, { target: { files: [new File(['x'], 'template.pdf')] } } as unknown as Event);

    expect(component.documents()[0].sizeUnit).toBe('KB');
    expect(component.documents()[0].templateName).toBe('template.pdf');

    component.removeTemplate(0);
    component.removeDocument(1);
    component.removeDocument(0);

    expect(component.documents()[0].templateName).toBe('');
    expect(component.documents().length).toBe(1);
  });

  it('does not generate forms outside the allowed range', () => {
    component.documentCount.set(0);
    component.generateForms();
    expect(component.formsGenerated()).toBe(false);

    component.documentCount.set(51);
    component.generateForms();
    expect(component.formsGenerated()).toBe(false);
  });

  it('preserves existing document data when increasing the document count', () => {
    const existing = [
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: 'resume-template.pdf' },
      { name: 'Cover Letter', fileTypes: ['DOCX'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
    ];
    component.documents.set(existing);
    component.documentCount.set(4);

    component.generateForms();

    expect(component.documents().slice(0, 2)).toEqual(existing);
    expect(component.documents()).toHaveLength(4);
    expect(component.documents()[2].name).toBe('');
    expect(component.documents()[3].name).toBe('');
  });

  it('allows unpaid documents to be removed down to the paid count', () => {
    const paid = [
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
      { name: 'Cover Letter', fileTypes: ['DOCX'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
    ];
    wizard.project.set({
      status: 'active',
      documents: [...paid,
        { name: 'Transcript', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
        { name: 'Portfolio', fileTypes: ['PDF'], maxSize: '20', sizeUnit: 'MB', templateName: '' },
      ],
      pendingBillingUpgrade: { collaborators: [], documents: paid, assignments: {}, deadline: null, expectedCollaborators: null },
    });
    component.ngOnInit();

    component.removeDocument(3);
    component.removeDocument(2);
    expect(component.documents().filter(d => d.status !== 'inactive')).toEqual(paid);
    expect(component.documents().filter(d => d.status === 'inactive')).toHaveLength(2);

    component.removeDocument(1);
    expect(component.activeDocumentCount()).toBe(1);
  });

  it('saves valid documents and navigates to assignments', () => {
    component.documents.set([
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
    ]);

    component.continue();

    expect(wizard.saveDocuments).toHaveBeenCalledWith({ documents: component.documents() });
    expect(router.navigate).toHaveBeenCalledWith(['../assignments'], expect.anything());
  });
});

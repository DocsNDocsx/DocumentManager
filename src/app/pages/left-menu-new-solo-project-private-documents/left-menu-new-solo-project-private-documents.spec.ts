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

  it('saves valid documents and navigates to assignments', () => {
    component.documents.set([
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
    ]);

    component.continue();

    expect(wizard.saveDocuments).toHaveBeenCalledWith({ documents: component.documents() });
    expect(router.navigate).toHaveBeenCalledWith(['../assignments'], expect.anything());
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import {
  LeftMenuNewTeamProjectPublicDocumentsComponent,
  TEAM_FILE_TYPES,
} from './left-menu-new-team-project-public-documents';

describe('LeftMenuNewTeamProjectPublicDocumentsComponent', () => {
  let component: LeftMenuNewTeamProjectPublicDocumentsComponent;
  let fixture: ComponentFixture<LeftMenuNewTeamProjectPublicDocumentsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPublicDocumentsComponent, RouterModule.forRoot([])],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LeftMenuNewTeamProjectPublicDocumentsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start with documentCount of 1 and no generated forms', () => {
    expect(component.documentCount()).toBe(1);
    expect(component.formsGenerated()).toBe(false);
    expect(component.documents().length).toBe(0);
  });

  it('should be invalid before forms are generated', () => {
    expect(component.isFormValid()).toBe(false);
  });

  describe('with 5 required documents', () => {
    beforeEach(() => {
      component.documentCount.set(5);
      component.generateForms();
    });

    it('should generate exactly 5 document forms', () => {
      expect(component.documents().length).toBe(5);
      expect(component.formsGenerated()).toBe(true);
    });

    it('should initialize each document with empty fields', () => {
      component.documents().forEach(doc => {
        expect(doc.name).toBe('');
        expect(doc.fileTypes).toEqual([]);
        expect(doc.maxSize).toBe('');
        expect(doc.sizeUnit).toBe('MB');
        expect(doc.templateName).toBe('');
      });
    });

    it('should be invalid when documents have empty fields', () => {
      expect(component.isFormValid()).toBe(false);
    });

    it('should be valid when all 5 documents are fully filled', () => {
      const docNames = ['Resume', 'Cover Letter', 'Transcript', 'Reference Letter', 'Writing Sample'];

      docNames.forEach((name, i) => {
        component.updateName(i, name);
        component.updateMaxSize(i, '10');
        component.toggleFileType(i, 'PDF', true);
      });

      expect(component.isFormValid()).toBe(true);
    });

    it('should be invalid if any one of the 5 documents is missing a name', () => {
      for (let i = 0; i < 5; i++) {
        component.updateName(i, `Document ${i + 1}`);
        component.updateMaxSize(i, '5');
        component.toggleFileType(i, 'PDF', true);
      }

      component.updateName(2, '');

      expect(component.isFormValid()).toBe(false);
    });

    it('should be invalid if any document is missing file types', () => {
      for (let i = 0; i < 5; i++) {
        component.updateName(i, `Document ${i + 1}`);
        component.updateMaxSize(i, '5');
        component.toggleFileType(i, 'PDF', true);
      }

      component.toggleFileType(4, 'PDF', false);

      expect(component.isFormValid()).toBe(false);
    });

    it('should be invalid if any document is missing max size', () => {
      for (let i = 0; i < 5; i++) {
        component.updateName(i, `Document ${i + 1}`);
        component.updateMaxSize(i, '10');
        component.toggleFileType(i, 'DOCX', true);
      }

      component.updateMaxSize(0, '');

      expect(component.isFormValid()).toBe(false);
    });

    it('should update file types via toggleFileType', () => {
      component.toggleFileType(0, 'PDF', true);
      expect(component.isFileTypeChecked(0, 'PDF')).toBe(true);

      component.toggleFileType(0, 'PDF', false);
      expect(component.isFileTypeChecked(0, 'PDF')).toBe(false);
    });

    it('should update size unit for a document', () => {
      component.updateSizeUnit(1, 'KB');
      expect(component.documents()[1].sizeUnit).toBe('KB');
    });

    it('should remove a document when more than one exists', () => {
      component.removeDocument(2);
      expect(component.documents().length).toBe(4);
    });

    it('should not remove the last remaining document', () => {
      component.documentCount.set(1);
      component.generateForms();
      component.removeDocument(0);
      expect(component.documents().length).toBe(1);
    });

    it('should set template name on upload', () => {
      const mockFile = new File(['tpl'], 'template.pdf', { type: 'application/pdf' });
      const event = { target: { files: [mockFile] } } as unknown as Event;

      component.handleTemplateUpload(1, event);

      expect(component.documents()[1].templateName).toBe('template.pdf');
    });

    it('should clear template name on removeTemplate', () => {
      component.documents.update(list => {
        const copy = [...list];
        copy[0] = { ...copy[0], templateName: 'existing.pdf' };
        return copy;
      });

      component.removeTemplate(0);

      expect(component.documents()[0].templateName).toBe('');
    });
  });

  it('should not generate forms for count below 1', () => {
    component.documentCount.set(0);
    component.generateForms();
    expect(component.documents().length).toBe(0);
    expect(component.formsGenerated()).toBe(false);
  });

  it('should not generate forms for count above 50', () => {
    component.documentCount.set(51);
    component.generateForms();
    expect(component.documents().length).toBe(0);
    expect(component.formsGenerated()).toBe(false);
  });

  it('should expose the expected file types', () => {
    expect(component.fileTypes).toEqual(TEAM_FILE_TYPES);
    expect(component.fileTypes).toContain('PDF');
    expect(component.fileTypes).toContain('DOCX');
  });

  it('should toggle dropdown open and close', () => {
    expect(component.dropdownOpen()).toBe(false);

    const event = new MouseEvent('click');
    component.toggleDropdown(event);
    expect(component.dropdownOpen()).toBe(true);

    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);
  });
});

import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewSoloProjectPublicDocumentsComponent } from './left-menu-new-solo-project-public-documents';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewSoloProjectPublicDocumentsComponent', () => {
  let component: LeftMenuNewSoloProjectPublicDocumentsComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      projectId: signal('new-project'),
      project: signal<any>({ documents: [] }),
      savePublicDocuments: vi.fn(() => of({ id: 'new-project' })),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPublicDocumentsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewSoloProjectPublicDocumentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
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
});

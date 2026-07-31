import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';

import { LeftMenuNewTeamProjectPrivateDocumentsComponent } from './left-menu-new-team-project-private-documents';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { AuthService } from '../../services/auth.service';

describe('LeftMenuNewTeamProjectPrivateDocumentsComponent', () => {
  let component: LeftMenuNewTeamProjectPrivateDocumentsComponent;
  let wizard: any;
  let router: any;

  beforeEach(async () => {
    wizard = {
      projectId: signal('team-project-1'),
      project: signal<any>({ documents: [] }),
      isSaving: signal(false),
      saveDocuments: vi.fn(() => of({})),
      reset: vi.fn(),
    };
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewTeamProjectPrivateDocumentsComponent],
      providers: [
        { provide: TeamProjectWizardService, useValue: wizard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { snapshot: {}, parent: { snapshot: { paramMap: { get: () => null } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateDocumentsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  });

  it('generates, validates, edits templates, and saves documents', () => {
    component.documentCount.set(1);
    component.generateForms();
    component.updateName(0, 'Resume');
    component.updateMaxSize(0, '10');
    component.updateSizeUnit(0, 'KB');
    component.toggleFileType(0, 'PDF', true);
    component.handleTemplateUpload(0, { target: { files: [new File(['x'], 'template.pdf')] } } as unknown as Event);

    expect(component.isFormValid()).toBe(true);
    expect(component.documents()[0].templateName).toBe('template.pdf');

    component.continue();

    expect(wizard.saveDocuments).toHaveBeenCalledWith(component.documents());
    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/assignments']);
  });

  it('redirects when no project exists and does not save invalid documents', () => {
    component.documents.set([]);
    component.continue();
    expect(wizard.saveDocuments).not.toHaveBeenCalled();

    wizard.projectId.set(null);
    const fixture = TestBed.createComponent(LeftMenuNewTeamProjectPrivateDocumentsComponent);
    fixture.componentInstance.ngOnInit();
    expect(router.navigate).toHaveBeenCalledWith(['/new-team-project/private/details']);
  });
});

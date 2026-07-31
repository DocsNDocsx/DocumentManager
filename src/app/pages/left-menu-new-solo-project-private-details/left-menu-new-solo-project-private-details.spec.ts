import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LeftMenuNewSoloProjectPrivateDetailsComponent } from './left-menu-new-solo-project-private-details';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { AuthService } from '../../services/auth.service';

function fileList(files: File[]): FileList {
  const list: Record<string | number | symbol, unknown> = {
    length: files.length,
    item: (i: number) => files[i],
    [Symbol.iterator]: function* () { yield* files; },
  };
  files.forEach((file, index) => {
    list[index] = file;
  });
  return list as unknown as FileList;
}

describe('LeftMenuNewSoloProjectPrivateDetailsComponent', () => {
  let component: LeftMenuNewSoloProjectPrivateDetailsComponent;
  let fixture: ComponentFixture<LeftMenuNewSoloProjectPrivateDetailsComponent>;
  let wizard: any;
  let router: any;
  let uploader: any;
  let routeProjectId: string | null;

  beforeEach(async () => {
    wizard = {
      isSaving: signal(false),
      completedStep: signal(1),
      projectId: signal('project-1'),
      project: signal<any>({
        id: 'project-1',
        name: 'Existing Project',
        description: 'Existing description',
        deadline: '2026-09-15T00:00:00.000Z',
        attachments: [{ name: 'old.pdf', size: '1 KB', iconClass: 'fa-file-pdf' }],
      }),
      loadDraft: vi.fn(() => of({})),
      saveDetails: vi.fn(() => of({})),
      saveDraft: vi.fn(() => of({})),
      reset: vi.fn(() => wizard.project.set(null)),
    };
    routeProjectId = 'project-1';
    router = { navigate: vi.fn(), events: of({}), createUrlTree: vi.fn(() => ({})), serializeUrl: vi.fn(() => ''), isActive: vi.fn(() => false) };
    uploader = {
      upload: vi.fn(() => of({
        name: 'brief.pdf',
        size: '1 KB',
        iconClass: 'fa-file-pdf',
        url: 'https://blob.example.com/brief.pdf',
      })),
    };

    await TestBed.configureTestingModule({
      imports: [LeftMenuNewSoloProjectPrivateDetailsComponent],
      providers: [
        { provide: ProjectWizardService, useValue: wizard },
        { provide: ProjectAttachmentUploadService, useValue: uploader },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { parent: { snapshot: { paramMap: { get: () => routeProjectId } } } } },
        { provide: AuthService, useValue: { currentUserId: signal('123'), currentUserFirstname: signal(''), currentUserLastname: signal(''), currentUserEmail: signal(''), currentUserAvatar: signal('') } },
      ],
    }).compileComponents();

    createComponent();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(LeftMenuNewSoloProjectPrivateDetailsComponent);
    component = fixture.componentInstance;
    component.ngOnInit();
  }

  it('resets stale wizard state on a new private project route', () => {
    routeProjectId = null;
    createComponent();

    expect(wizard.reset).toHaveBeenCalled();
    expect(component.projectName()).toBe('');
    expect(component.projectDeadline()).toBe('');
  });

  it('populates existing draft details and normalizes the deadline display', () => {
    expect(component.projectName()).toBe('Existing Project');
    expect(component.projectDeadline()).toBe('2026-09-15');
    expect(component.uploadedFiles()[0].name).toBe('old.pdf');
    expect(component.isFormValid()).toBe(true);
  });

  it('uploads new files, ignores duplicates, blocks oversized files, and removes files', () => {
    (component as any).handleFiles(fileList([
      new File(['x'], 'brief.pdf', { type: 'application/pdf' }),
      new File(['x'], 'old.pdf', { type: 'application/pdf' }),
      new File([new ArrayBuffer(51 * 1024 * 1024)], 'too-large.pdf'),
    ]));

    expect(uploader.upload).toHaveBeenCalledTimes(1);
    expect(uploader.upload).toHaveBeenCalledWith(expect.any(File), 'solo');
    expect(component.uploadedFiles().map(f => f.name)).toEqual(['old.pdf', 'brief.pdf']);
    expect(component.toastMsg()).toBe('too-large.pdf is larger than 50 MB');

    component.removeFile(0);
    expect(component.uploadedFiles()[0].name).toBe('brief.pdf');
  });

  it('handles upload failures and drag/drop state', () => {
    uploader.upload.mockReturnValueOnce(throwError(() => new Error('upload failed')));

    (component as any).handleFiles(fileList([new File(['x'], 'bad.pdf')]));
    component.onDragOver({ preventDefault: vi.fn() } as unknown as DragEvent);
    expect(component.isDragOver()).toBe(true);
    component.onDragLeave({ preventDefault: vi.fn() } as unknown as DragEvent);

    expect(component.toastMsg()).toBe('Failed to upload bad.pdf');
    expect(component.isUploading()).toBe(false);
    expect(component.isDragOver()).toBe(false);
  });

  it('saves valid details and navigates to collaborators', () => {
    component.continue();

    expect(wizard.saveDetails).toHaveBeenCalledWith({
      name: 'Existing Project',
      description: 'Existing description',
      deadline: '2026-09-15',
      attachments: component.uploadedFiles(),
    });
    expect(router.navigate).toHaveBeenCalledWith(['../collaborators'], expect.anything());
  });

  it('does not save while invalid or uploading', () => {
    component.projectName.set('');
    component.continue();
    expect(wizard.saveDetails).not.toHaveBeenCalled();

    component.projectName.set('Project');
    component.isUploading.set(true);
    component.continue();
    expect(wizard.saveDetails).not.toHaveBeenCalled();
  });
});

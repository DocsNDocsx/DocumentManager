import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { RouterModule } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { CollaboratorViewComponent } from './collaborator-view';
import { LoggingService } from '../../services/logging.service';
import { environment } from '../../../environments/environment';
import { Project } from '../../models/project.models';

describe('CollaboratorViewComponent', () => {
  let fixture: ComponentFixture<CollaboratorViewComponent>;
  let component: CollaboratorViewComponent;
  let http: HttpTestingController;

  const project: Project = {
    id: 'project-1',
    userId: 'owner-1',
    name: 'Public Project',
    description: null,
    deadline: '2026-09-15',
    attachments: [],
    collaborators: [{ firstName: 'Join', lastName: 'User', email: 'join@example.com', affiliation: 'Org' }],
    documents: [
      { name: 'Resume', fileTypes: ['PDF'], maxSize: '5', sizeUnit: 'MB', templateName: '' },
      { name: 'Transcript', fileTypes: ['PDF'], maxSize: '10', sizeUnit: 'MB', templateName: '' },
    ],
    assignments: {},
    staff: null,
    expectedCollaborators: 10,
    projectCode: 'PRJ-ABCD-2345',
    completedStep: 6,
    status: 'active',
    type: 'public',
    createdAt: '2026-07-31T00:00:00.000Z',
    updatedAt: '2026-07-31T00:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CollaboratorViewComponent, RouterModule.forRoot([])],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: {
                get: (key: string) => key === 'projectId' ? 'project-1' : '0',
              },
            },
          },
        },
        {
          provide: LoggingService,
          useValue: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(CollaboratorViewComponent);
    component = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
  });

  it('shows all document upload slots for public projects without assignments', () => {
    fixture.detectChanges();

    http.expectOne(`${environment.apiUrl}/projects/project-1`)
      .flush({ success: true, project });
    http.expectOne(`${environment.apiUrl}/projects/project-1/submissions?collabIndex=0`)
      .flush({ success: true, submissions: [] });

    expect(component.totalCount()).toBe(2);
    expect(component.documents().map(d => d.title)).toEqual(['Resume', 'Transcript']);
  });

  it('hides storage-provider details when secure upload token generation fails', () => {
    const originalProduction = environment.production;
    environment.production = true;
    component.projectId.set('project-1');
    component.collabIndex.set(0);
    component.documents.set([{
      docIndex: 0,
      title: 'Resume',
      maxSize: '5 MB',
      acceptedFormats: ['PDF'],
      status: 'required',
      selectedFile: new File(['pdf'], 'resume.pdf', { type: 'application/pdf' }),
      uploading: false,
    }]);

    component.uploadDocument(0);

    const request = http.expectOne(`${environment.apiUrl}/projects/project-1/submissions/upload-token`);
    expect(request.request.body.type).toBe('blob.generate-client-token');
    request.flush(
      { success: false, message: 'Blob storage is not configured for this environment' },
      { status: 400, statusText: 'Bad Request' },
    );

    expect(component.uploadError()).toBe('Document upload could not be completed. Please try again.');
    expect(component.toastVisible()).toBe(true);
    expect(component.toastMsg()).toBe('Document upload could not be completed. Please try again.');
    environment.production = originalProduction;
  });

  it('downloads the submitted document when View Submitted is selected', () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:submitted-document');
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    component.projectId.set('project-1');
    const submittedDocument = {
      docIndex: 0,
      title: 'Resume',
      maxSize: '5 MB',
      acceptedFormats: ['PDF'],
      status: 'submitted' as const,
      submissionId: 'submission-1',
      submittedFileName: 'resume.pdf',
      selectedFile: null,
      uploading: false,
    };

    component.viewSubmittedDocument(submittedDocument);
    http.expectOne(`${environment.apiUrl}/projects/project-1/submissions/submission-1/download`)
      .flush(new Blob(['pdf'], { type: 'application/pdf' }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:submitted-document');
  });
});

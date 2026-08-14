import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { ProjectAttachmentUploadService } from './project-attachment-upload.service';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

describe('ProjectAttachmentUploadService', () => {
  let service: ProjectAttachmentUploadService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { getToken: () => 'test-token' } },
      ],
    });
    service = TestBed.inject(ProjectAttachmentUploadService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uploads project files as FormData with scope and file', () => {
    const file = new File(['hello'], 'brief.pdf', { type: 'application/pdf' });
    let result: any;

    service.upload(file, 'solo').subscribe(res => (result = res));

    const req = http.expectOne(`${environment.apiUrl}/project-attachments`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect(req.request.body.get('scope')).toBe('solo');
    expect(req.request.body.get('file')).toBe(file);

    req.flush({
      success: true,
      attachment: {
        name: 'brief.pdf',
        size: 1536,
        mimeType: 'application/pdf',
        url: 'https://blob.example.com/brief.pdf',
      },
    });

    expect(result).toEqual({
      name: 'brief.pdf',
      size: '1.5 KB',
      iconClass: 'fa-file-pdf',
      url: 'https://blob.example.com/brief.pdf',
      bytes: 1536,
      mimeType: 'application/pdf',
    });
  });

  it('maps common extensions and byte sizes into display metadata', () => {
    const cases = [
      { name: 'avatar.png', size: 512, expectedSize: '512 B', icon: 'fa-file-image' },
      { name: 'sheet.xlsx', size: 1048576, expectedSize: '1 MB', icon: 'fa-file-excel' },
      { name: 'archive.zip', size: 10485760, expectedSize: '10 MB', icon: 'fa-file-archive' },
      { name: 'unknown.bin', size: 2048, expectedSize: '2 KB', icon: 'fa-file' },
    ];

    cases.forEach((item, index) => {
      let result: any;
      service.upload(new File(['x'], item.name), 'team').subscribe(res => (result = res));

      http.expectOne(`${environment.apiUrl}/project-attachments`).flush({
        success: true,
        attachment: {
          name: item.name,
          size: item.size,
          mimeType: 'application/octet-stream',
          url: `https://blob.example.com/${index}`,
        },
      });

      expect(result.size).toBe(item.expectedSize);
      expect(result.iconClass).toBe(item.icon);
    });
  });
});

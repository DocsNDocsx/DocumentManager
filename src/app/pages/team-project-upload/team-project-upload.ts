import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LoggingService } from '../../services/logging.service';
import { LogoComponent } from '../../shared/logo/logo';

type DocStatus = 'required' | 'submitted' | 'revision';

interface DocumentRequirement {
  name: string;
  fileTypes: string[];
  maxSize: string;
  sizeUnit: string;
}

interface DocumentSlot {
  docIndex: number;
  title: string;
  maxSize: string;
  acceptedFormats: string[];
  status: DocStatus;
  submissionId?: string;
  submittedFileName?: string;
  submittedAt?: string;
  feedback?: string;
  selectedFile: File | null;
  uploading: boolean;
}

interface UploadProjectInfo {
  id: string;
  name: string;
  teamName: string;
  deadline: string | null;
  documents: DocumentRequirement[];
}

interface UploadCollaboratorInfo {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
}

interface UploadSubmission {
  id: string;
  documentIndex: number;
  fileName: string;
  fileSize: number;
  status: 'submitted' | 'approved' | 'revision';
  feedback: string | null;
  submittedAt: string;
}

@Component({
  selector: 'app-team-project-upload',
  templateUrl: './team-project-upload.html',
  styleUrl: './team-project-upload.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LogoComponent],
})
export class TeamProjectUploadComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  projectId = signal('');
  collaboratorId = signal('');
  project = signal<UploadProjectInfo | null>(null);
  collaborator = signal<UploadCollaboratorInfo | null>(null);
  documents = signal<DocumentSlot[]>([]);
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  showSuccessModal = signal(false);

  collaboratorName = computed(() => {
    const c = this.collaborator();
    if (!c) return 'Collaborator';
    return `${c.firstName} ${c.lastName}`;
  });

  collaboratorInitials = computed(() => {
    const c = this.collaborator();
    if (!c) return 'U';
    return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase();
  });

  formattedDeadline = computed(() => {
    const d = this.project()?.deadline;
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  });

  submittedCount = computed(() => this.documents().filter(d => d.status === 'submitted').length);
  totalCount = computed(() => this.documents().length);
  progressPercent = computed(() =>
    this.totalCount() === 0 ? 0 : Math.round((this.submittedCount() / this.totalCount()) * 100)
  );

  private readonly fileTypeMap: Record<string, string> = {
    PDF: '.pdf', DOCX: '.docx', DOC: '.doc',
    XLSX: '.xlsx', XLS: '.xls',
    JPG: '.jpg,.jpeg', JPEG: '.jpg,.jpeg', PNG: '.png',
    TXT: '.txt', CSV: '.csv', PPT: '.ppt', PPTX: '.pptx',
  };

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const collaboratorId = this.route.snapshot.paramMap.get('collaboratorId') ?? '';
    this.projectId.set(projectId);
    this.collaboratorId.set(collaboratorId);
    this.loadData(projectId, collaboratorId);
  }

  private loadData(projectId: string, collaboratorId: string): void {
    if (!collaboratorId) {
      this.loadError.set('Invalid upload link.');
      this.isLoading.set(false);
      return;
    }

    this.http.get<{
      success: boolean;
      project: UploadProjectInfo;
      collaborator: UploadCollaboratorInfo;
      submissions: UploadSubmission[];
    }>(`${environment.apiUrl}/teams/projects/${projectId}/upload-info/${collaboratorId}`).subscribe({
      next: res => {
        this.project.set(res.project);
        this.collaborator.set(res.collaborator);
        this.buildDocuments(res.project.documents, res.submissions);
        this.isLoading.set(false);
        this.logger.info('Team upload info loaded', { projectId });
      },
      error: err => {
        this.loadError.set(err?.error?.message ?? 'Failed to load project');
        this.isLoading.set(false);
        this.logger.error('Failed to load team upload info', err);
      },
    });
  }

  private buildDocuments(docs: DocumentRequirement[], submissions: UploadSubmission[]): void {
    const slots: DocumentSlot[] = docs.map((doc, idx) => {
      const sub = submissions.find(s => s.documentIndex === idx);
      return {
        docIndex: idx,
        title: doc.name,
        maxSize: `${doc.maxSize} ${doc.sizeUnit}`,
        acceptedFormats: doc.fileTypes,
        status: (sub?.status as DocStatus) ?? 'required',
        submissionId: sub?.id,
        submittedFileName: sub?.fileName,
        submittedAt: sub?.submittedAt
          ? new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : undefined,
        feedback: sub?.feedback ?? undefined,
        selectedFile: null,
        uploading: false,
      };
    });
    this.documents.set(slots);
  }

  getAcceptAttr(formats: string[]): string {
    return formats
      .flatMap(f => (this.fileTypeMap[f] ?? '').split(','))
      .filter(Boolean)
      .join(',');
  }

  onFileSelected(event: Event, docIdx: number): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, selectedFile: file } : d));
  }

  removeFile(docIdx: number): void {
    this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, selectedFile: null } : d));
    const input = document.getElementById(`file-${docIdx}`) as HTMLInputElement | null;
    if (input) input.value = '';
  }

  getSelectedFileName(docIdx: number): string {
    return this.documents().find(d => d.docIndex === docIdx)?.selectedFile?.name ?? '';
  }

  getSelectedFileSize(docIdx: number): string {
    const size = this.documents().find(d => d.docIndex === docIdx)?.selectedFile?.size;
    if (!size) return '';
    if (size < 1024) return `${size} Bytes`;
    if (size < 1024 * 1024) return `${Math.round(size / 1024 * 100) / 100} KB`;
    return `${Math.round(size / (1024 * 1024) * 100) / 100} MB`;
  }

  triggerFileInput(docIdx: number): void {
    (document.getElementById(`file-${docIdx}`) as HTMLInputElement | null)?.click();
  }

  uploadDocument(docIdx: number): void {
    const doc = this.documents().find(d => d.docIndex === docIdx);
    if (!doc?.selectedFile) return;

    this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, uploading: true } : d));

    const formData = new FormData();
    formData.append('file', doc.selectedFile);
    formData.append('collaboratorId', this.collaboratorId());
    formData.append('docIndex', String(docIdx));

    this.http.post<{ success: boolean; submission: UploadSubmission }>(
      `${environment.apiUrl}/teams/projects/${this.projectId()}/submissions`,
      formData
    ).subscribe({
      next: res => {
        const sub = res.submission;
        this.documents.update(docs => docs.map(d => {
          if (d.docIndex !== docIdx) return d;
          return {
            ...d,
            status: 'submitted' as DocStatus,
            uploading: false,
            selectedFile: null,
            submissionId: sub.id,
            submittedFileName: sub.fileName,
            submittedAt: new Date(sub.submittedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            feedback: undefined,
          };
        }));
        this.showSuccessModal.set(true);
        this.logger.info('Team document uploaded', { docIdx, projectId: this.projectId() });
      },
      error: err => {
        this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, uploading: false } : d));
        this.logger.error('Team document upload failed', err);
      },
    });
  }

  getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
      xlsx: 'fa-file-excel', xls: 'fa-file-excel',
    };
    return map[ext ?? ''] ?? 'fa-file-alt';
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
  }

  goBack(): void {
    this.router.navigate(['/team-projects']);
  }
}

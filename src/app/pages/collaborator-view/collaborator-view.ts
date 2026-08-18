import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Project, ProjectAttachment, Submission } from '../../models/project.models';
import { LoggingService } from '../../services/logging.service';
import { put } from '@vercel/blob/client';
import { from, switchMap } from 'rxjs';
import { LogoComponent } from '../../shared/logo/logo';

type DocStatus = 'required' | 'submitted' | 'approved' | 'revision' | 'rejected';

interface DocumentSlot {
  docIndex: number;       // position in project.documents[] — used as the stable key
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
  templateName?: string;
  templateUrl?: string;
}

@Component({
  selector: 'app-collaborator-view',
  templateUrl: './collaborator-view.html',
  styleUrl: './collaborator-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, LogoComponent],
})
export class CollaboratorViewComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  projectId = signal('');
  collabIndex = signal(0);
  project = signal<Project | null>(null);
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  showSuccessModal = signal(false);
  uploadError = signal<string | null>(null);
  toastMsg = signal('');
  toastVisible = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  documents = signal<DocumentSlot[]>([]);
  projectFiles = computed(() => this.project()?.attachments ?? []);

  collaboratorName = computed(() => {
    const p = this.project();
    const idx = this.collabIndex();
    if (!p?.collaborators?.[idx]) return 'Collaborator';
    const c = p.collaborators[idx];
    return `${c.firstName} ${c.lastName}`;
  });

  collaboratorInitials = computed(() => {
    const p = this.project();
    const idx = this.collabIndex();
    if (!p?.collaborators?.[idx]) return 'U';
    const c = p.collaborators[idx];
    return `${c.firstName[0]}${c.lastName[0]}`.toUpperCase();
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

  // Maps the app's document type labels (e.g. 'DOCX') to the extensions the
  // HTML <input accept> attribute expects. JPG maps to both .jpg and .jpeg
  // because browsers may report either extension for the same image type.
  private readonly fileTypeMap: Record<string, string> = {
    PDF: '.pdf',
    DOCX: '.docx',
    DOC: '.doc',
    XLSX: '.xlsx',
    XLS: '.xls',
    JPG: '.jpg,.jpeg',
    JPEG: '.jpg,.jpeg',
    PNG: '.png',
    TXT: '.txt',
    CSV: '.csv',
    PPT: '.ppt',
    PPTX: '.pptx',
  };

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('projectId') ?? '';
    const collabIndex = Number(this.route.snapshot.paramMap.get('collabIndex') ?? '0');
    this.projectId.set(projectId);
    this.collabIndex.set(collabIndex);
    this.loadData(projectId, collabIndex);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  private showErrorToast(message: string): void {
    this.toastMsg.set(message);
    this.toastVisible.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 4000);
  }

  private uploadErrorMessage(err: any): string {
    const rawMessage = String(err?.error?.message ?? err?.message ?? '');
    if (/vercel|blob|storage|store|conflict|already exists|pathname/i.test(rawMessage)) {
      return 'Document upload could not be completed. Please try again.';
    }
    return rawMessage || 'Document upload failed. Please try again.';
  }

  private loadData(projectId: string, collabIndex: number): void {
    this.isLoading.set(true);
    this.logger.debug('Loading collaborator view', { projectId, collabIndex });
    this.http.get<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects/${projectId}`).subscribe({
      next: projectRes => {
        this.project.set(projectRes.project);
        this.logger.debug('Project loaded for collaborator view', { projectId });
        // Submissions are fetched after the project so we can cross-reference
        // document indices. If the submissions call fails we still show all
        // document slots as 'required' rather than breaking the page entirely.
        this.http.get<{ success: boolean; submissions: Submission[] }>(
          `${environment.apiUrl}/projects/${projectId}/submissions?collabIndex=${collabIndex}`
        ).subscribe({
          next: subRes => {
            this.buildDocuments(projectRes.project, collabIndex, subRes.submissions);
            this.isLoading.set(false);
            this.logger.info('Collaborator view loaded', { projectId, submissionCount: subRes.submissions.length });
          },
          error: (err) => {
            this.logger.warn('Submissions load failed, showing empty slots', err);
            this.buildDocuments(projectRes.project, collabIndex, []);
            this.isLoading.set(false);
          },
        });
      },
      error: err => {
        this.loadError.set(err?.error?.message ?? 'Failed to load project');
        this.isLoading.set(false);
        this.logger.error('Failed to load project for collaborator view', err);
      },
    });
  }

  private buildDocuments(project: Project, collabIndex: number, submissions: Submission[]): void {
    // assignments keys are always strings in JSON (e.g. "0", "1") even though
    // collabIndex arrives as a number — String() ensures the lookup matches.
    const assignedIndices: number[] = project.assignments?.[String(collabIndex)] ?? [];
    const documentIndices = project.type === 'public' && assignedIndices.length === 0
      ? project.documents.map((_, index) => index)
      : assignedIndices;
    const activeDocumentIndices = documentIndices.filter(index => project.documents[index]?.status !== 'inactive');
    const slots: DocumentSlot[] = activeDocumentIndices.map(docIdx => {
      const pd = project.documents[docIdx];
      const sub = submissions.find(s => s.document_index === docIdx);
      return {
        docIndex: docIdx,
        title: pd.name,
        maxSize: `${pd.maxSize} ${pd.sizeUnit}`,
        acceptedFormats: pd.fileTypes,
        status: (sub?.status as DocStatus) ?? 'required',
        submissionId: sub?.id,
        submittedFileName: sub?.file_name,
        submittedAt: sub?.submitted_at
          ? new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
          : undefined,
        feedback: sub?.feedback ?? undefined,
        selectedFile: null,
        uploading: false,
        templateName: pd.templateName || undefined,
        templateUrl: pd.templateUrl,
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
    // input.value must be cleared so that re-selecting the same file fires the
    // change event again — browsers suppress it if the value hasn't changed.
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

  uploadDocument(docIdx: number): void {
    const doc = this.documents().find(d => d.docIndex === docIdx);
    if (!doc?.selectedFile) return;

    this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, uploading: true } : d));
    this.uploadError.set(null);
    this.logger.info('Uploading document', { projectId: this.projectId(), docIdx, fileName: doc.selectedFile.name });

    const submissionUrl = `${environment.apiUrl}/projects/${this.projectId()}/submissions`;
    const uploadId = crypto.randomUUID();
    const pathname = `submissions/solo/${this.projectId()}/${this.collabIndex()}/doc-${docIdx}-${uploadId}-${doc.selectedFile.name}`;
    const clientPayload = JSON.stringify({ collabIndex: this.collabIndex(), docIndex: docIdx });
    const request$ = environment.production
      ? this.http.post<{ clientToken: string }>(`${submissionUrl}/upload-token`, {
          type: 'blob.generate-client-token',
          payload: { pathname, clientPayload, multipart: true },
        }).pipe(
          switchMap(tokenResponse => from(put(pathname, doc.selectedFile!, {
            access: 'private',
            token: tokenResponse.clientToken,
            multipart: true,
          }))),
          switchMap(blob => this.http.post<{ success: boolean; submission: Submission }>(submissionUrl, {
          blobUrl: blob.url,
          fileName: doc.selectedFile!.name,
          fileSize: doc.selectedFile!.size,
          fileType: doc.selectedFile!.type,
          collabIndex: this.collabIndex(),
          docIndex: docIdx,
        })))
      : (() => {
          const formData = new FormData();
          formData.append('file', doc.selectedFile!);
          formData.append('collabIndex', String(this.collabIndex()));
          formData.append('docIndex', String(docIdx));
          return this.http.post<{ success: boolean; submission: Submission }>(submissionUrl, formData);
        })();

    request$.subscribe({
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
            submittedFileName: sub.file_name,
            submittedAt: new Date(sub.submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
            feedback: undefined, // clear any prior revision feedback on re-submit
          };
        }));
        this.logger.info('Document uploaded successfully', { docIdx });
        this.showSuccessModal.set(true);
      },
      error: (err) => {
        this.logger.error('Document upload failed', err);
        const message = this.uploadErrorMessage(err);
        this.uploadError.set(message);
        this.showErrorToast(message);
        this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, uploading: false } : d));
      },
    });
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
  }

  downloadProjectFile(attachment: ProjectAttachment, attachmentIndex: number): void {
    this.http.get(
      `${environment.apiUrl}/projects/${this.projectId()}/attachments/${attachmentIndex}/download`,
      { responseType: 'blob' },
    ).subscribe({
      next: blob => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = attachment.name;
        link.click();
        URL.revokeObjectURL(objectUrl);
      },
      error: () => this.showErrorToast('Project file could not be downloaded. Please try again.'),
    });
  }

  downloadDocumentTemplate(doc: DocumentSlot): void {
    if (!doc.templateUrl) return;
    this.http.get(
      `${environment.apiUrl}/projects/${this.projectId()}/documents/${doc.docIndex}/template/download`,
      { responseType: 'blob' },
    ).subscribe({
      next: blob => {
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = doc.templateName || 'template';
        link.click();
        URL.revokeObjectURL(objectUrl);
      },
      error: () => this.showErrorToast('Document template could not be downloaded. Please try again.'),
    });
  }

  viewSubmittedDocument(doc: DocumentSlot): void {
    if (!doc.submissionId || !doc.submittedFileName) {
      this.showErrorToast('The submitted document is not available.');
      return;
    }

    this.http.get(
      `${environment.apiUrl}/projects/${this.projectId()}/submissions/${doc.submissionId}/download`,
      { responseType: 'blob' },
    ).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = doc.submittedFileName!;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      error: err => {
        this.logger.error('Failed to open submitted document', err);
        this.showErrorToast('Could not open the submitted document. Please try again.');
      },
    });
  }

  getFileIcon(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: 'fa-file-pdf',
      doc: 'fa-file-word',
      docx: 'fa-file-word',
      xlsx: 'fa-file-excel',
      xls: 'fa-file-excel',
    };
    return map[ext ?? ''] ?? 'fa-file-alt';
  }

  triggerFileInput(docIdx: number): void {
    (document.getElementById(`file-${docIdx}`) as HTMLInputElement | null)?.click();
  }
}

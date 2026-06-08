import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Project, Submission } from '../../models/project.models';
import { LoggingService } from '../../services/logging.service';

type DocStatus = 'required' | 'submitted' | 'revision';

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
}

@Component({
  selector: 'app-collaborator-view',
  templateUrl: './collaborator-view.html',
  styleUrl: './collaborator-view.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
})
export class CollaboratorViewComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  projectId = signal('');
  collabIndex = signal(0);
  project = signal<Project | null>(null);
  isLoading = signal(true);
  loadError = signal<string | null>(null);
  showSuccessModal = signal(false);
  documents = signal<DocumentSlot[]>([]);

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
    const slots: DocumentSlot[] = assignedIndices.map(docIdx => {
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
    this.logger.info('Uploading document', { projectId: this.projectId(), docIdx, fileName: doc.selectedFile.name });

    const formData = new FormData();
    formData.append('file', doc.selectedFile);
    formData.append('collabIndex', String(this.collabIndex()));
    formData.append('docIndex', String(docIdx));

    this.http.post<{ success: boolean; submission: Submission }>(
      `${environment.apiUrl}/projects/${this.projectId()}/submissions`,
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
        this.documents.update(docs => docs.map(d => d.docIndex === docIdx ? { ...d, uploading: false } : d));
      },
    });
  }

  closeSuccessModal(): void {
    this.showSuccessModal.set(false);
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

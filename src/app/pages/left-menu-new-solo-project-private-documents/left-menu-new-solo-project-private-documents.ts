import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';

export interface DocumentRequirement {
  name: string;
  fileTypes: string[];
  maxSize: string;
  sizeUnit: string;
  templateName: string;
  templateUrl?: string;
  templateSize?: string;
  templateMimeType?: string;
  status?: 'active' | 'inactive';
  removedAt?: string | null;
}

export const FILE_TYPES = ['PDF', 'DOCX', 'DOC', 'JPG', 'PNG', 'XLSX'];

@Component({
  selector: 'app-left-menu-new-solo-project-private-documents',
  templateUrl: './left-menu-new-solo-project-private-documents.html',
  styleUrl: './left-menu-new-solo-project-private-documents.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateDocumentsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  private attachmentUploadService = inject(ProjectAttachmentUploadService);
  readonly isActiveProject = computed(() => this.wizardService.project()?.status === 'active');
  dropdownOpen = signal(false);

  toastMsg = signal('');
  toastVisible = signal(false);
  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  private showToast(msg: string): void {
    this.toastMsg.set(msg);
    this.toastVisible.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 3000);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  documentCount = signal(1);
  minimumDocumentCount = signal(1);
  documents = signal<DocumentRequirement[]>([]);
  activeDocumentCount = computed(() => this.documents().filter(d => d.status !== 'inactive').length);
  formsGenerated = signal(false);
  uploadingTemplateIndices = signal<number[]>([]);
  isSaving = computed(() => this.wizardService.isSaving());

  readonly fileTypes = FILE_TYPES;

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision', 'Payment'];
    return labels.map((label, i) => ({
      label,
      state: i === 2 ? 'active' : i < done ? 'completed' : 'locked',
    }));
  });

  ngOnInit(): void {
    const id = this.route.parent?.snapshot.paramMap.get('projectId') ?? null;
    if (id && this.wizardService.projectId() !== id) {
      this.wizardService.loadDraft(id).subscribe(() => this.populateForm());
    } else {
      this.populateForm();
    }
  }

  private populateForm(): void {
    const proj = this.wizardService.project();
    if (proj && proj.documents.length > 0) {
      this.documents.set(proj.documents);
      this.documentCount.set(proj.documents.filter(d => d.status !== 'inactive').length);
      this.minimumDocumentCount.set(1);
      this.formsGenerated.set(true);
    }
  }

  isFormValid = computed(() => {
    const docs = this.documents().filter(d => d.status !== 'inactive');
    if (!docs.length) return false;
    return docs.every(d =>
      d.name.trim() !== '' &&
      d.fileTypes.length > 0 &&
      d.maxSize !== '' &&
      parseInt(d.maxSize) > 0
    );
  });


  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  generateForms(): void {
    const n = this.documentCount();
    const activeCount = this.activeDocumentCount();
    if (n < activeCount || n < 1 || n > 50) return;
    const existing = this.documents();
    const additions = Array.from({ length: n - activeCount }, () => ({
      name: '', fileTypes: [], maxSize: '', sizeUnit: 'MB', templateName: '', status: 'active' as const,
    }));
    this.documents.set([...existing, ...additions]);
    this.formsGenerated.set(true);
  }

  updateName(index: number, value: string): void {
    this.documents.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], name: value };
      return updated;
    });
  }

  updateMaxSize(index: number, value: string): void {
    this.documents.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], maxSize: value };
      return updated;
    });
  }

  updateSizeUnit(index: number, value: string): void {
    this.documents.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], sizeUnit: value };
      return updated;
    });
  }

  toggleFileType(docIndex: number, type: string, checked: boolean): void {
    this.documents.update(list => {
      const updated = [...list];
      const doc = { ...updated[docIndex] };
      doc.fileTypes = checked
        ? [...doc.fileTypes, type]
        : doc.fileTypes.filter(t => t !== type);
      updated[docIndex] = doc;
      return updated;
    });
  }

  isFileTypeChecked(docIndex: number, type: string): boolean {
    return this.documents()[docIndex]?.fileTypes.includes(type) ?? false;
  }

  handleTemplateUpload(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.uploadingTemplateIndices.update(indices => [...indices, index]);
    this.attachmentUploadService.upload(file, 'solo').subscribe({
      next: attachment => this.documents.update(list => {
        const updated = [...list];
        updated[index] = {
          ...updated[index],
          templateName: attachment.name,
          templateUrl: attachment.url,
          templateSize: attachment.size,
          templateMimeType: attachment.mimeType,
        };
        return updated;
      }),
      error: () => {
        this.uploadingTemplateIndices.update(indices => indices.filter(i => i !== index));
        this.showToast(`Failed to upload ${file.name}. Please try again.`);
      },
      complete: () => this.uploadingTemplateIndices.update(indices => indices.filter(i => i !== index)),
    });
    input.value = '';
  }

  isTemplateUploading(index: number): boolean {
    return this.uploadingTemplateIndices().includes(index);
  }

  removeTemplate(index: number): void {
    this.documents.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], templateName: '', templateUrl: undefined, templateSize: undefined, templateMimeType: undefined };
      return updated;
    });
  }

  removeDocument(index: number): void {
    if (this.activeDocumentCount() <= 1) return;
    if (this.isActiveProject()) {
      this.documents.update(list => list.map((document, i) => i === index
        ? { ...document, status: 'inactive', removedAt: new Date().toISOString() }
        : document));
    } else {
      this.documents.update(list => list.filter((_, i) => i !== index));
    }
    this.documentCount.set(this.activeDocumentCount());
  }

  trackByIndex(index: number): number {
    return index;
  }

  back(): void {
    this.router.navigate(['../collaborators'], { relativeTo: this.route });
  }

  cancel(): void {
    this.router.navigate(['/left-menu-new-solo-project-landing']);
  }

  saveAsDraft(): void {
    if (!this.isFormValid() || this.uploadingTemplateIndices().length > 0) return;
    this.wizardService.saveDocuments({ documents: this.documents() }).subscribe({
      next: () => this.showToast('Project saved as draft'),
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid() || this.uploadingTemplateIndices().length > 0) return;
    this.wizardService.saveDocuments({ documents: this.documents() }).subscribe({
      next: () => this.router.navigate(['../assignments'], { relativeTo: this.route }),
      error: () => {},
    });
  }
}

import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

export interface PublicDocumentRequirement {
  name: string;
  fileTypes: string[];
  maxSize: string;
  sizeUnit: string;
  templateName: string;
}

export const FILE_TYPES = ['PDF', 'DOCX', 'DOC', 'JPG', 'PNG', 'XLSX'];

@Component({
  selector: 'app-left-menu-new-solo-project-public-documents',
  templateUrl: './left-menu-new-solo-project-public-documents.html',
  styleUrl: './left-menu-new-solo-project-public-documents.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPublicDocumentsComponent implements OnInit, OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private wizardService = inject(ProjectWizardService);
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
  documents = signal<PublicDocumentRequirement[]>([]);
  formsGenerated = signal(false);

  readonly fileTypes = FILE_TYPES;
  isSaving = computed(() => this.wizardService.isSaving());

  ngOnInit(): void {
    const proj = this.wizardService.project();
    if (proj && proj.documents.length > 0) {
      this.documents.set(proj.documents);
      this.documentCount.set(proj.documents.length);
      this.minimumDocumentCount.set(proj.status === 'active' ? proj.documents.length : 1);
      this.formsGenerated.set(true);
    }
  }

  isFormValid = computed(() => {
    const docs = this.documents();
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
    if (n < this.minimumDocumentCount() || n > 50) return;
    const existing = this.documents();
    this.documents.set(
      Array.from({ length: n }, (_, index) => existing[index] ?? ({
        name: '', fileTypes: [], maxSize: '', sizeUnit: 'MB', templateName: '',
      }))
    );
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
    if (file) {
      this.documents.update(list => {
        const updated = [...list];
        updated[index] = { ...updated[index], templateName: file.name };
        return updated;
      });
    }
  }

  removeTemplate(index: number): void {
    this.documents.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], templateName: '' };
      return updated;
    });
  }

  removeDocument(index: number): void {
    if (this.documents().length <= this.minimumDocumentCount()) return;
    this.documents.update(list => list.filter((_, i) => i !== index));
    this.documentCount.set(this.documents().length);
  }

  trackByIndex(index: number): number {
    return index;
  }

  back(): void {
    this.router.navigate(this.publicProjectRoute('details'));
  }

  saveAsDraft(): void {
    if (!this.isFormValid()) return;
    this.wizardService.savePublicDocuments({ documents: this.documents() }).subscribe({
      next: () => this.showToast('Project saved as draft'),
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid()) return;
    this.wizardService.savePublicDocuments({ documents: this.documents() }).subscribe({
      next: project => this.router.navigate(['/new-solo-project/public', project.id, 'decision']),
      error: () => {},
    });
  }

  private publicProjectRoute(step: 'details' | 'documents' | 'decision'): any[] {
    const id = this.route.parent?.snapshot.paramMap.get('projectId') ?? this.wizardService.projectId();
    return id ? ['/new-solo-project/public', id, step] : ['/new-solo-project/public', step];
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { TeamProjectDocumentRequirement } from '../../models/team.models';

export const FILE_TYPES = ['PDF', 'DOCX', 'DOC', 'JPG', 'PNG', 'XLSX'];

@Component({
  selector: 'app-left-menu-new-team-project-private-documents',
  templateUrl: './left-menu-new-team-project-private-documents.html',
  styleUrl: './left-menu-new-team-project-private-documents.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: { '(document:click)': 'closeDropdown()' },
})
export class LeftMenuNewTeamProjectPrivateDocumentsComponent implements OnInit {
  private readonly router = inject(Router);
  readonly wizardService = inject(TeamProjectWizardService);
  readonly isActiveProject = computed(() => this.wizardService.project()?.status === 'active');

  dropdownOpen = signal(false);
  documentCount = signal(1);
  documents = signal<TeamProjectDocumentRequirement[]>([]);
  formsGenerated = signal(false);

  readonly fileTypes = FILE_TYPES;

  ngOnInit(): void {
    if (!this.wizardService.projectId()) {
      this.router.navigate(['/new-team-project/private/details']);
      return;
    }
    const existing = this.wizardService.project()?.documents ?? [];
    if (existing.length > 0) {
      this.documents.set(existing);
      this.documentCount.set(existing.length);
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
    if (n < 1 || n > 50) return;
    this.documents.set(
      Array.from({ length: n }, () => ({
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
    if (this.documents().length <= 1) return;
    this.documents.update(list => list.filter((_, i) => i !== index));
    this.documentCount.set(this.documents().length);
  }

  trackByIndex(index: number): number {
    return index;
  }

  cancel(): void {
    this.wizardService.reset();
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }

  saveAsDraft(): void {
    this.wizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  continue(): void {
    if (!this.isFormValid() || this.wizardService.isSaving()) return;
    this.wizardService.saveDocuments(this.documents()).subscribe({
      next: () => this.router.navigate(['/new-team-project/private/assignments']),
      error: () => { /* error shown via wizardService.saveError() */ },
    });
  }
}

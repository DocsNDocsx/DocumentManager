import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

@Component({
  selector: 'app-left-menu-new-solo-project-private-details',
  templateUrl: './left-menu-new-solo-project-private-details.html',
  styleUrl: './left-menu-new-solo-project-private-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateDetailsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
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

  projectName = signal('');
  projectDescription = signal('');
  projectDeadline = signal('');
  uploadedFiles = signal<{ name: string; size: string; iconClass: string }[]>([]);
  isDragOver = signal(false);

  isSaving = computed(() => this.wizardService.isSaving());

  isFormValid = computed(() =>
    this.projectName().trim() !== '' && this.projectDeadline() !== ''
  );

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision'];
    return labels.map((label, i) => ({
      label,
      state: i === 0 ? 'active' : i < done ? 'completed' : 'locked',
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
    if (proj) {
      this.projectName.set(proj.name);
      this.projectDescription.set(proj.description ?? '');
      this.projectDeadline.set(proj.deadline ? proj.deadline.split('T')[0] : '');
      this.uploadedFiles.set(proj.attachments ?? []);
    }
  }


  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(true);
  }

  onDragLeave(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragOver.set(false);
    if (event.dataTransfer?.files) {
      this.handleFiles(event.dataTransfer.files);
    }
  }

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files) {
      this.handleFiles(input.files);
      input.value = '';
    }
  }

  private handleFiles(files: FileList): void {
    const current = this.uploadedFiles();
    const added = Array.from(files).filter(f => {
      if (f.size > 50 * 1024 * 1024) return false;
      return !current.some(c => c.name === f.name);
    }).map(f => ({
      name: f.name,
      size: this.formatSize(f.size),
      iconClass: this.getIconClass(f.name),
    }));
    this.uploadedFiles.update(list => [...list, ...added]);
  }

  removeFile(index: number): void {
    this.uploadedFiles.update(list => list.filter((_, i) => i !== index));
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return Math.round(bytes / 1024 * 10) / 10 + ' KB';
    return Math.round(bytes / 1048576 * 10) / 10 + ' MB';
  }

  private getIconClass(name: string): string {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    const map: Record<string, string> = {
      pdf: 'fa-file-pdf', doc: 'fa-file-word', docx: 'fa-file-word',
      xls: 'fa-file-excel', xlsx: 'fa-file-excel',
      ppt: 'fa-file-powerpoint', pptx: 'fa-file-powerpoint',
      jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image', gif: 'fa-file-image',
      zip: 'fa-file-archive', rar: 'fa-file-archive',
    };
    return map[ext] ?? 'fa-file';
  }

  triggerBrowse(fileInput: HTMLInputElement): void {
    fileInput.click();
  }

  saveAsDraft(): void {
    if (!this.isFormValid()) return;
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid()) return;
    this.wizardService.saveDetails({
      name: this.projectName(),
      description: this.projectDescription(),
      deadline: this.projectDeadline(),
      attachments: this.uploadedFiles(),
    }).subscribe({
      next: () => this.router.navigate(['../collaborators'], { relativeTo: this.route }),
      error: () => {},
    });
  }

  cancel(): void {
    this.router.navigate(['/left-menu-new-solo-project-landing']);
  }
}

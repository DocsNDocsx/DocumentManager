import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { ProjectAttachment } from '../../models/project.models';

@Component({
  selector: 'app-left-menu-new-solo-project-public-details',
  templateUrl: './left-menu-new-solo-project-public-details.html',
  styleUrl: './left-menu-new-solo-project-public-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPublicDetailsComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  private attachmentUploadService = inject(ProjectAttachmentUploadService);
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
  expectedCollaborators = signal('');
  uploadedFiles = signal<ProjectAttachment[]>([]);
  isDragOver = signal(false);
  isUploading = signal(false);
  private pendingUploads = 0;

  supportFirstName = signal('');
  supportLastName = signal('');
  supportEmail = signal('');
  supportAffiliation = signal('');

  isSaving = computed(() => this.wizardService.isSaving());

  isFormValid = computed(() =>
    this.projectName().trim() !== '' &&
    this.projectDeadline() !== '' &&
    this.expectedCollaborators() !== '' &&
    parseInt(this.expectedCollaborators()) > 0
  );

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    return [
      { label: 'Details',   state: 'active' },
      { label: 'Documents', state: done >= 1 ? 'completed' : 'locked' },
      { label: 'Decision',  state: done >= 2 ? 'completed' : 'locked' },
    ];
  });

  ngOnInit(): void {
    const id = this.route.parent?.snapshot.paramMap.get('projectId') ?? null;
    if (id && this.wizardService.projectId() !== id) {
      this.wizardService.loadDraft(id).subscribe(() => this.populateForm());
    } else if (!id) {
      this.wizardService.reset();
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
      this.expectedCollaborators.set(proj.expectedCollaborators ? String(proj.expectedCollaborators) : '');
      this.uploadedFiles.set(proj.attachments ?? []);
      if (proj.staff) {
        this.supportFirstName.set(proj.staff.firstName);
        this.supportLastName.set(proj.staff.lastName);
        this.supportEmail.set(proj.staff.email);
        this.supportAffiliation.set(proj.staff.affiliation);
      }
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
    Array.from(files)
      .filter(f => {
        if (f.size > 50 * 1024 * 1024) {
          this.showToast(`${f.name} is larger than 50 MB`);
          return false;
        }
        return !current.some(c => c.name === f.name);
      })
      .forEach(file => this.uploadFile(file));
  }

  private uploadFile(file: File): void {
    this.pendingUploads += 1;
    this.isUploading.set(true);

    this.attachmentUploadService.upload(file, 'solo').subscribe({
      next: attachment => {
        this.uploadedFiles.update(list => list.some(item => item.name === attachment.name) ? list : [...list, attachment]);
      },
      error: () => {
        this.showToast(`Failed to upload ${file.name}`);
        this.finishUpload();
      },
      complete: () => this.finishUpload(),
    });
  }

  private finishUpload(): void {
    this.pendingUploads = Math.max(0, this.pendingUploads - 1);
    this.isUploading.set(this.pendingUploads > 0);
  }

  removeFile(index: number): void {
    this.uploadedFiles.update(list => list.filter((_, i) => i !== index));
  }

  triggerBrowse(fileInput: HTMLInputElement): void {
    fileInput.click();
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
      jpg: 'fa-file-image', jpeg: 'fa-file-image', png: 'fa-file-image',
      zip: 'fa-file-archive', rar: 'fa-file-archive',
    };
    return map[ext] ?? 'fa-file';
  }

  saveAsDraft(): void {
    if (!this.isFormValid() || this.isUploading()) return;
    const staff = this.supportFirstName().trim() ? {
      firstName: this.supportFirstName(),
      lastName: this.supportLastName(),
      email: this.supportEmail(),
      affiliation: this.supportAffiliation(),
    } : null;
    this.wizardService.savePublicDetails({
      name: this.projectName(),
      description: this.projectDescription(),
      deadline: this.projectDeadline(),
      attachments: this.uploadedFiles(),
      expectedCollaborators: this.expectedCollaborators(),
      staff,
    }).subscribe({
      next: project => {
        this.showToast('Project saved as draft');
        if (!this.route.parent?.snapshot.paramMap.get('projectId')) {
          this.router.navigate(['/new-solo-project/public', project.id, 'details'], { replaceUrl: true });
        }
      },
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid() || this.isUploading()) return;
    const staff = this.supportFirstName().trim() ? {
      firstName: this.supportFirstName(),
      lastName: this.supportLastName(),
      email: this.supportEmail(),
      affiliation: this.supportAffiliation(),
    } : null;
    this.wizardService.savePublicDetails({
      name: this.projectName(),
      description: this.projectDescription(),
      deadline: this.projectDeadline(),
      attachments: this.uploadedFiles(),
      expectedCollaborators: this.expectedCollaborators(),
      staff,
    }).subscribe({
      next: () => this.router.navigate(['/new-solo-project/public/documents']),
      error: () => {},
    });
  }

  goBack(): void {
    this.router.navigate(['/left-menu-new-solo-project-landing']);
  }
}

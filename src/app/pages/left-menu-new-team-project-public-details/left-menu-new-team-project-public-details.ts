import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { ProjectAttachment } from '../../models/project.models';
import { isValidProjectDeadline, minimumProjectDeadline } from '../../utils/deadline-validation';

@Component({
  selector: 'app-left-menu-new-team-project-public-details',
  templateUrl: './left-menu-new-team-project-public-details.html',
  styleUrl: './left-menu-new-team-project-public-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectPublicDetailsComponent implements OnInit, OnDestroy {
  private readonly teamsService = inject(TeamsService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  readonly teamWizardService = inject(TeamProjectWizardService);
  readonly isActiveProject = computed(() => this.teamWizardService.project()?.status === 'active');
  private readonly attachmentUploadService = inject(ProjectAttachmentUploadService);

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

  selectedTeamId = signal('');
  projectName = signal('');
  projectDescription = signal('');
  projectDeadline = signal('');
  minimumDeadline = minimumProjectDeadline();
  expectedCollaborators = signal('');
  uploadedFiles = signal<ProjectAttachment[]>([]);
  isDragOver = signal(false);
  isUploading = signal(false);
  private pendingUploads = 0;

  supportFirstName = signal('');
  supportLastName = signal('');
  supportEmail = signal('');
  supportAffiliation = signal('');

  readonly teams = computed(() => this.teamsService.hostedTeams());
  readonly selectedTeamName = computed(() =>
    this.teams().find(t => t.id === this.selectedTeamId())?.name ?? ''
  );

  isFormValid = computed(() =>
    this.selectedTeamId() !== '' &&
    this.projectName().trim() !== '' &&
    isValidProjectDeadline(this.projectDeadline()) &&
    this.expectedCollaborators() !== '' &&
    parseInt(this.expectedCollaborators()) > 0
  );

  ngOnInit(): void {
    if (this.teamsService.teams().length === 0) {
      this.teamsService.load();
    }
    const projectId = this.route.parent?.snapshot.paramMap.get('projectId') ?? null;
    if (projectId && this.teamWizardService.projectId() !== projectId) {
      this.teamWizardService.loadDraft(projectId).subscribe(() => this.populateForm());
    } else if (!projectId) {
      this.teamWizardService.reset();
      const hosted = this.teamsService.hostedTeams();
      if (hosted.length > 0) this.selectedTeamId.set(hosted[0].id);
    } else {
      this.populateForm();
    }
  }

  private populateForm(): void {
    const proj = this.teamWizardService.project();
    if (proj) {
      this.selectedTeamId.set(proj.teamId);
      this.projectName.set(proj.name);
      this.projectDescription.set(proj.description ?? '');
      this.projectDeadline.set(proj.deadline ? proj.deadline.split('T')[0] : '');
      this.expectedCollaborators.set(proj.expectedCollaborators ? String(proj.expectedCollaborators) : '');
      this.uploadedFiles.set(proj.attachments ?? []);
      if (proj.supportStaff) {
        this.supportFirstName.set(proj.supportStaff.firstName ?? '');
        this.supportLastName.set(proj.supportStaff.lastName ?? '');
        this.supportEmail.set(proj.supportStaff.email ?? '');
        this.supportAffiliation.set(proj.supportStaff.affiliation ?? '');
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

    this.attachmentUploadService.upload(file, 'team').subscribe({
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
    if (!this.isFormValid() || this.teamWizardService.isSaving() || this.isUploading()) return;
    this.teamWizardService.teamName.set(this.selectedTeamName());
    const supportStaff = this.supportFirstName().trim() || this.supportLastName().trim() || this.supportEmail().trim() || this.supportAffiliation().trim()
      ? { firstName: this.supportFirstName().trim(), lastName: this.supportLastName().trim(), email: this.supportEmail().trim(), affiliation: this.supportAffiliation().trim() }
      : null;
    this.teamWizardService.saveDetails({
      teamId: this.selectedTeamId(),
      name: this.projectName().trim(),
      description: this.projectDescription().trim(),
      deadline: this.projectDeadline(),
      type: 'public',
      expectedCollaborators: parseInt(this.expectedCollaborators()),
      attachments: this.uploadedFiles(),
      supportStaff,
    }).subscribe({
      next: project => {
        this.showToast('Project saved as draft');
        if (!this.route.parent?.snapshot.paramMap.get('projectId')) {
          this.router.navigate(['/new-team-project/public', project.id, 'details'], { replaceUrl: true });
        }
      },
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  continue(): void {
    if (!this.isFormValid() || this.teamWizardService.isSaving() || this.isUploading()) return;
    this.teamWizardService.teamName.set(this.selectedTeamName());
    const supportStaff = this.supportFirstName().trim() || this.supportLastName().trim() || this.supportEmail().trim() || this.supportAffiliation().trim()
      ? { firstName: this.supportFirstName().trim(), lastName: this.supportLastName().trim(), email: this.supportEmail().trim(), affiliation: this.supportAffiliation().trim() }
      : null;
    this.teamWizardService.saveDetails({
      teamId: this.selectedTeamId(),
      name: this.projectName().trim(),
      description: this.projectDescription().trim(),
      deadline: this.projectDeadline(),
      type: 'public',
      expectedCollaborators: parseInt(this.expectedCollaborators()),
      attachments: this.uploadedFiles(),
      supportStaff,
    }).subscribe({
      next: () => this.router.navigate(['/new-team-project/public/documents']),
      error: () => {},
    });
  }

  goBack(): void {
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }
}

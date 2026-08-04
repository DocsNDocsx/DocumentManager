import { ChangeDetectionStrategy, Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { ProjectAttachmentUploadService } from '../../services/project-attachment-upload.service';
import { ProjectAttachment } from '../../models/project.models';
import { isValidProjectDeadline, minimumProjectDeadline } from '../../utils/deadline-validation';

@Component({
  selector: 'app-left-menu-new-team-project-private-details',
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  templateUrl: './left-menu-new-team-project-private-details.html',
  styleUrl: './left-menu-new-team-project-private-details.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectPrivateDetailsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly teamsService = inject(TeamsService);
  readonly teamWizardService = inject(TeamProjectWizardService);
  private readonly attachmentUploadService = inject(ProjectAttachmentUploadService);

  dropdownOpen = signal(false);

  selectedTeamId = signal('');
  projectName = signal('');
  projectDescription = signal('');
  projectDeadline = signal('');
  minimumDeadline = minimumProjectDeadline();
  uploadedFiles = signal<ProjectAttachment[]>([]);
  dragOver = signal(false);
  isUploading = signal(false);
  private pendingUploads = 0;

  readonly teams = computed(() => this.teamsService.hostedTeams());
  readonly selectedTeamName = computed(() =>
    this.teams().find(t => t.id === this.selectedTeamId())?.name ?? ''
  );

  isFormValid = computed(() =>
    this.selectedTeamId() !== '' &&
    this.projectName().trim() !== '' &&
    isValidProjectDeadline(this.projectDeadline())
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
      this.uploadedFiles.set(proj.attachments ?? []);
      const name = this.teams().find(t => t.id === proj.teamId)?.name ?? '';
      if (name) this.teamWizardService.teamName.set(name);
    }
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  onTeamChange(e: Event): void {
    this.selectedTeamId.set((e.target as HTMLSelectElement).value);
  }

  onNameInput(e: Event): void {
    this.projectName.set((e.target as HTMLInputElement).value);
  }

  onDescInput(e: Event): void {
    this.projectDescription.set((e.target as HTMLTextAreaElement).value);
  }

  onDeadlineChange(e: Event): void {
    this.projectDeadline.set((e.target as HTMLInputElement).value);
  }

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(true);
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    this.dragOver.set(false);
    if (e.dataTransfer?.files) {
      this.handleFiles(Array.from(e.dataTransfer.files));
    }
  }

  onFileChange(e: Event): void {
    const files = Array.from((e.target as HTMLInputElement).files ?? []);
    this.handleFiles(files);
    (e.target as HTMLInputElement).value = '';
  }

  private handleFiles(files: File[]): void {
    const current = this.uploadedFiles();
    files
      .filter(f => f.size <= 50 * 1024 * 1024)
      .filter(f => !current.some(c => c.name === f.name))
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
        this.teamWizardService.saveError.set(`Failed to upload ${file.name}`);
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
    this.uploadedFiles.update(files => files.filter((_, i) => i !== index));
  }

  private formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${Math.round(bytes / 102.4) / 10} KB`;
    return `${Math.round(bytes / 104857.6) / 10} MB`;
  }

  onContinue(): void {
    if (!this.isFormValid() || this.isUploading()) return;
    this.teamWizardService.teamName.set(this.selectedTeamName());
    this.teamWizardService.saveDetails({
      teamId: this.selectedTeamId(),
      name: this.projectName().trim(),
      description: this.projectDescription().trim(),
      deadline: this.projectDeadline(),
      attachments: this.uploadedFiles(),
    }).subscribe({
      next: () => this.router.navigate(['/new-team-project/private/collaborators']),
      error: () => { /* error displayed via teamWizardService.saveError() */ },
    });
  }

  onSaveDraft(): void {
    if (!this.isFormValid() || this.teamWizardService.isSaving() || this.isUploading()) return;
    this.teamWizardService.teamName.set(this.selectedTeamName());
    this.teamWizardService.saveDetails({
      teamId: this.selectedTeamId(),
      name: this.projectName().trim(),
      description: this.projectDescription().trim(),
      deadline: this.projectDeadline(),
      attachments: this.uploadedFiles(),
    }).subscribe({
      next: project => {
        if (!this.route.parent?.snapshot.paramMap.get('projectId')) {
          this.router.navigate(['/new-team-project/private', project.id, 'details'], { replaceUrl: true });
        }
      },
      error: () => { /* error displayed via teamWizardService.saveError() */ },
    });
  }

  onCancel(): void {
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }
}

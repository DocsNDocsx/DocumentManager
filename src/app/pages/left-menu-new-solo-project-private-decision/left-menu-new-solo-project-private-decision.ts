import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { LoggingService } from '../../services/logging.service';

@Component({
  selector: 'app-left-menu-new-solo-project-private-decision',
  templateUrl: './left-menu-new-solo-project-private-decision.html',
  styleUrl: './left-menu-new-solo-project-private-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, ConfirmModalComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateDecisionComponent implements OnDestroy {
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  modalOpen = signal(false);
  isSaving = computed(() => this.wizardService.isSaving());

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

  steps = computed(() => {
    const done = this.wizardService.completedStep();
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision'];
    return labels.map((label, i) => ({
      label,
      state: i === 5 ? 'active' : i < done ? 'completed' : 'locked',
    }));
  });

  project = computed(() => this.wizardService.project());
  projectName = computed(() => this.project()?.name ?? '');
  projectDescription = computed(() => this.project()?.description ?? '');
  projectDeadline = computed(() => this.project()?.deadline ?? '');
  collaborators = computed(() => this.project()?.collaborators ?? []);
  documents = computed(() => this.project()?.documents ?? []);
  assignments = computed(() => this.project()?.assignments ?? {});
  supportStaff = computed(() => this.project()?.staff ?? null);
  collabCount = computed(() => this.collaborators().length);
  supportCount = computed(() => this.supportStaff() ? 1 : 0);
  totalEmails = computed(() => this.collabCount() + this.supportCount());

  getAssignedDocNames(collabIndex: number): string {
    const docs = this.documents();
    return (this.assignments()[String(collabIndex)] ?? [])
      .map(di => docs[di]?.name ?? '')
      .filter(Boolean)
      .join(', ') || 'No documents assigned';
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  back(): void {
    this.router.navigate(['/new-solo-project/private/staff']);
  }

  openModal(): void {
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  confirmActivation(): void {
    this.modalOpen.set(false);
    this.logger.info('User confirmed project activation');
    this.wizardService.activateProject().subscribe({
      next: () => {
        this.logger.info('Project activated, navigating to projects list');
        this.wizardService.reset();
        this.router.navigate(['/top-menu-solo-projects']);
      },
      error: () => {},
    });
  }

  saveAsDraft(): void {
    this.logger.debug('Saving project as draft from decision step');
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  cancelProject(): void {
    this.logger.warn('User cancelled project from decision step');
    this.wizardService.cancelProject().subscribe({
      next: () => {
        this.wizardService.reset();
        this.router.navigate(['/left-menu-new-solo-project-landing']);
      },
      error: () => {},
    });
  }
}

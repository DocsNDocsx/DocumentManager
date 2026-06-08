import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { ProjectWizardService } from '../../services/project-wizard.service';

@Component({
  selector: 'app-left-menu-new-solo-project-public-decision',
  templateUrl: './left-menu-new-solo-project-public-decision.html',
  styleUrl: './left-menu-new-solo-project-public-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, ConfirmModalComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPublicDecisionComponent implements OnDestroy {
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);

  dropdownOpen = signal(false);
  confirmModalOpen = signal(false);
  codeModalOpen = signal(false);
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

  project = computed(() => this.wizardService.project());
  projectName = computed(() => this.project()?.name ?? '');
  projectDescription = computed(() => this.project()?.description ?? '');
  projectDeadline = computed(() => this.project()?.deadline ?? '');
  expectedCollaborators = computed(() => this.project()?.expectedCollaborators ?? 0);
  documents = computed(() => this.project()?.documents ?? []);
  supportStaff = computed(() => this.project()?.staff ?? null);
  projectCode = computed(() => this.wizardService.projectCode() ?? '');

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  back(): void {
    this.router.navigate(['/new-solo-project/public/documents']);
  }

  openConfirmModal(): void {
    this.confirmModalOpen.set(true);
  }

  closeConfirmModal(): void {
    this.confirmModalOpen.set(false);
  }

  confirmActivation(): void {
    this.confirmModalOpen.set(false);
    this.wizardService.activateProject().subscribe({
      next: () => this.codeModalOpen.set(true),
      error: () => {},
    });
  }

  closeCodeModal(): void {
    this.codeModalOpen.set(false);
    this.wizardService.reset();
    this.router.navigate(['/top-menu-solo-projects']);
  }

  saveAsDraft(): void {
    this.showToast('Project saved as draft');
    this.wizardService.saveDraft().subscribe({
      error: () => this.showToast('Failed to save draft — please try again'),
    });
  }

  cancelProject(): void {
    this.wizardService.cancelProject().subscribe({
      next: () => {
        this.wizardService.reset();
        this.router.navigate(['/left-menu-new-solo-project-landing']);
      },
      error: () => {},
    });
  }
}

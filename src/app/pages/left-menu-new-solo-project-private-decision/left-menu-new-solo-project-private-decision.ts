import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { LoggingService } from '../../services/logging.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';

@Component({
  selector: 'app-left-menu-new-solo-project-private-decision',
  templateUrl: './left-menu-new-solo-project-private-decision.html',
  styleUrl: './left-menu-new-solo-project-private-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, RouterLink],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPrivateDecisionComponent implements OnDestroy {
  private router = inject(Router);
  private wizardService = inject(ProjectWizardService);
  private logger = inject(LoggingService);
  private billingEstimate = inject(BillingEstimateService);

  dropdownOpen = signal(false);
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
    const labels = ['Details', 'Collaborators', 'Documents', 'Assignments', 'Staff', 'Decision', 'Payment'];
    return labels.map((label, i) => ({
      label,
      state: i === 5 ? 'active' : i < done ? 'completed' : 'locked',
    }));
  });

  project = computed(() => this.wizardService.project());
  projectName = computed(() => this.project()?.name ?? '');
  projectDescription = computed(() => this.project()?.description ?? '');
  projectDeadline = computed(() => (this.project()?.deadline ?? '').split('T')[0]);
  isActiveProject = computed(() => this.project()?.status === 'active');
  collaborators = computed(() => this.project()?.collaborators ?? []);
  documents = computed(() => this.project()?.documents ?? []);
  assignments = computed(() => this.project()?.assignments ?? {});
  supportStaff = computed(() => this.project()?.staff ?? null);
  collabCount = computed(() => this.collaborators().filter(c => c.status !== 'inactive').length);
  documentCount = computed(() => this.documents().filter(d => d.status !== 'inactive').length);
  supportCount = computed(() => this.supportStaff() ? 1 : 0);
  totalEmails = computed(() => this.collabCount() + this.supportCount());

  getAssignedDocNames(collabIndex: number): string {
    const docs = this.documents();
    return (this.assignments()[String(collabIndex)] ?? [])
      .map(di => docs[di]?.status === 'inactive' ? '' : (docs[di]?.name ?? ''))
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

  goToPayment(): void {
    const project = this.project();
    const queryParams = project
      ? this.billingEstimate.buildSoloActivationQuery(project, this.collabCount(), this.documentCount())
      : null;
    if (!queryParams) {
      this.showToast('Please add a valid deadline before continuing to payment');
      return;
    }
    this.router.navigate(['/pricing-plan-ccard-information'], { queryParams });
  }

  finishEditing(): void {
    const upgradeQuery = typeof this.wizardService.pendingUpgradeQuery === 'function' ? this.wizardService.pendingUpgradeQuery() : null;
    this.wizardService.reset();
    if (upgradeQuery) this.router.navigate(['/pricing-plan-ccard-information'], { queryParams: upgradeQuery });
    else this.router.navigate(['/top-menu-solo-projects']);
  }

  closeProject(): void {
    this.wizardService.closeProject().subscribe({
      next: () => {
        this.showToast('Project closed');
        this.wizardService.reset();
        this.router.navigate(['/top-menu-solo-projects']);
      },
      error: () => this.showToast('Failed to close project - please try again'),
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

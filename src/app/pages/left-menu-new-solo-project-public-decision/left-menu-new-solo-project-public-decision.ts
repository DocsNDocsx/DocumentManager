import { ChangeDetectionStrategy, Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';

@Component({
  selector: 'app-left-menu-new-solo-project-public-decision',
  templateUrl: './left-menu-new-solo-project-public-decision.html',
  styleUrl: './left-menu-new-solo-project-public-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, RouterLink],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectPublicDecisionComponent implements OnDestroy {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private wizardService = inject(ProjectWizardService);
  private billingEstimate = inject(BillingEstimateService);

  dropdownOpen = signal(false);
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
  projectDeadline = computed(() => (this.project()?.deadline ?? '').split('T')[0]);
  isActiveProject = computed(() => this.project()?.status === 'active');
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
    const id = this.route.parent?.snapshot.paramMap.get('projectId') ?? this.wizardService.projectId();
    this.router.navigate(id ? ['/new-solo-project/public', id, 'documents'] : ['/new-solo-project/public/documents']);
  }

  goToPayment(): void {
    const project = this.project();
    const queryParams = project ? this.billingEstimate.buildSoloActivationQuery(project) : null;
    if (!queryParams) {
      this.showToast('Please add a valid deadline before continuing to payment');
      return;
    }
    this.router.navigate(['/pricing-plan-ccard-information'], { queryParams });
  }

  closeCodeModal(): void {
    this.codeModalOpen.set(false);
    this.wizardService.reset();
    this.router.navigate(['/top-menu-solo-projects']);
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
      error: () => this.showToast('Failed to close project — please try again'),
    });
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

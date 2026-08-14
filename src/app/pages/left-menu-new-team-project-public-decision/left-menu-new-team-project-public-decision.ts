import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';

@Component({
  selector: 'app-left-menu-new-team-project-public-decision',
  templateUrl: './left-menu-new-team-project-public-decision.html',
  styleUrl: './left-menu-new-team-project-public-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, RouterLink],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectPublicDecisionComponent implements OnInit {
  private readonly router = inject(Router);
  readonly teamWizardService = inject(TeamProjectWizardService);
  private readonly billingEstimate = inject(BillingEstimateService);

  dropdownOpen = signal(false);
  codeModalOpen = signal(false);
  projectCode = signal('');
  toastMsg = signal('');
  toastVisible = signal(false);

  readonly teamName = computed(() => this.teamWizardService.teamName());
  readonly projectName = computed(() => this.teamWizardService.project()?.name ?? '');
  readonly projectDescription = computed(() => this.teamWizardService.project()?.description ?? '');
  readonly projectDeadline = computed(() => (this.teamWizardService.project()?.deadline ?? '').split('T')[0]);
  readonly isActiveProject = computed(() => this.teamWizardService.project()?.status === 'active');
  readonly expectedCollaborators = computed(() => this.teamWizardService.project()?.expectedCollaborators ?? 0);
  readonly documents = computed(() => this.teamWizardService.project()?.documents ?? []);

  ngOnInit(): void {
    if (!this.teamWizardService.projectId()) {
      this.router.navigate(['/new-team-project/public/details']);
    }
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  goToPayment(): void {
    const project = this.teamWizardService.project();
    const queryParams = project ? this.billingEstimate.buildTeamActivationQuery(project) : null;
    if (!queryParams) {
      this.toastMsg.set('Please add a valid deadline before continuing to payment');
      this.toastVisible.set(true);
      return;
    }
    this.router.navigate(['/pricing-plan-ccard-information'], { queryParams });
  }

  closeCodeModal(): void {
    this.codeModalOpen.set(false);
    this.teamWizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  finishEditing(): void {
    const upgradeQuery = typeof this.teamWizardService.pendingUpgradeQuery === 'function' ? this.teamWizardService.pendingUpgradeQuery() : null;
    this.teamWizardService.reset();
    if (upgradeQuery) this.router.navigate(['/pricing-plan-ccard-information'], { queryParams: upgradeQuery });
    else this.router.navigate(['/top-menu-team-projects']);
  }

  closeProject(): void {
    this.teamWizardService.markComplete().subscribe({
      next: () => {
        this.toastMsg.set('Project closed');
        this.toastVisible.set(true);
        this.teamWizardService.reset();
        this.router.navigate(['/top-menu-team-projects']);
      },
      error: () => {
        this.toastMsg.set('Failed to close project - please try again');
        this.toastVisible.set(true);
      },
    });
  }

  saveAsDraft(): void {
    this.teamWizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  cancelProject(): void {
    this.teamWizardService.reset();
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }

  goBack(): void {
    this.router.navigate(['/new-team-project/public/documents']);
  }
}

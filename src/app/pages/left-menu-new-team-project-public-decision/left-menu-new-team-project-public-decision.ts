import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';

@Component({
  selector: 'app-left-menu-new-team-project-public-decision',
  templateUrl: './left-menu-new-team-project-public-decision.html',
  styleUrl: './left-menu-new-team-project-public-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, ConfirmModalComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectPublicDecisionComponent implements OnInit {
  private readonly router = inject(Router);
  readonly teamWizardService = inject(TeamProjectWizardService);
  private readonly billingEstimate = inject(BillingEstimateService);

  dropdownOpen = signal(false);
  confirmModalOpen = signal(false);
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

  openConfirmModal(): void {
    this.confirmModalOpen.set(true);
  }

  closeConfirmModal(): void {
    this.confirmModalOpen.set(false);
  }

  confirmActivation(): void {
    this.confirmModalOpen.set(false);
    this.teamWizardService.activateProject().subscribe({
      next: project => {
        this.projectCode.set(project.projectCode ?? '');
        this.codeModalOpen.set(true);
      },
      error: err => {
        if (err?.status === 402 || err?.error?.code === 'SUBSCRIPTION_REQUIRED') {
          this.showSubscribePrompt();
        }
      },
    });
  }

  private showSubscribePrompt(): void {
    this.toastMsg.set('Please subscribe before activating a project');
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3000);
    const project = this.teamWizardService.project();
    if (project) {
      const queryParams = this.billingEstimate.buildTeamActivationQuery(project);
      if (!queryParams) {
        this.toastMsg.set('Please add a valid deadline before activating this project');
        this.toastVisible.set(true);
        return;
      }
      this.router.navigate(['/pricing-plan-ccard-information'], {
        queryParams,
      });
    }
  }

  closeCodeModal(): void {
    this.codeModalOpen.set(false);
    this.teamWizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  finishEditing(): void {
    this.teamWizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  saveAsDraft(): void {}

  cancelProject(): void {}

  goBack(): void {
    this.router.navigate(['/new-team-project/public/documents']);
  }
}

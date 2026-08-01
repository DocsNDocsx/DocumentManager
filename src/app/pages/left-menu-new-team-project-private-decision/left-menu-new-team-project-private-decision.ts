import { ChangeDetectionStrategy, Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { environment } from '../../../environments/environment';

interface CollabItem {
  firstName: string;
  lastName: string;
  email: string;
}

@Component({
  selector: 'app-left-menu-new-team-project-private-decision',
  templateUrl: './left-menu-new-team-project-private-decision.html',
  styleUrl: './left-menu-new-team-project-private-decision.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, ConfirmModalComponent],
  host: { '(document:click)': 'closeDropdown()' },
})
export class LeftMenuNewTeamProjectPrivateDecisionComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  readonly wizardService = inject(TeamProjectWizardService);
  private readonly billingEstimate = inject(BillingEstimateService);

  dropdownOpen = signal(false);
  modalOpen = signal(false);
  collaborators = signal<CollabItem[]>([]);
  toastMsg = signal('');
  toastVisible = signal(false);

  projectName = computed(() => this.wizardService.project()?.name ?? '');
  projectDescription = computed(() => this.wizardService.project()?.description ?? '');
  projectDeadline = computed(() => (this.wizardService.project()?.deadline ?? '').split('T')[0]);
  isActiveProject = computed(() => this.wizardService.project()?.status === 'active');
  teamName = computed(() => this.wizardService.teamName());
  documents = computed(() => this.wizardService.project()?.documents ?? []);
  collabCount = computed(() => this.collaborators().length);

  ngOnInit(): void {
    const id = this.wizardService.projectId();
    if (!id) {
      this.router.navigate(['/new-team-project/private/details']);
      return;
    }
    this.http.get<{ success: boolean; collaborators: CollabItem[] }>(
      `${environment.apiUrl}/teams/projects/${id}/collaborators`
    ).subscribe({
      next: res => this.collaborators.set(res.collaborators),
    });
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  openModal(): void {
    this.modalOpen.set(true);
  }

  closeModal(): void {
    this.modalOpen.set(false);
  }

  confirmActivation(): void {
    if (this.wizardService.isSaving()) return;
    this.wizardService.activateProject().subscribe({
      next: () => {
        this.modalOpen.set(false);
        this.wizardService.reset();
        this.router.navigate(['/top-menu-team-projects']);
      },
      error: err => {
        this.modalOpen.set(false);
        if (err?.status === 402 || err?.error?.code === 'SUBSCRIPTION_REQUIRED') {
          this.showSubscribePrompt();
        }
      },
    });
  }

  finishEditing(): void {
    this.wizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  closeProject(): void {
    this.wizardService.markComplete().subscribe({
      next: () => {
        this.toastMsg.set('Project closed');
        this.toastVisible.set(true);
        this.wizardService.reset();
        this.router.navigate(['/top-menu-team-projects']);
      },
      error: () => {
        this.toastMsg.set('Failed to close project - please try again');
        this.toastVisible.set(true);
      },
    });
  }

  private showSubscribePrompt(): void {
    this.toastMsg.set('Please subscribe before activating a project');
    this.toastVisible.set(true);
    setTimeout(() => this.toastVisible.set(false), 3000);
    const project = this.wizardService.project();
    if (project) {
      const queryParams = this.billingEstimate.buildTeamActivationQuery(project, this.collabCount());
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

  saveAsDraft(): void {
    this.wizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  cancelProject(): void {
    this.wizardService.reset();
    this.router.navigate(['/left-menu-new-team-project-landing']);
  }
}

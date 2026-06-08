import { ChangeDetectionStrategy, Component, OnInit, computed, signal, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
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

  dropdownOpen = signal(false);
  modalOpen = signal(false);
  collaborators = signal<CollabItem[]>([]);

  projectName = computed(() => this.wizardService.project()?.name ?? '');
  projectDescription = computed(() => this.wizardService.project()?.description ?? '');
  projectDeadline = computed(() => (this.wizardService.project()?.deadline ?? '').split('T')[0]);
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
      error: () => {
        this.modalOpen.set(false);
      },
    });
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

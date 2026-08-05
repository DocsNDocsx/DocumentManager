import { ChangeDetectionStrategy, Component, OnInit, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';
import { TeamProjectCollaboratorInput } from '../../models/team.models';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-left-menu-new-team-project-private-collaborators',
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  templateUrl: './left-menu-new-team-project-private-collaborators.html',
  styleUrl: './left-menu-new-team-project-private-collaborators.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectPrivateCollaboratorsComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  readonly teamWizardService = inject(TeamProjectWizardService);
  readonly isActiveProject = computed(() => this.teamWizardService.project()?.status === 'active');

  dropdownOpen = signal(false);
  collaboratorCount = signal(1);
  minimumCollaboratorCount = signal(1);
  collaborators = signal<TeamProjectCollaboratorInput[]>([]);
  formsGenerated = signal(false);

  isFormValid = computed(() => {
    const list = this.collaborators();
    return (
      list.length > 0 &&
      list.every(
        c =>
          c.firstName.trim() !== '' &&
          c.lastName.trim() !== '' &&
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email),
      )
    );
  });

  ngOnInit(): void {
    const id = this.teamWizardService.projectId();
    if (!id) {
      this.router.navigate(['/new-team-project/private/details']);
      return;
    }
    this.http.get<{ success: boolean; collaborators: TeamProjectCollaboratorInput[] }>(
      `${environment.apiUrl}/teams/projects/${id}/collaborators`
    ).subscribe({
      next: res => {
        if (res.collaborators.length > 0) {
          this.collaborators.set(res.collaborators);
          this.collaboratorCount.set(res.collaborators.length);
          this.minimumCollaboratorCount.set(this.isActiveProject() ? res.collaborators.length : 1);
          this.formsGenerated.set(true);
        }
      },
    });
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  onCountInput(e: Event): void {
    const v = parseInt((e.target as HTMLInputElement).value, 10);
    if (!isNaN(v) && v >= this.minimumCollaboratorCount()) this.collaboratorCount.set(v);
  }

  generateForms(): void {
    const n = this.collaboratorCount();
    if (n < this.minimumCollaboratorCount()) return;
    const existing = this.collaborators();
    this.collaborators.set(
      Array.from({ length: n }, (_, index) => existing[index] ?? ({
        firstName: '',
        lastName: '',
        email: '',
        affiliation: '',
        role: 'contributor' as const,
      })),
    );
    this.formsGenerated.set(true);
  }

  updateField(index: number, field: keyof TeamProjectCollaboratorInput, value: string): void {
    this.collaborators.update(list => {
      const copy = [...list];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  }

  removeCollab(index: number): void {
    if (this.collaborators().length <= this.minimumCollaboratorCount()) return;
    this.collaborators.update(list => list.filter((_, i) => i !== index));
    this.collaboratorCount.set(this.collaborators().length);
  }

  onContinue(): void {
    if (!this.isFormValid() || this.teamWizardService.isSaving()) return;
    this.teamWizardService.saveCollaborators(this.collaborators()).subscribe({
      next: () => this.router.navigate(['/new-team-project/private/documents']),
      error: () => { /* error shown via teamWizardService.saveError() */ },
    });
  }

  saveAsDraft(): void {
    this.teamWizardService.reset();
    this.router.navigate(['/top-menu-team-projects']);
  }

  onBack(): void {
    this.router.navigate(['/new-team-project/private/details']);
  }
}

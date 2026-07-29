import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { TeamDetail, TeamDetailMember } from '../../models/team.models';
import { LoggingService } from '../../services/logging.service';

type EditableMember = Omit<TeamDetailMember, 'id' | 'isOwner'> & { isNew: boolean };

@Component({
  selector: 'app-top-menu-teams-edit-teams',
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  templateUrl: './top-menu-teams-edit-teams.html',
  styleUrl: './top-menu-teams-edit-teams.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class TopMenuTeamsEditTeamsComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  readonly teamsService = inject(TeamsService);
  private logger = inject(LoggingService);

  _teamId = signal('');

  dropdownOpen = signal(false);
  currentTeam = signal<TeamDetail | null>(null);
  teamName = signal('');
  teamDescription = signal('');
  members = signal<EditableMember[]>([]);
  isSaving = signal(false);
  saveError = signal<string | null>(null);

  constructor() {
    effect(() => {
      const teamId = this._teamId();
      if (!teamId) return;
      const detail = this.teamsService.teamDetails()[teamId];
      if (detail && !this.currentTeam()) {
        this.currentTeam.set(detail);
        this.teamName.set(detail.name);
        this.teamDescription.set(detail.description ?? '');
        this.members.set(
          detail.members
            .filter(m => !m.isOwner)
            .map(m => ({
              firstName: m.firstName,
              lastName: m.lastName,
              email: m.email,
              affiliation: m.affiliation,
              isNew: false,
            }))
        );
      }
    });
  }

  ngOnInit() {
    const teamId = this.route.snapshot.queryParamMap.get('id');
    if (!teamId) {
      this.router.navigate(['/top-menu-teams']);
      return;
    }
    this._teamId.set(teamId);
    this.teamsService.loadDetail(teamId);
  }

  toggleDropdown(event: MouseEvent) {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown() {
    this.dropdownOpen.set(false);
  }

  addMember() {
    this.members.update(list => [
      ...list,
      { firstName: '', lastName: '', email: '', affiliation: '', isNew: true },
    ]);
  }

  removeMember(index: number) {
    if (!confirm('Remove this team member?')) return;
    this.members.update(list => list.filter((_, i) => i !== index));
  }

  updateMember(index: number, field: keyof Omit<EditableMember, 'isNew'>, event: Event) {
    const value = (event.target as HTMLInputElement).value;
    this.members.update(list => {
      const updated = [...list];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  }

  attemptSave() {
    if (!this.validateForm()) return;
    this.saveChanges();
  }

  goBack() {
    if (confirm('Cancel editing? Any unsaved changes will be lost.')) {
      this.router.navigate(['/top-menu-teams']);
    }
  }

  private validateForm(): boolean {
    if (!this.teamName().trim()) {
      alert('Please enter a team name.');
      return false;
    }
    const list = this.members();
    for (let i = 0; i < list.length; i++) {
      if (!list[i].firstName || !list[i].lastName || !list[i].email) {
        alert(`Please fill in all required fields for Team Member ${i + 1}.`);
        return false;
      }
    }
    return true;
  }

  private saveChanges() {
    const team = this.currentTeam();
    if (!team) return;

    this.isSaving.set(true);
    this.saveError.set(null);
    this.logger.info('Saving team changes', { teamId: team.id });

    this.teamsService
      .update(team.id, {
        name: this.teamName().trim(),
        description: this.teamDescription().trim(),
        members: this.members().map(({ isNew: _isNew, ...m }) => m),
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.logger.info('Team changes saved', { teamId: team.id });
          this.router.navigate(['/top-menu-teams']);
        },
        error: (err: { error?: { message?: string } }) => {
          this.isSaving.set(false);
          this.logger.error('Failed to save team changes', err);
          this.saveError.set(err?.error?.message ?? 'Failed to save changes. Please try again.');
        },
      });
  }
}

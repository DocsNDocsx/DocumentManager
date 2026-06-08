import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

interface Member {
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
}

@Component({
  selector: 'app-left-menu-create-new-team',
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  templateUrl: './left-menu-create-new-team.html',
  styleUrl: './left-menu-create-new-team.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuCreateNewTeamComponent {
  private router = inject(Router);
  private teamsService = inject(TeamsService);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  isCreating = signal(false);
  createError = signal<string | null>(null);

  teamName = signal('');
  teamDescription = signal('');

  ownerFirstName = computed(() => this.auth.currentUserFirstname());
  ownerLastName  = computed(() => this.auth.currentUserLastname());
  ownerEmail     = computed(() => this.auth.currentUserEmail());

  members = signal<Member[]>([
    { firstName: '', lastName: '', email: '', affiliation: '' },
  ]);

  memberCount = computed(() => this.members().length + 1);

  isFormValid = computed(() => {
    const name = this.teamName().trim();
    if (!name) return false;
    return this.members().every(
      (m) => m.firstName.trim() && m.lastName.trim() && m.email.trim(),
    );
  });


  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update((v) => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  addMember(): void {
    this.members.update((list) => [
      ...list,
      { firstName: '', lastName: '', email: '', affiliation: '' },
    ]);
  }

  removeMember(index: number): void {
    if (this.members().length <= 1) return;
    this.members.update((list) => list.filter((_, i) => i !== index));
  }

  updateMember(index: number, field: keyof Member, value: string): void {
    this.members.update((list) =>
      list.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
    );
  }

  createTeam(): void {
    if (!this.isFormValid() || this.isCreating()) return;

    const userId = this.auth.currentUserId();
    if (!userId) return;

    this.isCreating.set(true);
    this.createError.set(null);
    this.logger.info('Creating new team', { name: this.teamName().trim(), memberCount: this.members().length });

    this.teamsService.create({
      userId,
      name: this.teamName().trim(),
      description: this.teamDescription().trim() || undefined,
      members: this.members().map(m => ({
        firstName: m.firstName.trim(),
        lastName: m.lastName.trim(),
        email: m.email.trim(),
        affiliation: m.affiliation.trim(),
      })),
    }).subscribe({
      next: () => {
        this.isCreating.set(false);
        this.logger.info('Team created successfully');
        this.router.navigate(['/top-menu-teams']);
      },
      error: (err: { error?: { message?: string } }) => {
        this.isCreating.set(false);
        this.logger.error('Failed to create team', err);
        this.createError.set(err?.error?.message ?? 'Failed to create team. Please try again.');
      },
    });
  }

  goBack(): void {
    this.router.navigate(['/dashboard']);
  }
}

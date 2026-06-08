import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { SubscriptionService } from '../../services/subscription.service';
import { TeamDetail, TeamDetailMember } from '../../models/team.models';
import { LoggingService } from '../../services/logging.service';

interface Plan {
  name: string;
  min: number;
  max: number;
  price: number;
}

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
  private subscriptionService = inject(SubscriptionService);
  private logger = inject(LoggingService);

  plans = signal<Plan[]>([]);

  _teamId = signal('');

  dropdownOpen = signal(false);
  currentTeam = signal<TeamDetail | null>(null);
  teamName = signal('');
  teamDescription = signal('');
  members = signal<EditableMember[]>([]);
  originalMemberCount = signal(0);
  showModal = signal(false);
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
        this.originalMemberCount.set(detail.members.length);
      }
    });
  }

  pricingState = computed(() => {
    const origCount = this.originalMemberCount();
    const newCount = this.members().length + 1;
    if (newCount === origCount) return null;

    const origPlan = this.getPlan(origCount);
    const newPlan = this.getPlan(newCount);
    const same = origPlan.name === newPlan.name;
    const upgrade = newPlan.price > origPlan.price;
    const diff = newPlan.price - origPlan.price;
    const absDiff = Math.abs(diff);
    const memberDiff = newCount - origCount;
    const memberSign = memberDiff > 0 ? '+' : '';
    const deltaSign = diff > 0 ? '+' : '-';
    const newPlanBoxClass = same ? 'current' : upgrade ? 'upgrade' : 'downgrade';
    const deltaClass = same ? 'same' : upgrade ? 'upgrade' : 'downgrade';

    return {
      origCount, newCount, origPlan, newPlan, same, upgrade,
      diff, absDiff, memberDiff, memberSign, deltaSign,
      newPlanBoxClass, deltaClass,
    };
  });

  saveDisabled = computed(() => {
    const state = this.pricingState();
    return state !== null && !state.same;
  });

  ngOnInit() {
    const teamId = this.route.snapshot.queryParamMap.get('id');
    if (!teamId) {
      this.router.navigate(['/top-menu-teams']);
      return;
    }
    this._teamId.set(teamId);
    this.teamsService.loadDetail(teamId);
    this.subscriptionService.getPlans().subscribe({
      next: res => this.plans.set(
        res.plans
          .filter(p => p.max_members > 0)
          .map(p => ({ name: p.name, min: p.min_members, max: p.max_members, price: p.price_monthly }))
      ),
      error: err => this.logger.error('Failed to load plans', err),
    });
  }

  private getPlan(count: number): Plan {
    const plans = this.plans();
    return plans.find(p => count >= p.min && count <= p.max) ?? plans[plans.length - 1] ?? { name: '—', min: 0, max: 0, price: 0 };
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
    const state = this.pricingState();
    if (state && !state.same) {
      this.showModal.set(true);
      return;
    }
    this.saveChanges();
  }

  confirmAndSave() {
    this.showModal.set(false);
    this.saveChanges();
  }

  closeModal() {
    this.showModal.set(false);
  }

  onModalBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) this.closeModal();
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

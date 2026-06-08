import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DatePipe } from '@angular/common';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { SubscriptionService } from '../../services/subscription.service';
import { AuthService } from '../../services/auth.service';
import { SubscriptionRecord } from '../../models/subscription.models';
import { LoggingService } from '../../services/logging.service';

type ViewMode = 'cancel' | 'delete';
type TeamKey = 'team-alpha' | 'team-product' | 'team-finance' | 'team-research';

interface TeamPlanStatus {
  active: boolean;
  canceled: boolean;
  name: string;
}

const TEAM_NAMES: Record<TeamKey, string> = {
  'team-alpha': 'Alpha Marketing Group',
  'team-product': 'Product Development Team',
  'team-finance': 'Finance Department',
  'team-research': 'Research & Analytics',
};

@Component({
  selector: 'app-drop-down-account-settings',
  templateUrl: './drop-down-account-settings.html',
  styleUrl: './drop-down-account-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent, DatePipe],
  host: { '(document:click)': 'onDocumentClick()' },
})
export class DropDownAccountSettingsComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private authService = inject(AuthService);
  private router = inject(Router);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  currentView = signal<ViewMode>('cancel');

  soloSub = signal<SubscriptionRecord | null>(null);
  isLoading = signal(false);
  isCancelling = signal(false);
  isDeleting = signal(false);
  errorMessage = signal('');

  showDeleteAccountModal = signal(false);
  showCancelPlanModal = signal(false);
  pendingCancelKey = signal<'solo' | TeamKey | null>(null);
  confirmDeleteInput = signal('');

  teamStatuses = signal<Record<TeamKey, TeamPlanStatus>>({
    'team-alpha':   { active: true, canceled: false, name: 'Alpha Marketing Group' },
    'team-product': { active: true, canceled: false, name: 'Product Development Team' },
    'team-finance': { active: true, canceled: false, name: 'Finance Department' },
    'team-research': { active: true, canceled: false, name: 'Research & Analytics' },
  });

  cancelPlanTitle = computed(() => {
    const key = this.pendingCancelKey();
    if (!key) return 'Confirm Plan Cancellation';
    if (key === 'solo') return 'Cancel Solo Projects Plan';
    return `Cancel ${TEAM_NAMES[key as TeamKey]} Plan`;
  });

  soloIsCanceled = computed(() => {
    const sub = this.soloSub();
    return sub?.status === 'cancelled' || sub?.status === 'expired';
  });

  hasAnyActivePlan = computed(() => this.soloSub()?.status === 'active');

  ngOnInit(): void {
    this.loadSubscription();
  }

  private loadSubscription(): void {
    const userid = this.authService.currentUserId();
    if (!userid) return;
    this.isLoading.set(true);
    this.subscriptionService.getSubscription(userid).subscribe({
      next: ({ subscription }) => {
        this.soloSub.set(subscription);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load subscription.');
        this.isLoading.set(false);
      },
    });
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  onDocumentClick(): void {
    this.dropdownOpen.set(false);
  }

  switchView(view: ViewMode): void {
    this.currentView.set(view);
  }

  openCancelPlanModal(key: 'solo' | TeamKey): void {
    if (key === 'solo' && this.soloIsCanceled()) return;
    if (key !== 'solo' && this.teamStatuses()[key as TeamKey].canceled) return;
    this.pendingCancelKey.set(key);
    this.showCancelPlanModal.set(true);
  }

  closeCancelPlanModal(): void {
    this.showCancelPlanModal.set(false);
    this.pendingCancelKey.set(null);
  }

  confirmCancelPlan(): void {
    const key = this.pendingCancelKey();
    if (!key) return;

    if (key === 'solo') {
      const userid = this.authService.currentUserId();
      if (!userid) return;
      this.isCancelling.set(true);
      this.logger.warn('User cancelling solo subscription', { userid });
      this.subscriptionService.cancelSubscription(userid).subscribe({
        next: () => {
          this.isCancelling.set(false);
          this.logger.info('Solo subscription cancelled');
          this.closeCancelPlanModal();
          this.loadSubscription();
        },
        error: (err) => {
          this.isCancelling.set(false);
          this.logger.error('Failed to cancel subscription', err);
          this.errorMessage.set('Failed to cancel plan. Please try again.');
        },
      });
    } else {
      this.teamStatuses.update(all => ({
        ...all,
        [key]: { ...all[key as TeamKey], canceled: true },
      }));
      this.closeCancelPlanModal();
    }
  }

  openDeleteAccountModal(): void {
    if (this.hasAnyActivePlan()) return;
    this.confirmDeleteInput.set('');
    this.showDeleteAccountModal.set(true);
  }

  closeDeleteAccountModal(): void {
    this.showDeleteAccountModal.set(false);
  }

  confirmDeleteAccount(): void {
    if (this.confirmDeleteInput().trim() !== 'DELETE') return;
    const userid = this.authService.currentUserId();
    if (!userid) return;
    this.isDeleting.set(true);
    this.logger.warn('User confirming account deletion', { userid });
    this.authService.deleteAccount(userid).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.logger.info('Account deleted, logging out');
        this.authService.logout();
        this.router.navigate(['/sign-in']);
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.logger.error('Account deletion failed', err);
        this.errorMessage.set('Failed to delete account. Please try again.');
      },
    });
  }

  onModalOverlayClick(event: MouseEvent, modalId: string): void {
    const target = event.target as HTMLElement;
    if (target.dataset['modalId'] === modalId) {
      if (modalId === 'delete') this.closeDeleteAccountModal();
      else this.closeCancelPlanModal();
    }
  }

  getTeamStatus(key: TeamKey): TeamPlanStatus {
    return this.teamStatuses()[key];
  }
}

import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamSelectorComponent, TeamOption } from '../../shared/team-selector/team-selector';
import { SubscriptionService } from '../../services/subscription.service';
import { AuthService } from '../../services/auth.service';
import { PlanRecord, SubscriptionRecord } from '../../models/subscription.models';
import { LoggingService } from '../../services/logging.service';

type BillingCycle = 'monthly' | 'annual';
type TeamKey = 'alpha' | 'product' | 'finance' | 'research';
type ViewMode = 'solo' | 'team';

interface ProrationResult {
  type: 'upgrade' | 'downgrade';
  amount: number;
  currentMonthly: number;
  newMonthly: number;
}

const ANNUAL_DISCOUNT = 0.15;


const TEAM_NAMES: Record<TeamKey, string> = {
  alpha: 'Alpha Marketing Group',
  product: 'Product Development Team',
  finance: 'Finance Department',
  research: 'Research & Analytics',
};

const DEFAULT_SUB: SubscriptionRecord = {
  id: 0, planSlug: 'free', planName: 'Free',
  priceMonthly: 0, priceAnnual: 0,
  billingCycle: 'monthly', status: 'active', nextPaymentAt: null,
  daysInCycle: 30, daysRemaining: 0,
};

@Component({
  selector: 'app-drop-down-upgrade-payment-plan',
  templateUrl: './drop-down-upgrade-payment-plan.html',
  styleUrl: './drop-down-upgrade-payment-plan.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent, TeamSelectorComponent],
  host: { '(document:click)': 'onDocumentClick()' },
})
export class DropDownUpgradePaymentPlanComponent implements OnInit {
  private subscriptionService = inject(SubscriptionService);
  private authService = inject(AuthService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  currentView = signal<ViewMode>('solo');
  currentTeam = signal<TeamKey>('alpha');
  currentBillingCycle = signal<BillingCycle>('monthly');
  showModal = signal(false);
  pendingPlanSlug = signal<string | null>(null);
  isLoading = signal(false);
  isConfirming = signal(false);
  errorMessage = signal('');

  plans = signal<PlanRecord[]>([]);
  private soloSub = signal<SubscriptionRecord>(DEFAULT_SUB);

  readonly teamOptions: TeamOption[] = Object.entries(TEAM_NAMES).map(([value, label]) => ({ value, label }));

  currentSub = computed(() => this.soloSub());

  pageTitle = computed(() =>
    this.currentView() === 'solo'
      ? 'Update Pricing Plans — Solo Projects'
      : `Update Pricing Plans — ${TEAM_NAMES[this.currentTeam()]}`
  );

  pageSubtitle = computed(() =>
    this.currentView() === 'solo'
      ? 'Choose the best plan for your needs and upgrade anytime'
      : `Manage subscription for ${TEAM_NAMES[this.currentTeam()]}`
  );

  currentPlanDisplay = computed(() => {
    const sub = this.currentSub();
    return {
      name: sub.planName + ' Plan',
      cost: '$' + sub.priceMonthly.toFixed(2),
      billing: sub.billingCycle === 'monthly' ? 'Monthly' : 'Annual',
    };
  });

  planCards = computed(() => {
    const sub = this.currentSub();
    const cycle = this.currentBillingCycle();

    return this.plans().filter(p => p.slug !== 'free').map(plan => {
      const isCurrent = plan.slug === sub.planSlug;
      let displayPrice = plan.price_monthly;
      let billingText = 'Billed monthly';
      if (cycle === 'annual') {
        displayPrice *= (1 - ANNUAL_DISCOUNT);
        billingText = `Billed annually ($${(displayPrice * 12).toFixed(2)}/year)`;
      }
      const prorate = isCurrent ? null : this.calcProration(plan.slug);
      const btnText = isCurrent ? 'Current Plan' : prorate?.type === 'downgrade' ? 'Downgrade' : 'Upgrade';
      const btnClass = isCurrent ? 'current' : prorate?.type === 'downgrade' ? 'downgrade' : 'upgrade';

      return { ...plan, isCurrent, displayPrice, billingText, prorate, btnText, btnClass };
    });
  });

  modalDetails = computed(() => {
    const slug = this.pendingPlanSlug();
    if (!slug) return null;
    const sub = this.currentSub();
    const prorate = this.calcProration(slug);
    const plan = this.plans().find(p => p.slug === slug);
    if (!plan) return null;
    return {
      title: `${prorate.type === 'upgrade' ? 'Upgrade' : 'Downgrade'} to ${plan.name}`,
      currentPlan: `${sub.planName} — $${prorate.currentMonthly.toFixed(2)}/mo`,
      newPlan: `${plan.name} — $${prorate.newMonthly.toFixed(2)}/mo`,
      daysRemaining: sub.daysRemaining,
      prorationLabel: prorate.type === 'upgrade' ? 'Amount to Charge Today:' : 'Prorated Refund:',
      prorationAmount: '$' + prorate.amount.toFixed(2),
      prorate,
    };
  });

  ngOnInit(): void {
    this.loadPlans();
    this.loadSubscription();
  }

  private loadPlans(): void {
    this.subscriptionService.getPlans().subscribe({
      next: ({ plans }) => this.plans.set(plans),
      error: () => this.errorMessage.set('Failed to load plans.'),
    });
  }

  private loadSubscription(): void {
    const userid = this.authService.currentUserId();
    if (!userid) return;

    this.isLoading.set(true);
    this.subscriptionService.getSubscription(userid).subscribe({
      next: ({ subscription }) => {
        if (subscription) {
          this.soloSub.set(subscription);
          this.currentBillingCycle.set(subscription.billingCycle);
        }
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load subscription.');
        this.isLoading.set(false);
      },
    });
  }

  private calcProration(newSlug: string): ProrationResult {
    const sub = this.currentSub();
    const newPlan = this.plans().find(p => p.slug === newSlug);
    const oldMonthly = sub.priceMonthly;
    const newMonthly = newPlan?.price_monthly ?? 0;
    const diff = ((newMonthly - oldMonthly) / sub.daysInCycle) * sub.daysRemaining;
    return {
      type: newMonthly > oldMonthly ? 'upgrade' : 'downgrade',
      amount: Math.abs(diff),
      currentMonthly: oldMonthly,
      newMonthly,
    };
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
    if (view === 'team') this.currentTeam.set('alpha');
  }

  switchTeam(team: string): void {
    this.currentTeam.set(team as TeamKey);
  }

  switchBillingCycle(cycle: BillingCycle): void {
    this.currentBillingCycle.set(cycle);
  }

  openPlanModal(slug: string): void {
    this.pendingPlanSlug.set(slug);
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
    this.pendingPlanSlug.set(null);
  }

  onModalOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeModal();
    }
  }

  confirmAction(): void {
    const slug = this.pendingPlanSlug();
    const userid = this.authService.currentUserId();
    if (!slug || !userid) return;

    this.isConfirming.set(true);
    this.logger.info('Confirming subscription plan change', { slug, billing: this.currentBillingCycle() });
    this.subscriptionService.updateSubscription({
      userid,
      planSlug: slug,
      billingCycle: this.currentBillingCycle(),
    }).subscribe({
      next: () => {
        this.isConfirming.set(false);
        this.logger.info('Subscription plan changed', { slug });
        this.closeModal();
        this.loadSubscription();
      },
      error: (err) => {
        this.isConfirming.set(false);
        this.logger.error('Subscription plan change failed', err);
        this.errorMessage.set('Failed to update plan. Please try again.');
      },
    });
  }

  capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}

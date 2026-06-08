import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamSelectorComponent, TeamOption } from '../../shared/team-selector/team-selector';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../services/auth.service';
import { PaymentRecord, PaymentSummary } from '../../models/payment.models';

interface PaymentDataSet {
  title: string;
  subtitle: string;
  summary: PaymentSummary;
  payments: PaymentRecord[];
}

const EMPTY_SUMMARY: PaymentSummary = {
  totalSpent: '$0.00', totalSpentSub: 'Last 12 months',
  totalPayments: 0, totalPaymentsSub: 'All time',
  currentPlan: '—', currentPlanSub: '—',
  nextPayment: '—', nextPaymentSub: '—',
};

@Component({
  selector: 'app-drop-down-payment-history',
  imports: [SharedHeaderComponent, SharedSidebarComponent, TeamSelectorComponent],
  templateUrl: './drop-down-payment-history.html',
  styleUrl: './drop-down-payment-history.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeDropdown()' },
})
export class DropDownPaymentHistoryComponent implements OnInit {
  private paymentService = inject(PaymentService);
  private authService = inject(AuthService);

  readonly teamOptions: TeamOption[] = [
    { value: 'all',      label: 'All Teams Combined' },
    { value: 'alpha',    label: 'Alpha Marketing Group' },
    { value: 'product',  label: 'Product Development Team' },
    { value: 'finance',  label: 'Finance Department' },
    { value: 'research', label: 'Research & Analytics' },
  ];

  dropdownOpen = signal(false);
  currentView = signal<'solo' | 'team'>('solo');
  currentTeam = signal('all');
  isLoading = signal(false);
  errorMessage = signal('');

  private soloData = signal<PaymentDataSet>({
    title: 'Payment History — Solo Projects',
    subtitle: 'View and manage all your solo project subscription payments',
    summary: EMPTY_SUMMARY,
    payments: [],
  });

  private teamData = signal<PaymentDataSet>({
    title: 'Payment History — Team Projects',
    subtitle: 'View and manage all your team project subscription payments',
    summary: EMPTY_SUMMARY,
    payments: [],
  });

  data = computed<PaymentDataSet>(() =>
    this.currentView() === 'solo' ? this.soloData() : this.teamData()
  );

  isTeamView = computed(() => this.currentView() === 'team');

  constructor() {
    effect(() => {
      const view = this.currentView();
      this.fetchPayments(view);
    });
  }

  ngOnInit(): void {}

  private fetchPayments(type: 'solo' | 'team'): void {
    const userid = this.authService.currentUserId();
    if (!userid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.paymentService.getPaymentHistory(userid, type).subscribe({
      next: ({ summary, payments }) => {
        const dataset: PaymentDataSet = {
          title: type === 'solo' ? 'Payment History — Solo Projects' : 'Payment History — Team Projects',
          subtitle: type === 'solo'
            ? 'View and manage all your solo project subscription payments'
            : 'View and manage all your team project subscription payments',
          summary,
          payments,
        };
        if (type === 'solo') this.soloData.set(dataset);
        else this.teamData.set(dataset);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load payment history.');
        this.isLoading.set(false);
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

  switchView(view: 'solo' | 'team'): void {
    this.currentView.set(view);
    if (view === 'team') this.currentTeam.set('all');
  }

  switchTeam(value: string): void {
    this.currentTeam.set(value);
  }

  statusClass(status: string): string {
    return status === 'paid' ? 'success' : status === 'pending' ? 'pending' : 'failed';
  }

  statusIcon(status: string): string {
    return status === 'paid' ? 'check-circle' : status === 'pending' ? 'clock' : 'times-circle';
  }

  statusLabel(status: string): string {
    return status === 'paid' ? 'Paid' : status === 'pending' ? 'Pending' : 'Failed';
  }

  exportCSV(): void {
    const data = this.data();
    const teamCol = this.isTeamView();
    const header = ['Date', 'Invoice', 'Plan', ...(teamCol ? ['Details'] : []), 'Amount', 'Status', 'Payment Method'];
    const rows = data.payments.map(p => [
      p.date, p.invoice, p.plan, ...(teamCol ? [p.teams ?? ''] : []),
      p.amount, p.status, p.method,
    ]);
    const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
    a.download = 'payment_history.csv';
    a.click();
  }
}

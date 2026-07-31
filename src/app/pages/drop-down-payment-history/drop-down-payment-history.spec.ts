import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { DropDownPaymentHistoryComponent } from './drop-down-payment-history';
import { PaymentService } from '../../services/payment.service';
import { AuthService } from '../../services/auth.service';
import { PaymentHistoryResponse } from '../../models/payment.models';

const history: PaymentHistoryResponse = {
  success: true,
  summary: {
    totalSpent: '$18.00',
    totalSpentSub: 'Last 12 months',
    totalPayments: 2,
    totalPaymentsSub: 'All time',
    currentPlan: 'Usage billing',
    currentPlanSub: 'Active',
    nextPayment: '$9.00',
    nextPaymentSub: 'Aug 30',
  },
  payments: [
    { date: '2026-07-01', invoice: 'INV-1', plan: 'Solo', amount: '$9.00', status: 'paid', method: 'Visa 4242' },
    { date: '2026-07-15', invoice: 'INV-2', plan: 'Team', amount: '$9.00', status: 'pending', method: 'Visa 4242', teams: 'Alpha' },
  ],
};

describe('DropDownPaymentHistoryComponent', () => {
  let component: DropDownPaymentHistoryComponent;
  let fixture: ComponentFixture<DropDownPaymentHistoryComponent>;
  let paymentService: { getPaymentHistory: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    paymentService = {
      getPaymentHistory: vi.fn().mockReturnValue(of(history)),
    };

    await TestBed.configureTestingModule({
      imports: [DropDownPaymentHistoryComponent, RouterModule.forRoot([])],
      providers: [
        { provide: PaymentService, useValue: paymentService },
        {
          provide: AuthService,
          useValue: {
            currentUserId: signal('123'),
            currentUserFirstname: signal('Mridul'),
            currentUserLastname: signal('Mishra'),
            currentUserEmail: signal('mridul@example.com'),
            currentUserAvatar: signal(''),
            logout: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DropDownPaymentHistoryComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('loads solo payment history on create', () => {
    expect(paymentService.getPaymentHistory).toHaveBeenCalledWith('123', 'solo');
    expect(component.data().summary.totalSpent).toBe('$18.00');
    expect(component.data().payments.length).toBe(2);
    expect(component.isLoading()).toBe(false);
  });

  it('switches to team view and resets selected team', async () => {
    component.switchView('team');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.currentView()).toBe('team');
    expect(component.currentTeam()).toBe('all');
    expect(component.isTeamView()).toBe(true);
    expect(paymentService.getPaymentHistory).toHaveBeenLastCalledWith('123', 'team');
  });

  it('changes selected team without refetching history', () => {
    const calls = paymentService.getPaymentHistory.mock.calls.length;

    component.switchTeam('finance');

    expect(component.currentTeam()).toBe('finance');
    expect(paymentService.getPaymentHistory).toHaveBeenCalledTimes(calls);
  });

  it('maps status display values', () => {
    expect(component.statusClass('paid')).toBe('success');
    expect(component.statusIcon('pending')).toBe('clock');
    expect(component.statusLabel('failed')).toBe('Failed');
  });

  it('shows load errors', async () => {
    paymentService.getPaymentHistory.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.switchView('team');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe('Failed to load payment history.');
    expect(component.isLoading()).toBe(false);
  });

  it('toggles dropdown and exports CSV', () => {
    const anchor = { href: '', download: '', click: vi.fn() } as unknown as HTMLAnchorElement;
    vi.spyOn(document, 'createElement').mockReturnValue(anchor);

    component.toggleDropdown(new MouseEvent('click'));
    expect(component.dropdownOpen()).toBe(true);
    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);

    component.exportCSV();

    expect(anchor.download).toBe('payment_history.csv');
    expect(anchor.href).toContain('data:text/csv');
    expect(anchor.click).toHaveBeenCalled();
  });
});

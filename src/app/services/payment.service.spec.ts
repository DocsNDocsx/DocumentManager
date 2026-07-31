import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { PaymentService } from './payment.service';
import { LoggingService } from './logging.service';
import { environment } from '../../environments/environment';
import { PaymentHistoryResponse } from '../models/payment.models';

describe('PaymentService', () => {
  let service: PaymentService;
  let http: HttpTestingController;
  let logger: { debug: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const response: PaymentHistoryResponse = {
    success: true,
    summary: {
      totalSpent: '$9.72',
      totalSpentSub: 'Last 12 months',
      totalPayments: 1,
      totalPaymentsSub: 'All time',
      currentPlan: 'Usage billing',
      currentPlanSub: 'Active project',
      nextPayment: '$9.72',
      nextPaymentSub: '2026-08-15',
    },
    payments: [
      {
        date: '2026-07-30',
        invoice: 'INV-001',
        plan: 'Usage billing',
        amount: '$9.72',
        status: 'paid',
        method: 'Visa 4242',
      },
    ],
  };

  beforeEach(() => {
    logger = { debug: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoggingService, useValue: logger },
      ],
    });
    service = TestBed.inject(PaymentService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads payment history with userid and type params', () => {
    let result: PaymentHistoryResponse | undefined;

    service.getPaymentHistory('123', 'team').subscribe(res => (result = res));

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/payment/history`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('userid')).toBe('123');
    expect(req.request.params.get('type')).toBe('team');

    req.flush(response);

    expect(result?.payments.length).toBe(1);
    expect(logger.debug).toHaveBeenCalledWith('Payment history loaded', { count: 1, type: 'team' });
  });

  it('logs payment history load errors', () => {
    service.getPaymentHistory('123', 'solo').subscribe({ error: () => {} });

    http.expectOne(r => r.url === `${environment.apiUrl}/payment/history`)
      .flush({ message: 'fail' }, { status: 500, statusText: 'Server Error' });

    expect(logger.error).toHaveBeenCalledWith('Failed to load payment history', expect.anything());
  });
});

import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { loadStripe } from '@stripe/stripe-js';

import { StripeService } from './stripe.service';
import { LoggingService } from './logging.service';
import { environment } from '../../environments/environment';
import { CreateSubscriptionRequest } from '../models/stripe.models';

vi.mock('@stripe/stripe-js', () => ({
  loadStripe: vi.fn(),
}));

describe('StripeService', () => {
  let service: StripeService;
  let http: HttpTestingController;
  let logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      error: vi.fn(),
    };
    vi.mocked(loadStripe).mockResolvedValue({} as any);

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoggingService, useValue: logger },
      ],
    });

    service = TestBed.inject(StripeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.clearAllMocks();
  });

  it('loads and caches Stripe.js with the publishable key', async () => {
    const first = service.getStripe();
    const second = service.getStripe();

    expect(first).toBe(second);
    expect(await first).toEqual({});
  });

  it('creates a setup intent through the backend', () => {
    let clientSecret: string | undefined;

    service.createSetupIntent({
      userid: '123',
      email: 'mridul@example.com',
      name: 'Mridul Mishra',
    }).subscribe(res => (clientSecret = res.clientSecret));

    const req = http.expectOne(`${environment.apiUrl}/stripe/setup-intent`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      userid: '123',
      email: 'mridul@example.com',
      name: 'Mridul Mishra',
    });

    req.flush({ success: true, clientSecret: 'seti_secret', customerId: 'cus_123' });

    expect(clientSecret).toBe('seti_secret');
    expect(logger.debug).toHaveBeenCalledWith('Setup intent created');
  });

  it('creates a subscription with usage inputs', () => {
    const payload: CreateSubscriptionRequest = {
      userid: '123',
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
      type: 'solo',
      projects: 1,
      collaborators: 2,
      documents: 5,
      days: 20,
      monthlyEstimate: 19.44,
    };
    let status: string | undefined;

    service.createSubscription(payload).subscribe(res => (status = res.status));

    const req = http.expectOne(`${environment.apiUrl}/stripe/subscription`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    req.flush({
      success: true,
      subscriptionId: 'sub_123',
      status: 'active',
      nextPaymentAt: '2026-08-30',
    });

    expect(status).toBe('active');
    expect(logger.info).toHaveBeenCalledWith('Subscription created', {
      subscriptionId: 'sub_123',
      status: 'active',
    });
  });

  it('logs setup-intent and subscription errors', () => {
    service.createSetupIntent({ userid: '123', email: 'a@b.com', name: 'A B' }).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/stripe/setup-intent`)
      .flush({ message: 'setup failed' }, { status: 503, statusText: 'Unavailable' });

    service.createSubscription({
      userid: '123',
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
      type: 'team',
      projects: 1,
      collaborators: 1,
      documents: 1,
      days: 1,
      monthlyEstimate: 0.1,
    }).subscribe({ error: () => {} });
    http.expectOne(`${environment.apiUrl}/stripe/subscription`)
      .flush({ message: 'subscription failed' }, { status: 500, statusText: 'Server Error' });

    expect(logger.error).toHaveBeenCalledWith('Failed to create setup intent', expect.anything());
    expect(logger.error).toHaveBeenCalledWith('Failed to create subscription', expect.anything());
  });
});

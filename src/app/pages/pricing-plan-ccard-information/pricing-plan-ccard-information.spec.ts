import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { signal } from '@angular/core';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { PricingPlanCcardInformationComponent } from './pricing-plan-ccard-information';
import { AuthService } from '../../services/auth.service';
import { StripeService } from '../../services/stripe.service';

function routeMock(query: Record<string, string> = {}) {
  const queryParams$ = new BehaviorSubject<Record<string, string>>(query);
  return {
    queryParams: queryParams$.asObservable(),
    snapshot: {
      queryParamMap: {
        get: (key: string) => query[key] ?? null,
      },
    },
    queryParams$,
  };
}

describe('PricingPlanCcardInformationComponent', () => {
  let component: PricingPlanCcardInformationComponent;
  let fixture: ComponentFixture<PricingPlanCcardInformationComponent>;
  let stripeService: any;
  let router: Router;
  let stripe: any;
  let paymentElement: any;
  let route: ReturnType<typeof routeMock>;

  beforeEach(async () => {
    paymentElement = {
      mount: vi.fn(),
      on: vi.fn((event: string, cb: () => void) => {
        if (event === 'ready') cb();
      }),
    };
    const elements = {
      create: vi.fn(() => paymentElement),
    };
    stripe = {
      elements: vi.fn(() => elements),
      confirmSetup: vi.fn(),
      retrieveSetupIntent: vi.fn(),
    };
    stripeService = {
      getStripe: vi.fn().mockResolvedValue(stripe),
      createSetupIntent: vi.fn().mockReturnValue(of({
        success: true,
        clientSecret: 'seti_secret',
        customerId: 'cus_123',
      })),
      createSubscription: vi.fn().mockReturnValue(of({
        success: true,
        subscriptionId: 'sub_123',
        status: 'active',
      })),
    };
    route = routeMock({
      type: 'team',
      projects: '1',
      collaborators: '3',
      documents: '5',
      days: '20',
      monthly: '27.00',
    });

    await TestBed.configureTestingModule({
      imports: [PricingPlanCcardInformationComponent, RouterModule.forRoot([])],
      providers: [
        { provide: ActivatedRoute, useValue: route },
        {
          provide: AuthService,
          useValue: {
            currentUserId: signal('123'),
            currentUserFirstname: signal('Mridul'),
            currentUserLastname: signal('Mishra'),
            currentUserEmail: signal('mridul@example.com'),
          },
        },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingPlanCcardInformationComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('reads query params, pre-fills user details, and initializes setup intent', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    expect(component.projectType()).toBe('team');
    expect(component.collaborators()).toBe(3);
    expect(component.documents()).toBe(5);
    expect(component.days()).toBe(20);
    expect(component.monthlyBase()).toBe(27);
    expect(component.firstName()).toBe('Mridul');
    expect(component.lastName()).toBe('Mishra');
    expect(component.email()).toBe('mridul@example.com');
    expect(stripeService.createSetupIntent).toHaveBeenCalledWith({
      userid: '123',
      email: 'mridul@example.com',
      name: 'Mridul Mishra',
    });
  });

  it('shows a setup-intent error when Stripe backend initialization fails', async () => {
    stripeService.createSetupIntent.mockReturnValueOnce(throwError(() => ({ error: { message: 'Stripe unavailable' } })));

    component.ngOnInit();
    await fixture.whenStable();

    expect(component.validationError()).toBe('Stripe unavailable');
  });

  it('shows an error when Stripe.js cannot load', async () => {
    stripeService.getStripe.mockResolvedValueOnce(null);

    component.ngOnInit();
    await fixture.whenStable();

    expect(component.validationError()).toBe('Unable to load the secure payment system. Please refresh and try again.');
  });

  it('validates billing fields before submitting', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    await component.submitPayment();

    expect(component.validationError()).toBe('Please fill in all billing information fields.');
    expect(stripe.confirmSetup).not.toHaveBeenCalled();
  });

  it('validates billing email format', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.email.set('bad-email');
    component.address1.set('123 Main St');
    component.city.set('New York');
    component.state.set('NY');
    component.zip.set('10001');

    await component.submitPayment();

    expect(component.validationError()).toBe('Please enter a valid email address.');
  });

  it('applies, normalizes, and clears voucher discounts', async () => {
    component.ngOnInit();
    await fixture.whenStable();

    component.voucherCode.set(' welcome10 ');
    component.applyVoucher();

    expect(component.voucherCode()).toBe('WELCOME10');
    expect(component.appliedVoucherCode()).toBe('WELCOME10');
    expect(component.voucherError()).toBe('');
    expect(component.voucherDiscount()).toBe(2.92);
    expect(component.total()).toBeCloseTo(26.24);
    expect(component.appliedVoucherLabel()).toBe('Welcome voucher (10% off)');

    component.clearVoucher();

    expect(component.voucherCode()).toBe('');
    expect(component.appliedVoucherCode()).toBe('');
    expect(component.voucherDiscount()).toBe(0);
  });

  it('shows an error for missing or invalid voucher codes', () => {
    component.applyVoucher();
    expect(component.voucherError()).toBe('Enter a voucher code.');

    component.voucherCode.set('bad-code');
    component.applyVoucher();

    expect(component.appliedVoucherCode()).toBe('');
    expect(component.voucherError()).toBe('Voucher code is not valid.');
  });

  it('shows payment form loading error when Stripe objects are missing', async () => {
    (component as any).stripe = null;
    (component as any).elements = null;
    (component as any).clientSecret = '';
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.email.set('mridul@example.com');
    component.address1.set('123 Main St');
    component.city.set('New York');
    component.state.set('NY');
    component.zip.set('10001');

    await component.submitPayment();

    expect(component.validationError()).toBe('The payment form is still loading. Please wait a moment and try again.');
  });

  it('creates subscription and navigates to confirmation when card setup succeeds', async () => {
    component.ngOnInit();
    await fixture.whenStable();
    (component as any).stripe = stripe;
    (component as any).elements = {};
    (component as any).clientSecret = 'seti_secret';
    (component as any).customerId = 'cus_123';
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.email.set('mridul@example.com');
    component.address1.set('123 Main St');
    component.city.set('New York');
    component.state.set('NY');
    component.zip.set('10001');
    component.voucherCode.set('launch25');
    component.applyVoucher();
    stripe.confirmSetup.mockResolvedValueOnce({
      setupIntent: { status: 'succeeded', payment_method: 'pm_123' },
    });

    await component.submitPayment();

    expect(stripeService.createSubscription).toHaveBeenCalledWith(expect.objectContaining({
      userid: '123',
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
      type: 'team',
      collaborators: 3,
      documents: 5,
      days: 20,
      monthlyEstimate: 21.87,
      voucherCode: 'LAUNCH25',
    }));
    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-confirm'], {
      queryParams: expect.objectContaining({
        type: 'team',
        total: '21.87',
        voucherCode: 'LAUNCH25',
        name: 'Mridul Mishra',
      }),
    });
    expect(component.processing()).toBe(false);
  });

  it('shows Stripe confirmSetup errors', async () => {
    (component as any).stripe = stripe;
    (component as any).elements = {};
    (component as any).clientSecret = 'seti_secret';
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.email.set('mridul@example.com');
    component.address1.set('123 Main St');
    component.city.set('New York');
    component.state.set('NY');
    component.zip.set('10001');
    stripe.confirmSetup.mockResolvedValueOnce({ error: { message: 'Card declined' } });

    await component.submitPayment();

    expect(component.validationError()).toBe('Card declined');
    expect(component.processing()).toBe(false);
  });

  it('shows subscription creation errors after card setup', async () => {
    stripeService.createSubscription.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    (component as any).stripe = stripe;
    (component as any).elements = {};
    (component as any).clientSecret = 'seti_secret';
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.email.set('mridul@example.com');
    component.address1.set('123 Main St');
    component.city.set('New York');
    component.state.set('NY');
    component.zip.set('10001');
    stripe.confirmSetup.mockResolvedValueOnce({
      setupIntent: { status: 'succeeded', payment_method: 'pm_123' },
    });

    await component.submitPayment();

    expect(component.validationError()).toBe('Your card was saved but we could not start your subscription. Please contact support.');
    expect(component.processing()).toBe(false);
  });
});

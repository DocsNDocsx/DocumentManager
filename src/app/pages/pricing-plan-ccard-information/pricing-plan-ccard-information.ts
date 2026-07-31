import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { HttpClient } from '@angular/common/http';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { Observable, of } from 'rxjs';
import { LogoComponent } from '../../shared/logo/logo';
import { AuthService } from '../../services/auth.service';
import { StripeService } from '../../services/stripe.service';
import { environment } from '../../../environments/environment';

const TAX_RATE = 0.08;
const VOUCHERS: Record<string, { percentOff: number; label: string }> = {
  WELCOME10: { percentOff: 10, label: 'Welcome voucher' },
  LAUNCH25: { percentOff: 25, label: 'Launch voucher' },
};

@Component({
  selector: 'app-pricing-plan-ccard-information',
  imports: [RouterLink, LogoComponent],
  templateUrl: './pricing-plan-ccard-information.html',
  styleUrl: './pricing-plan-ccard-information.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPlanCcardInformationComponent implements OnInit, AfterViewInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private stripeService = inject(StripeService);
  private http = inject(HttpClient);

  /** Host element where the Stripe Payment Element iframe is mounted. */
  private paymentElementRef = viewChild<ElementRef<HTMLDivElement>>('paymentElement');

  projectType   = signal<'solo' | 'team'>('solo');
  projects      = signal(1);
  collaborators = signal(1);
  documents     = signal(1);
  days          = signal(20);
  monthlyBase   = signal(0);
  activationProjectId = signal('');
  voucherCode = signal('');
  appliedVoucherCode = signal('');
  voucherError = signal('');

  subtotal  = computed(() => this.monthlyBase());
  tax       = computed(() => Math.round(this.subtotal() * TAX_RATE * 100) / 100);
  grossTotal = computed(() => this.subtotal() + this.tax());
  voucherDiscount = computed(() => {
    const voucher = VOUCHERS[this.appliedVoucherCode()];
    if (!voucher) return 0;
    return Math.round(this.grossTotal() * voucher.percentOff) / 100;
  });
  total = computed(() => Math.max(0, this.grossTotal() - this.voucherDiscount()));
  appliedVoucherLabel = computed(() => {
    const voucher = VOUCHERS[this.appliedVoucherCode()];
    return voucher ? `${voucher.label} (${voucher.percentOff}% off)` : '';
  });

  firstName = signal('');
  lastName  = signal('');
  email     = signal('');
  address1  = signal('');
  address2  = signal('');
  city      = signal('');
  state     = signal('');
  zip       = signal('');
  country   = signal('US');

  validationError = signal('');
  /** True once the Payment Element has been mounted and is ready for input. */
  stripeReady = signal(false);
  /** True while a payment is being confirmed / subscription created. */
  processing = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripePaymentElement | null = null;
  private clientSecret = '';
  private customerId = '';
  private viewReady = false;

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.projectType.set((params['type'] || 'solo') as 'solo' | 'team');
        this.projects.set(+params['projects'] || 1);
        this.collaborators.set(+params['collaborators'] || 1);
        this.documents.set(+params['documents'] || 1);
        this.days.set(+params['days'] || 20);
        this.monthlyBase.set(parseFloat(params['monthly']) || 0);
        this.activationProjectId.set(String(params['projectId'] || ''));
        const voucherCode = this.normalizeVoucherCode(params['voucherCode']);
        if (voucherCode && VOUCHERS[voucherCode]) {
          this.voucherCode.set(voucherCode);
          this.appliedVoucherCode.set(voucherCode);
        }
      });

    // Prefill billing details from the signed-in user when available.
    if (this.auth.currentUserFirstname()) this.firstName.set(this.auth.currentUserFirstname());
    if (this.auth.currentUserLastname()) this.lastName.set(this.auth.currentUserLastname());
    if (this.auth.currentUserEmail()) this.email.set(this.auth.currentUserEmail());

    // If we're returning from a 3-D Secure redirect, finalize the subscription.
    const returningSecret = this.route.snapshot.queryParamMap.get('setup_intent_client_secret');
    if (returningSecret) {
      this.finalizeAfterRedirect(returningSecret);
      return;
    }

    this.initStripe();
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.mountPaymentElement();
  }

  ngOnDestroy(): void {
    this.teardownPaymentElement();
  }

  /** Loads Stripe.js and requests a SetupIntent so the card can be collected and saved. */
  private async initStripe(): Promise<void> {
    this.stripe = await this.stripeService.getStripe();
    if (!this.stripe) {
      this.validationError.set('Unable to load the secure payment system. Please refresh and try again.');
      return;
    }

    this.stripeService
      .createSetupIntent({
        userid: this.auth.currentUserId(),
        email: this.email(),
        name: `${this.firstName()} ${this.lastName()}`.trim(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => {
          this.clientSecret = res.clientSecret;
          this.customerId = res.customerId;
          this.mountPaymentElement();
        },
        error: err => {
          const message = err?.error?.message ?? 'Could not initialize payment. Please try again in a moment.';
          this.validationError.set(message);
        },
      });
  }

  /** Mounts the Payment Element once both the view and the client secret are ready. */
  private mountPaymentElement(): void {
    if (!this.stripe || !this.clientSecret || !this.viewReady || this.paymentElement) return;

    this.elements = this.stripe.elements({
      clientSecret: this.clientSecret,
      appearance: { theme: 'stripe', variables: { colorPrimary: '#1b5e4f' } },
    });

    // Billing details are collected by our own form, so the element should not duplicate them.
    this.paymentElement = this.elements.create('payment', {
      fields: { billingDetails: 'never' },
    });

    const host = this.paymentElementRef()?.nativeElement;
    if (!host) return;
    this.paymentElement.mount(host);
    this.paymentElement.on('ready', () => this.stripeReady.set(true));
  }

  private teardownPaymentElement(): void {
    const host = this.paymentElementRef()?.nativeElement;
    try {
      this.paymentElement?.unmount();
    } catch {
      // Stripe may already have detached the iframe during navigation.
    }
    try {
      this.paymentElement?.destroy();
    } catch {
      // Destruction is best-effort cleanup after payment completion.
    }
    host?.replaceChildren();
    this.paymentElement = null;
    this.elements = null;
    this.stripeReady.set(false);
  }

  async submitPayment(): Promise<void> {
    this.validationError.set('');

    if (!this.firstName() || !this.lastName() || !this.email() ||
        !this.address1() || !this.city() || !this.state() || !this.zip()) {
      this.validationError.set('Please fill in all billing information fields.');
      return;
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email())) {
      this.validationError.set('Please enter a valid email address.');
      return;
    }

    if (!this.stripe || !this.elements || !this.clientSecret) {
      this.validationError.set('The payment form is still loading. Please wait a moment and try again.');
      return;
    }

    this.processing.set(true);

    const submitResult = await this.elements.submit();
    if (submitResult.error) {
      this.validationError.set(submitResult.error.message ?? 'Please check your payment details and try again.');
      this.processing.set(false);
      return;
    }

    let confirmResult: any;
    try {
      confirmResult = await this.stripe.confirmSetup({
        elements: this.elements,
        clientSecret: this.clientSecret,
        confirmParams: {
          return_url: this.buildReturnUrl(),
          payment_method_data: {
            billing_details: {
              name: `${this.firstName()} ${this.lastName()}`.trim(),
              email: this.email(),
              phone: '',
              address: {
                line1: this.address1(),
                line2: this.address2() || undefined,
                city: this.city(),
                state: this.state(),
                postal_code: this.zip(),
                country: this.country(),
              },
            },
          },
        },
        // Avoid a full-page redirect unless the bank requires it (e.g. 3-D Secure).
        redirect: 'if_required',
      });
    } catch (err: any) {
      this.validationError.set(err?.message ?? 'We could not confirm your card. Please check the details and try again.');
      this.processing.set(false);
      return;
    }

    const { error, setupIntent } = confirmResult;

    if (error) {
      this.validationError.set(error.message ?? 'We could not confirm your card. Please check the details and try again.');
      this.processing.set(false);
      return;
    }

    if (setupIntent?.status === 'succeeded' && typeof setupIntent.payment_method === 'string') {
      this.teardownPaymentElement();
      this.createSubscriptionAndContinue(setupIntent.payment_method);
    }
    // Otherwise Stripe has redirected the browser for additional authentication;
    // the flow resumes in finalizeAfterRedirect() when the user returns.
  }

  applyVoucher(): void {
    const code = this.normalizeVoucherCode(this.voucherCode());
    this.voucherCode.set(code);
    this.voucherError.set('');

    if (!code) {
      this.voucherError.set('Enter a voucher code.');
      return;
    }

    if (!VOUCHERS[code]) {
      this.appliedVoucherCode.set('');
      this.voucherError.set('Voucher code is not valid.');
      return;
    }

    this.appliedVoucherCode.set(code);
  }

  clearVoucher(): void {
    this.voucherCode.set('');
    this.appliedVoucherCode.set('');
    this.voucherError.set('');
  }

  /** Resumes the flow after a 3-D Secure redirect back to this page. */
  private async finalizeAfterRedirect(clientSecret: string): Promise<void> {
    this.processing.set(true);
    this.stripe = await this.stripeService.getStripe();
    if (!this.stripe) {
      this.validationError.set('Unable to load the secure payment system. Please refresh and try again.');
      this.processing.set(false);
      return;
    }

    const { setupIntent } = await this.stripe.retrieveSetupIntent(clientSecret);
    if (setupIntent?.status === 'succeeded' && typeof setupIntent.payment_method === 'string') {
      this.customerId = this.route.snapshot.queryParamMap.get('customerId') ?? '';
      this.teardownPaymentElement();
      this.createSubscriptionAndContinue(setupIntent.payment_method);
    } else {
      this.validationError.set('Card setup was not completed. Please try again.');
      this.processing.set(false);
      this.clientSecret = '';
      this.initStripe();
    }
  }

  /** Tells the backend to create the recurring subscription, then advances to confirmation. */
  private createSubscriptionAndContinue(paymentMethodId: string): void {
    this.stripeService
      .createSubscription({
        userid: this.auth.currentUserId(),
        customerId: this.customerId,
        paymentMethodId,
        type: this.projectType(),
        projects: this.projects(),
        collaborators: this.collaborators(),
        documents: this.documents(),
        days: this.days(),
        projectId: this.activationProjectId() || null,
        monthlyEstimate: this.total(),
        voucherCode: this.appliedVoucherCode() || null,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.activateProjectAfterSubscription()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: () => this.navigateToConfirmation(),
              error: () => {
                this.validationError.set('Your subscription was created, but we could not activate the project. Please try activating it again from your projects page.');
                this.processing.set(false);
              },
            });
        },
        error: () => {
          this.validationError.set('Your card was saved but we could not start your subscription. Please contact support.');
          this.processing.set(false);
        },
      });
  }

  private activateProjectAfterSubscription(): Observable<unknown> {
    const projectId = this.activationProjectId();
    if (!projectId) return of(null);

    if (this.projectType() === 'team') {
      return this.http.patch(`${environment.apiUrl}/teams/projects/${projectId}`, {
        status: 'active',
        completedStep: 5,
      });
    }

    return this.http.patch(`${environment.apiUrl}/projects/${projectId}/activate`, {});
  }

  private navigateToConfirmation(): void {
    this.processing.set(false);
    this.teardownPaymentElement();
    this.router.navigate(['/pricing-plan-confirm'], {
      queryParams: {
        type: this.projectType(),
        projects: this.projects(),
        collaborators: this.collaborators(),
        documents: this.documents(),
        days: this.days(),
        total: this.total().toFixed(2),
        voucherCode: this.appliedVoucherCode() || null,
        projectId: this.activationProjectId() || null,
        name: `${this.firstName()} ${this.lastName()}`,
      },
    });
  }

  /** Absolute URL Stripe returns to after off-site authentication, preserving the order context. */
  private buildReturnUrl(): string {
    const base = window.location.origin + window.location.pathname;
    const params = new URLSearchParams({
      type: this.projectType(),
      projects: String(this.projects()),
      collaborators: String(this.collaborators()),
      documents: String(this.documents()),
      days: String(this.days()),
      monthly: String(this.monthlyBase()),
      customerId: this.customerId,
    });
    if (this.activationProjectId()) params.set('projectId', this.activationProjectId());
    if (this.appliedVoucherCode()) params.set('voucherCode', this.appliedVoucherCode());
    return `${base}?${params.toString()}`;
  }

  private normalizeVoucherCode(code: unknown): string {
    return String(code || '').trim().toUpperCase();
  }
}

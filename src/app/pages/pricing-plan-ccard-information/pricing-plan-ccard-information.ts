import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, ActivatedRoute, Router } from '@angular/router';
import type { Stripe, StripeElements, StripePaymentElement } from '@stripe/stripe-js';
import { LogoComponent } from '../../shared/logo/logo';
import { AuthService } from '../../services/auth.service';
import { StripeService } from '../../services/stripe.service';

const TAX_RATE = 0.08;

@Component({
  selector: 'app-pricing-plan-ccard-information',
  imports: [RouterLink, LogoComponent],
  templateUrl: './pricing-plan-ccard-information.html',
  styleUrl: './pricing-plan-ccard-information.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPlanCcardInformationComponent implements OnInit, AfterViewInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private destroyRef = inject(DestroyRef);
  private auth = inject(AuthService);
  private stripeService = inject(StripeService);

  /** Host element where the Stripe Payment Element iframe is mounted. */
  private paymentElementRef = viewChild<ElementRef<HTMLDivElement>>('paymentElement');

  projectType   = signal<'solo' | 'team'>('solo');
  projects      = signal(1);
  collaborators = signal(1);
  documents     = signal(1);
  days          = signal(20);
  monthlyBase   = signal(0);

  subtotal  = computed(() => this.monthlyBase());
  tax       = computed(() => Math.round(this.subtotal() * TAX_RATE * 100) / 100);
  total     = computed(() => this.subtotal() + this.tax());

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

    const { error, setupIntent } = await this.stripe.confirmSetup({
      elements: this.elements,
      clientSecret: this.clientSecret,
      confirmParams: {
        return_url: this.buildReturnUrl(),
        payment_method_data: {
          billing_details: {
            name: `${this.firstName()} ${this.lastName()}`.trim(),
            email: this.email(),
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

    if (error) {
      this.validationError.set(error.message ?? 'We could not confirm your card. Please check the details and try again.');
      this.processing.set(false);
      return;
    }

    if (setupIntent?.status === 'succeeded' && typeof setupIntent.payment_method === 'string') {
      this.createSubscriptionAndContinue(setupIntent.payment_method);
    }
    // Otherwise Stripe has redirected the browser for additional authentication;
    // the flow resumes in finalizeAfterRedirect() when the user returns.
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
        monthlyEstimate: this.total(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.processing.set(false);
          this.router.navigate(['/pricing-plan-confirm'], {
            queryParams: {
              type: this.projectType(),
              projects: this.projects(),
              collaborators: this.collaborators(),
              documents: this.documents(),
              days: this.days(),
              total: this.total().toFixed(2),
              name: `${this.firstName()} ${this.lastName()}`,
            },
          });
        },
        error: () => {
          this.validationError.set('Your card was saved but we could not start your subscription. Please contact support.');
          this.processing.set(false);
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
    return `${base}?${params.toString()}`;
  }
}

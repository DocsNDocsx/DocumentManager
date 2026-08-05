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
import type { Stripe, StripeCardElement, StripeElements } from '@stripe/stripe-js';
import { Observable, of } from 'rxjs';
import { LogoComponent } from '../../shared/logo/logo';
import { AuthService } from '../../services/auth.service';
import { StripeService } from '../../services/stripe.service';
import { environment } from '../../../environments/environment';

const STRIPE_CARD_PERCENT_FEE = 0.029;
const STRIPE_CARD_FIXED_FEE = 0.30;
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

  /** Host element where the Stripe card iframe is mounted. */
  private paymentElementRef = viewChild<ElementRef<HTMLDivElement>>('paymentElement');

  projectType   = signal<'solo' | 'team'>('solo');
  projects      = signal(1);
  collaborators = signal(1);
  documents     = signal(1);
  days          = signal(20);
  monthlyBase   = signal(0);
  activationProjectId = signal('');
  projectVisibility = signal('');
  isUpgrade = signal(false);
  extensionDays = signal(0);
  proratedUpgradeAmount = signal<number | null>(null);
  previousPaidProjectCost = signal<number | null>(null);
  updatedProjectCost = signal<number | null>(null);
  upgradePreviewLoading = signal(false);
  upgradePreviewError = signal('');
  voucherCode = signal('');
  appliedVoucherCode = signal('');
  voucherError = signal('');
  estimatedSalesTax = signal(0);
  taxEstimateLoading = signal(false);
  taxEstimateError = signal('');

  subtotal  = computed(() => this.isUpgrade() ? (this.proratedUpgradeAmount() ?? 0) : this.monthlyBase());
  grossTotal = computed(() => this.subtotal());
  voucherDiscount = computed(() => {
    const voucher = VOUCHERS[this.appliedVoucherCode()];
    if (!voucher) return 0;
    return Math.round(this.grossTotal() * voucher.percentOff) / 100;
  });
  subtotalAfterDiscount = computed(() => Math.max(0, this.grossTotal() - this.voucherDiscount()));
  stripeProcessingFee = computed(() => {
    const amount = this.subtotalAfterDiscount();
    if (amount <= 0) return 0;
    return Math.round((amount * STRIPE_CARD_PERCENT_FEE + STRIPE_CARD_FIXED_FEE) * 100) / 100;
  });
  taxableAmount = computed(() => this.subtotalAfterDiscount() + this.stripeProcessingFee());
  total = computed(() => this.taxableAmount() + this.estimatedSalesTax());
  appliedVoucherLabel = computed(() => {
    const voucher = VOUCHERS[this.appliedVoucherCode()];
    return voucher ? `${voucher.label} (${voucher.percentOff}% off)` : '';
  });
  durationTimeZone = computed(() => {
    const saved = this.auth.currentUserTimezone();
    const labels: Record<string, string> = {
      'UTC-5': 'Eastern Time', 'America/New_York': 'Eastern Time',
      'UTC-6': 'Central Time', 'America/Chicago': 'Central Time',
      'UTC-7': 'Mountain Time', 'America/Denver': 'Mountain Time',
      'UTC-8': 'Pacific Time', 'America/Los_Angeles': 'Pacific Time',
      'UTC+0': 'UTC', UTC: 'UTC',
      'UTC+1': 'Central European Time', 'Europe/Paris': 'Central European Time',
    };
    return labels[saved] ?? saved;
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
  /** True once the card field has been mounted and is ready for input. */
  stripeReady = signal(false);
  /** True while a payment is being confirmed / subscription created. */
  processing = signal(false);

  private stripe: Stripe | null = null;
  private elements: StripeElements | null = null;
  private paymentElement: StripeCardElement | null = null;
  private clientSecret = '';
  private customerId = '';
  private viewReady = false;
  private taxEstimateTimer: ReturnType<typeof setTimeout> | null = null;

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
        this.projectVisibility.set(String(params['visibility'] || ''));
        this.isUpgrade.set(params['upgrade'] === '1');
        this.extensionDays.set(Math.max(0, Number(params['extensionDays']) || 0));
        if (this.isUpgrade() && this.activationProjectId()) this.loadUpgradePreview();
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
    const billingProfile$ = this.stripeService.getBillingProfile?.();
    billingProfile$?.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: ({ billingAddress }) => {
        if (!billingAddress) return;
        this.address1.set(billingAddress.line1 ?? '');
        this.address2.set(billingAddress.line2 ?? '');
        this.city.set(billingAddress.city ?? '');
        this.state.set(billingAddress.state ?? '');
        this.zip.set(billingAddress.postalCode ?? '');
        this.country.set(billingAddress.country ?? 'US');
        this.queueTaxEstimate();
      }, error: () => {} });

    // If we're returning from a 3-D Secure redirect, finalize the subscription.
    const returningSecret = this.route.snapshot.queryParamMap.get('setup_intent_client_secret');
    if (returningSecret) {
      this.finalizeAfterRedirect(returningSecret);
      return;
    }

    this.initStripe();
  }

  private loadUpgradePreview(): void {
    this.upgradePreviewLoading.set(true);
    this.upgradePreviewError.set('');
    this.stripeService.previewSubscriptionUpgrade({
      projectId: this.activationProjectId(), type: this.projectType(), projects: this.projects(),
      collaborators: this.collaborators(), documents: this.documents(), days: this.days(), extensionDays: this.extensionDays(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: preview => {
        this.proratedUpgradeAmount.set(preview.proratedAmountDueCents / 100);
        this.previousPaidProjectCost.set(preview.previousAmountCents / 100);
        this.updatedProjectCost.set(preview.newRecurringAmountCents / 100);
        this.upgradePreviewLoading.set(false);
        this.queueTaxEstimate();
      },
      error: err => {
        this.upgradePreviewError.set(err?.error?.message ?? 'Could not calculate the prorated amount.');
        this.upgradePreviewLoading.set(false);
      },
    });
  }

  ngAfterViewInit(): void {
    this.viewReady = true;
    this.mountPaymentElement();
  }

  ngOnDestroy(): void {
    if (this.taxEstimateTimer) clearTimeout(this.taxEstimateTimer);
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

  /** Mounts the card-only Stripe Element once both the view and the client secret are ready. */
  private mountPaymentElement(): void {
    if (!this.stripe || !this.clientSecret || !this.viewReady || this.paymentElement) return;

    this.elements = this.stripe.elements();

    this.paymentElement = this.elements.create('card', {
      hidePostalCode: true,
      style: {
        base: {
          color: '#1f2937',
          fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, sans-serif',
          fontSize: '15px',
          '::placeholder': {
            color: '#9ca3af',
          },
        },
        invalid: {
          color: '#ef4444',
        },
      },
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

    if (!this.stripe || !this.paymentElement || !this.clientSecret) {
      this.validationError.set('The payment form is still loading. Please wait a moment and try again.');
      return;
    }

    this.processing.set(true);

    let confirmResult: any;
    try {
      confirmResult = await this.stripe.confirmCardSetup(this.clientSecret, {
        payment_method: {
          card: this.paymentElement,
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
    this.queueTaxEstimate();
  }

  clearVoucher(): void {
    this.voucherCode.set('');
    this.appliedVoucherCode.set('');
    this.voucherError.set('');
    this.queueTaxEstimate();
  }

  updateBillingAddress(
    field: 'address1' | 'address2' | 'city' | 'state' | 'zip' | 'country',
    value: string,
  ): void {
    const setters = {
      address1: this.address1,
      address2: this.address2,
      city: this.city,
      state: this.state,
      zip: this.zip,
      country: this.country,
    };
    setters[field].set(value);
    this.queueTaxEstimate();
  }

  private queueTaxEstimate(): void {
    if (this.taxEstimateTimer) clearTimeout(this.taxEstimateTimer);
    this.taxEstimateTimer = setTimeout(() => this.estimateTax(), 500);
  }

  private estimateTax(): void {
    this.taxEstimateTimer = null;

    const amountCents = Math.round(this.taxableAmount() * 100);
    if (amountCents <= 0 || !this.address1().trim() || !this.city().trim() ||
        !this.state().trim() || !this.zip().trim() || !this.country().trim()) {
      this.estimatedSalesTax.set(0);
      this.taxEstimateError.set('');
      this.taxEstimateLoading.set(false);
      return;
    }

    this.taxEstimateError.set('');
    this.taxEstimateLoading.set(true);
    this.stripeService.estimateTax({
      amountCents,
      billingAddress: {
        line1: this.address1() || undefined,
        line2: this.address2() || undefined,
        city: this.city() || undefined,
        state: this.state() || undefined,
        postalCode: this.zip(),
        country: this.country(),
      },
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: estimate => {
          this.estimatedSalesTax.set(Number(estimate.taxAmount) || 0);
          this.taxEstimateLoading.set(false);
        },
        error: err => {
          this.estimatedSalesTax.set(0);
          this.taxEstimateError.set(err?.error?.message ?? 'Sales tax could not be estimated for this address.');
          this.taxEstimateLoading.set(false);
        },
      });
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
    const request = {
        userid: this.auth.currentUserId(),
        customerId: this.customerId,
        paymentMethodId,
        type: this.projectType(),
        projects: this.projects(),
        collaborators: this.collaborators(),
        documents: this.documents(),
        days: this.days(),
        extensionDays: this.extensionDays(),
        projectId: this.activationProjectId() || null,
        monthlyEstimate: this.total(),
        voucherCode: this.appliedVoucherCode() || null,
        billingAddress: {
          line1: this.address1(),
          line2: this.address2() || undefined,
          city: this.city(),
          state: this.state(),
          postalCode: this.zip(),
          country: this.country(),
        },
      };
    const subscriptionRequest = this.isUpgrade()
      ? this.stripeService.upgradeSubscription(request)
      : this.stripeService.createSubscription(request);
    subscriptionRequest
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          if (this.isUpgrade()) {
            this.navigateToConfirmation();
            return;
          }
          this.activateProjectAfterSubscription()
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({
              next: response => this.navigateToConfirmation((response as any)?.project?.projectCode ?? null),
              error: err => {
                const reason = err?.error?.message ?? 'Project activation failed.';
                this.validationError.set(`Your subscription was created, but the project could not be activated: ${reason}`);
                this.processing.set(false);
              },
            });
        },
        error: err => {
          const serverReason = err?.error?.message;
          this.validationError.set(this.isUpgrade()
            ? (serverReason
                ? `The prorated project upgrade could not be charged: ${serverReason}`
                : 'Your card was saved but the prorated project upgrade could not be charged. No additional billing was applied.')
            : (serverReason ?? 'Your card was saved but we could not start your subscription. Please contact support.'));
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

  private navigateToConfirmation(activatedProjectCode: string | null = null): void {
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
        projectCode: activatedProjectCode || this.route.snapshot.queryParamMap.get('projectCode') || null,
        visibility: this.projectVisibility() || null,
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
    if (this.projectVisibility()) params.set('visibility', this.projectVisibility());
    const projectCode = this.route.snapshot.queryParamMap.get('projectCode');
    if (projectCode) params.set('projectCode', projectCode);
    if (this.isUpgrade()) params.set('upgrade', '1');
    if (this.extensionDays()) params.set('extensionDays', String(this.extensionDays()));
    if (this.appliedVoucherCode()) params.set('voucherCode', this.appliedVoucherCode());
    return `${base}?${params.toString()}`;
  }

  private normalizeVoucherCode(code: unknown): string {
    return String(code || '').trim().toUpperCase();
  }
}

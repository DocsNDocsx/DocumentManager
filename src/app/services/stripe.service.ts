import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { tap } from 'rxjs';
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { environment } from '../../environments/environment';
import {
  CreateSetupIntentRequest,
  CreateSetupIntentResponse,
  CreateSubscriptionRequest,
  CreateSubscriptionResponse,
  EstimateTaxRequest,
  EstimateTaxResponse,
} from '../models/stripe.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class StripeService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  /** Cached Stripe.js instance promise; loaded once and reused across the app. */
  private stripePromise: Promise<Stripe | null> | null = null;

  getStripe(): Promise<Stripe | null> {
    if (!this.stripePromise) {
      this.logger.debug('Loading Stripe.js');
      this.stripePromise = loadStripe(environment.stripePublishableKey);
    }
    return this.stripePromise;
  }

  /**
   * Backend creates (or reuses) a Stripe Customer and a SetupIntent, returning the
   * client secret used to collect and save the card via the Payment Element.
   *
   * Expected: POST {apiUrl}/stripe/setup-intent
   *   body  -> CreateSetupIntentRequest
   *   reply -> CreateSetupIntentResponse
   */
  createSetupIntent(data: CreateSetupIntentRequest) {
    this.logger.debug('Creating Stripe setup intent', { userid: data.userid });
    return this.http
      .post<CreateSetupIntentResponse>(`${environment.apiUrl}/stripe/setup-intent`, data)
      .pipe(
        tap({
          next: () => this.logger.debug('Setup intent created'),
          error: err => this.logger.error('Failed to create setup intent', err),
        }),
      );
  }

  /**
   * Backend attaches the confirmed PaymentMethod to the customer, sets it as default,
   * and creates a recurring Subscription for the chosen usage parameters.
   *
   * Expected: POST {apiUrl}/stripe/subscription
   *   body  -> CreateSubscriptionRequest
   *   reply -> CreateSubscriptionResponse
   */
  createSubscription(data: CreateSubscriptionRequest) {
    this.logger.info('Creating Stripe subscription', { userid: data.userid, type: data.type });
    return this.http
      .post<CreateSubscriptionResponse>(`${environment.apiUrl}/stripe/subscription`, data)
      .pipe(
        tap({
          next: res =>
            this.logger.info('Subscription created', {
              subscriptionId: res.subscriptionId,
              status: res.status,
            }),
          error: err => this.logger.error('Failed to create subscription', err),
        }),
      );
  }

  upgradeSubscription(data: CreateSubscriptionRequest) {
    return this.http.post<CreateSubscriptionResponse>(`${environment.apiUrl}/stripe/subscription/upgrade`, data);
  }

  previewSubscriptionUpgrade(data: Partial<CreateSubscriptionRequest> & { projectId: string }) {
    return this.http.post<{ success: boolean; proratedAmountDueCents: number; newRecurringAmountCents: number; prorationDate: number }>(
      `${environment.apiUrl}/stripe/subscription/upgrade-preview`, data,
    );
  }

  getBillingProfile() {
    return this.http.get<{ success: boolean; billingAddress: CreateSubscriptionRequest['billingAddress'] | null }>(
      `${environment.apiUrl}/stripe/billing-profile`,
    );
  }

  estimateTax(data: EstimateTaxRequest) {
    this.logger.debug('Estimating Stripe tax', {
      amountCents: data.amountCents,
      country: data.billingAddress.country,
      postalCode: data.billingAddress.postalCode,
    });
    return this.http
      .post<EstimateTaxResponse>(`${environment.apiUrl}/stripe/tax-estimate`, data)
      .pipe(
        tap({
          next: () => this.logger.debug('Tax estimate created'),
          error: err => this.logger.error('Failed to estimate tax', err),
        }),
      );
  }
}

import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { CancelSubscriptionResponse, PlansResponse, SubscriptionResponse, UpdateSubscriptionRequest, UpdateSubscriptionResponse } from '../models/subscription.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class SubscriptionService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  getPlans() {
    this.logger.debug('Fetching plans');
    return this.http.get<PlansResponse>(`${environment.apiUrl}/plans`).pipe(
      tap({
        next: res => this.logger.debug('Plans loaded', { count: res.plans?.length }),
        error: err => this.logger.error('Failed to load plans', err),
      }),
    );
  }

  getSubscription(userid: string) {
    this.logger.debug('Fetching subscription', { userid });
    const params = new HttpParams().set('userid', userid);
    return this.http.get<SubscriptionResponse>(`${environment.apiUrl}/subscription`, { params }).pipe(
      tap({
        next: res => this.logger.debug('Subscription loaded', { status: res.subscription?.status }),
        error: err => this.logger.error('Failed to load subscription', err),
      }),
    );
  }

  updateSubscription(data: UpdateSubscriptionRequest) {
    this.logger.info('Updating subscription', { planSlug: data.planSlug, billing: data.billingCycle });
    return this.http.put<UpdateSubscriptionResponse>(`${environment.apiUrl}/subscription`, data).pipe(
      tap({
        next: () => this.logger.info('Subscription updated', { planSlug: data.planSlug }),
        error: err => this.logger.error('Failed to update subscription', err),
      }),
    );
  }

  cancelSubscription(userid: string) {
    this.logger.warn('Cancelling subscription', { userid });
    return this.http.put<CancelSubscriptionResponse>(`${environment.apiUrl}/subscription/cancel`, { userid }).pipe(
      tap({
        next: () => this.logger.info('Subscription cancelled', { userid }),
        error: err => this.logger.error('Failed to cancel subscription', err),
      }),
    );
  }
}

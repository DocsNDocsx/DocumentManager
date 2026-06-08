export interface CreateSetupIntentRequest {
  userid: string;
  email: string;
  name: string;
}

export interface CreateSetupIntentResponse {
  success: boolean;
  /** SetupIntent client secret used to mount the Payment Element and confirm setup. */
  clientSecret: string;
  /** Stripe customer id created/looked-up for this user; echoed back when creating the subscription. */
  customerId: string;
}

export interface CreateSubscriptionRequest {
  userid: string;
  customerId: string;
  /** PaymentMethod id produced by the confirmed SetupIntent. */
  paymentMethodId: string;
  type: 'solo' | 'team';
  projects: number;
  collaborators: number;
  days: number;
  /** Estimated monthly total shown to the user (informational; server is source of truth). */
  monthlyEstimate: number;
}

export interface CreateSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  status: string;
  nextPaymentAt: string | null;
}

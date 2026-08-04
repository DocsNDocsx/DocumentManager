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
  documents: number;
  days: number;
  /** Project being activated by this payment. */
  projectId?: string | null;
  /** Estimated monthly total shown to the user (informational; server is source of truth). */
  monthlyEstimate: number;
  /** Optional server-validated discount voucher code. */
  voucherCode?: string | null;
  /** Billing address sent to Stripe so automatic tax can calculate by ZIP/address. */
  billingAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface CreateSubscriptionResponse {
  success: boolean;
  subscriptionId: string;
  status: string;
  nextPaymentAt: string | null;
}

export interface EstimateTaxRequest {
  amountCents: number;
  billingAddress: {
    line1?: string;
    line2?: string;
    city?: string;
    state?: string;
    postalCode: string;
    country: string;
  };
}

export interface EstimateTaxResponse {
  success: boolean;
  taxAmount: number;
  totalAmount: number;
  taxAmountCents: number;
  totalAmountCents: number;
  calculationId: string | null;
  taxEstimateUnavailable?: boolean;
}

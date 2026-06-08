export interface PlanRecord {
  id: number;
  slug: string;
  name: string;
  price_monthly: number;
  price_annual: number;
  max_storage_gb: number;
  min_members: number;
  max_members: number;
  features: string[];
}

export interface PlansResponse {
  success: boolean;
  plans: PlanRecord[];
}

export interface SubscriptionRecord {
  id: number;
  planSlug: string;
  planName: string;
  priceMonthly: number;
  priceAnnual: number;
  billingCycle: 'monthly' | 'annual';
  status: 'active' | 'cancelled' | 'expired';
  nextPaymentAt: string | null;
  daysInCycle: number;
  daysRemaining: number;
}

export interface CancelSubscriptionResponse {
  success: boolean;
  message?: string;
}

export interface SubscriptionResponse {
  success: boolean;
  subscription: SubscriptionRecord | null;
}

export interface UpdateSubscriptionRequest {
  userid: string;
  planSlug: string;
  billingCycle: 'monthly' | 'annual';
}

export interface UpdateSubscriptionResponse {
  success: boolean;
  nextPaymentAt: string;
}

export interface PaymentRecord {
  date: string;
  invoice: string;
  plan: string;
  amount: string;
  status: string;
  method: string;
  teams?: string;
}

export interface PaymentSummary {
  totalSpent: string;
  totalSpentSub: string;
  totalPayments: number;
  totalPaymentsSub: string;
  currentPlan: string;
  currentPlanSub: string;
  nextPayment: string;
  nextPaymentSub: string;
}

export interface PaymentHistoryResponse {
  success: boolean;
  summary: PaymentSummary;
  payments: PaymentRecord[];
}

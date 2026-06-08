export type CardType = 'visa' | 'mastercard' | 'amex' | 'discover' | 'generic';

export interface PaymentCard {
  id: number;
  number: string;
  name: string;
  expiry: string;
  type: CardType;
  isDefault: boolean;
}

export interface CardsResponse {
  success: boolean;
  cards: PaymentCard[];
}

export interface AddCardRequest {
  userid: string;
  last4: string;
  card_type: CardType;
  card_holder: string;
  expiry_month: number;
  expiry_year: number;
  is_default: boolean;
  type: 'solo' | 'team';
}

export interface AddCardResponse {
  success: boolean;
  card: PaymentCard;
}

export interface MutateCardResponse {
  success: boolean;
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';

import { DropDownPaymentCardsComponent } from './drop-down-payment-cards';
import { CardsService } from '../../services/cards.service';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';
import { PaymentCard } from '../../models/cards.models';

const cards: PaymentCard[] = [
  { id: 1, number: '**** **** **** 4242', name: 'MRIDUL MISHRA', expiry: '12/30', type: 'visa', isDefault: true },
  { id: 2, number: '**** **** **** 4444', name: 'MRIDUL MISHRA', expiry: '01/31', type: 'mastercard', isDefault: false },
];

describe('DropDownPaymentCardsComponent', () => {
  let component: DropDownPaymentCardsComponent;
  let fixture: ComponentFixture<DropDownPaymentCardsComponent>;
  let cardsService: any;

  beforeEach(async () => {
    cardsService = {
      getCards: vi.fn().mockReturnValue(of({ success: true, cards })),
      addCard: vi.fn().mockReturnValue(of({ success: true, card: cards[1] })),
      setDefault: vi.fn().mockReturnValue(of({ success: true })),
      deleteCard: vi.fn().mockReturnValue(of({ success: true })),
    };

    await TestBed.configureTestingModule({
      imports: [DropDownPaymentCardsComponent, RouterModule.forRoot([])],
      providers: [
        { provide: CardsService, useValue: cardsService },
        {
          provide: AuthService,
          useValue: {
            currentUserId: signal('123'),
            currentUserFirstname: signal('Mridul'),
            currentUserLastname: signal('Mishra'),
            currentUserEmail: signal('mridul@example.com'),
            currentUserAvatar: signal(''),
            logout: vi.fn(),
          },
        },
        { provide: LoggingService, useValue: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DropDownPaymentCardsComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('loads solo cards on create', () => {
    expect(cardsService.getCards).toHaveBeenCalledWith('123', 'solo');
    expect(component.currentCards()).toEqual(cards);
    expect(component.isLoading()).toBe(false);
  });

  it('switches to team cards and resets selected team', async () => {
    component.switchView('team');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.currentView()).toBe('team');
    expect(component.currentTeam()).toBe('alpha');
    expect(cardsService.getCards).toHaveBeenLastCalledWith('123', 'team');
  });

  it('switches team and fetches team cards', () => {
    component.switchView('team');
    component.switchTeam('finance');

    expect(component.currentTeam()).toBe('finance');
    expect(cardsService.getCards).toHaveBeenCalledWith('123', 'team');
  });

  it('formats card input fields and derives card type when saving', () => {
    component.openModal();
    component.formatCardNumber({ target: { value: '4242424242424242' } } as unknown as Event);
    component.formatExpiry({ target: { value: '1230' } } as unknown as Event);
    component.formatCVV({ target: { value: '12a3' } } as unknown as Event);
    component.newCardName.set('Mridul Mishra');

    component.saveCard();

    expect(component.newCardNumber()).toBe('4242 4242 4242 4242');
    expect(component.newCardExpiry()).toBe('12/30');
    expect(component.newCardCVV()).toBe('123');
    expect(cardsService.addCard).toHaveBeenCalledWith({
      userid: '123',
      last4: '4242',
      card_type: 'visa',
      card_holder: 'Mridul Mishra',
      expiry_month: 12,
      expiry_year: 2030,
      is_default: true,
      type: 'solo',
    });
    expect(component.showModal()).toBe(false);
  });

  it('does not save incomplete or invalid card details', () => {
    component.openModal();
    component.newCardNumber.set('1234');
    component.newCardName.set('Mridul');
    component.newCardExpiry.set('12/30');
    component.newCardCVV.set('123');

    component.saveCard();

    expect(cardsService.addCard).not.toHaveBeenCalled();
  });

  it('sets default and deletes cards, then refreshes list', () => {
    component.setCardAsDefault(2);
    component.deleteCard(2);

    expect(cardsService.setDefault).toHaveBeenCalledWith(2, '123', 'solo');
    expect(cardsService.deleteCard).toHaveBeenCalledWith(2, '123');
    expect(cardsService.getCards).toHaveBeenCalledTimes(3);
  });

  it('handles card mutation errors', () => {
    cardsService.setDefault.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    cardsService.deleteCard.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    cardsService.addCard.mockReturnValueOnce(throwError(() => ({ status: 500 })));

    component.setCardAsDefault(2);
    expect(component.errorMessage()).toBe('Failed to set default card.');

    component.deleteCard(2);
    expect(component.errorMessage()).toBe('Failed to remove card.');

    component.openModal();
    component.newCardNumber.set('4242 4242 4242 4242');
    component.newCardName.set('Mridul Mishra');
    component.newCardExpiry.set('12/30');
    component.newCardCVV.set('123');
    component.saveCard();
    expect(component.errorMessage()).toBe('Failed to add card.');
    expect(component.isSaving()).toBe(false);
  });

  it('shows load errors and exposes card helpers', async () => {
    cardsService.getCards.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    component.switchView('team');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage()).toBe('Failed to load cards.');
    expect(component.getCardIcon('visa')).toBe('fa-cc-visa');
    component.switchView('solo');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.canDelete(cards[0])).toBe(false);
    expect(component.canDelete(cards[1])).toBe(true);
  });
});

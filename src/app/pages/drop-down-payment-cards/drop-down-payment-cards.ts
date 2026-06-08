import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamSelectorComponent, TeamOption } from '../../shared/team-selector/team-selector';
import { CardsService } from '../../services/cards.service';
import { AuthService } from '../../services/auth.service';
import { CardType, PaymentCard } from '../../models/cards.models';
import { LoggingService } from '../../services/logging.service';

type TeamKey = 'alpha' | 'product' | 'finance' | 'research';

const TEAM_NAMES: Record<TeamKey, string> = {
  alpha: 'Alpha Marketing Group',
  product: 'Product Development Team',
  finance: 'Finance Department',
  research: 'Research & Analytics',
};

@Component({
  selector: 'app-drop-down-payment-cards',
  templateUrl: './drop-down-payment-cards.html',
  styleUrl: './drop-down-payment-cards.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent, TeamSelectorComponent],
  host: { '(document:click)': 'onDocumentClick()' },
})
export class DropDownPaymentCardsComponent {
  private cardsService = inject(CardsService);
  private authService = inject(AuthService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  currentView = signal<'solo' | 'team'>('solo');
  currentTeam = signal<TeamKey>('alpha');
  showModal = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');
  isSaving = signal(false);

  newCardNumber = signal('');
  newCardName = signal('');
  newCardExpiry = signal('');
  newCardCVV = signal('');
  setAsDefault = signal(true);

  private soloCards = signal<PaymentCard[]>([]);
  private teamCards = signal<PaymentCard[]>([]);

  currentCards = computed<PaymentCard[]>(() =>
    this.currentView() === 'solo' ? this.soloCards() : this.teamCards()
  );

  pageTitle = computed(() =>
    this.currentView() === 'solo' ? 'Payment Cards — Solo Projects' : `Payment Cards — ${TEAM_NAMES[this.currentTeam()]}`
  );

  pageSubtitle = computed(() =>
    this.currentView() === 'solo'
      ? 'Manage your payment methods for solo project subscriptions'
      : `Manage payment methods for ${TEAM_NAMES[this.currentTeam()]} subscriptions`
  );

  readonly teamOptions: TeamOption[] = Object.entries(TEAM_NAMES).map(([value, label]) => ({ value, label }));

  constructor() {
    effect(() => {
      const view = this.currentView();
      this.fetchCards(view);
    });
  }

  private fetchCards(type: 'solo' | 'team'): void {
    const userid = this.authService.currentUserId();
    if (!userid) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.cardsService.getCards(userid, type).subscribe({
      next: ({ cards }) => {
        if (type === 'solo') this.soloCards.set(cards);
        else this.teamCards.set(cards);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load cards.');
        this.isLoading.set(false);
      },
    });
  }

  getCardIcon(type: CardType): string {
    const icons: Record<CardType, string> = {
      visa: 'fa-cc-visa', mastercard: 'fa-cc-mastercard',
      amex: 'fa-cc-amex', discover: 'fa-cc-discover', generic: 'fa-credit-card',
    };
    return icons[type];
  }

  canDelete(card: PaymentCard): boolean {
    return this.currentCards().length > 1 && !card.isDefault;
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  onDocumentClick(): void {
    this.dropdownOpen.set(false);
  }

  switchView(view: 'solo' | 'team'): void {
    this.currentView.set(view);
    if (view === 'team') this.currentTeam.set('alpha');
  }

  switchTeam(team: string): void {
    this.currentTeam.set(team as TeamKey);
    this.fetchCards('team');
  }

  setCardAsDefault(cardId: number): void {
    const userid = this.authService.currentUserId();
    const type = this.currentView();
    this.logger.info('Setting card as default', { cardId, type });
    this.cardsService.setDefault(cardId, userid, type).subscribe({
      next: () => { this.logger.info('Default card set', { cardId }); this.fetchCards(type); },
      error: (err) => { this.logger.error('Failed to set default card', err); this.errorMessage.set('Failed to set default card.'); },
    });
  }

  deleteCard(cardId: number): void {
    const userid = this.authService.currentUserId();
    const type = this.currentView();
    this.logger.warn('Deleting payment card', { cardId, type });
    this.cardsService.deleteCard(cardId, userid).subscribe({
      next: () => { this.logger.info('Card deleted', { cardId }); this.fetchCards(type); },
      error: (err) => { this.logger.error('Failed to delete card', err); this.errorMessage.set('Failed to remove card.'); },
    });
  }

  openModal(): void {
    this.newCardNumber.set('');
    this.newCardName.set('');
    this.newCardExpiry.set('');
    this.newCardCVV.set('');
    this.setAsDefault.set(true);
    this.errorMessage.set('');
    this.showModal.set(true);
  }

  closeModal(): void {
    this.showModal.set(false);
  }

  onModalOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeModal();
    }
  }

  formatCardNumber(event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\s/g, '');
    const formatted = v.match(/.{1,4}/g)?.join(' ') ?? v;
    this.newCardNumber.set(formatted);
    input.value = formatted;
  }

  formatExpiry(event: Event): void {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '');
    if (v.length >= 2) v = v.slice(0, 2) + '/' + v.slice(2, 4);
    this.newCardExpiry.set(v);
    input.value = v;
  }

  formatCVV(event: Event): void {
    const input = event.target as HTMLInputElement;
    const v = input.value.replace(/\D/g, '');
    this.newCardCVV.set(v);
    input.value = v;
  }

  saveCard(): void {
    const number = this.newCardNumber().trim();
    const name = this.newCardName().trim();
    const expiry = this.newCardExpiry().trim();
    const cvv = this.newCardCVV().trim();

    if (!number || !name || !expiry || !cvv) return;
    if (number.replace(/\s/g, '').length < 13) return;
    if (!/^\d{2}\/\d{2}$/.test(expiry)) return;
    if (cvv.length < 3) return;

    const stripped = number.replace(/\s/g, '');
    const first = stripped[0];
    const card_type: CardType = first === '4' ? 'visa' : first === '5' ? 'mastercard' : first === '3' ? 'amex' : 'generic';
    const last4 = stripped.slice(-4);
    const [monthStr, yearStr] = expiry.split('/');

    this.isSaving.set(true);
    this.logger.info('Saving new card', { last4, type: this.currentView() });

    this.cardsService.addCard({
      userid: this.authService.currentUserId(),
      last4,
      card_type,
      card_holder: name,
      expiry_month: parseInt(monthStr, 10),
      expiry_year: parseInt('20' + yearStr, 10),
      is_default: this.setAsDefault(),
      type: this.currentView(),
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.logger.info('Card added successfully', { last4 });
        this.closeModal();
        this.fetchCards(this.currentView());
      },
      error: (err) => {
        this.isSaving.set(false);
        this.logger.error('Failed to add card', err);
        this.errorMessage.set('Failed to add card.');
      },
    });
  }
}

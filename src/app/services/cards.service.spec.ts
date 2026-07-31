import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { CardsService } from './cards.service';
import { LoggingService } from './logging.service';
import { environment } from '../../environments/environment';
import { AddCardRequest, PaymentCard } from '../models/cards.models';

describe('CardsService', () => {
  let service: CardsService;
  let http: HttpTestingController;
  let logger: { debug: ReturnType<typeof vi.fn>; info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  const card: PaymentCard = {
    id: 7,
    number: '**** **** **** 4242',
    name: 'Mridul Mishra',
    expiry: '12/30',
    type: 'visa',
    isDefault: true,
  };

  beforeEach(() => {
    logger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: LoggingService, useValue: logger },
      ],
    });

    service = TestBed.inject(CardsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('loads cards with userid and project type query params', () => {
    let result: PaymentCard[] | undefined;

    service.getCards('123', 'solo').subscribe(res => (result = res.cards));

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/cards`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('userid')).toBe('123');
    expect(req.request.params.get('type')).toBe('solo');

    req.flush({ success: true, cards: [card] });

    expect(result).toEqual([card]);
    expect(logger.debug).toHaveBeenCalledWith('Cards loaded', { count: 1, type: 'solo' });
  });

  it('posts card details when adding a card', () => {
    const payload: AddCardRequest = {
      userid: '123',
      last4: '4242',
      card_type: 'visa',
      card_holder: 'Mridul Mishra',
      expiry_month: 12,
      expiry_year: 2030,
      is_default: true,
      type: 'team',
    };
    let success: boolean | undefined;

    service.addCard(payload).subscribe(res => (success = res.success));

    const req = http.expectOne(`${environment.apiUrl}/cards`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(payload);

    req.flush({ success: true, card });

    expect(success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('Card added', { last4: '4242' });
  });

  it('patches a selected card as default', () => {
    let success: boolean | undefined;

    service.setDefault(7, '123', 'team').subscribe(res => (success = res.success));

    const req = http.expectOne(`${environment.apiUrl}/cards/7/default`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ userid: '123', type: 'team' });

    req.flush({ success: true });

    expect(success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('Default card updated', { cardId: 7 });
  });

  it('deletes a card with userid query param', () => {
    let success: boolean | undefined;

    service.deleteCard(7, '123').subscribe(res => (success = res.success));

    const req = http.expectOne(r => r.url === `${environment.apiUrl}/cards/7`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.params.get('userid')).toBe('123');

    req.flush({ success: true });

    expect(success).toBe(true);
    expect(logger.info).toHaveBeenCalledWith('Card deleted', { cardId: 7 });
  });

  it('logs load errors', () => {
    service.getCards('123', 'solo').subscribe({ error: () => {} });

    http.expectOne(r => r.url === `${environment.apiUrl}/cards`)
      .flush({ message: 'fail' }, { status: 500, statusText: 'Server Error' });

    expect(logger.error).toHaveBeenCalledWith('Failed to load cards', expect.anything());
  });
});

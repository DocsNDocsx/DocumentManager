import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AddCardRequest, AddCardResponse, CardsResponse, MutateCardResponse } from '../models/cards.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class CardsService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  getCards(userid: string, type: 'solo' | 'team') {
    this.logger.debug('Fetching payment cards', { userid, type });
    const params = new HttpParams().set('userid', userid).set('type', type);
    return this.http.get<CardsResponse>(`${environment.apiUrl}/cards`, { params }).pipe(
      tap({
        next: res => this.logger.debug('Cards loaded', { count: res.cards?.length, type }),
        error: err => this.logger.error('Failed to load cards', err),
      }),
    );
  }

  addCard(data: AddCardRequest) {
    this.logger.info('Adding payment card', { type: data.type, last4: data.last4 });
    return this.http.post<AddCardResponse>(`${environment.apiUrl}/cards`, data).pipe(
      tap({
        next: () => this.logger.info('Card added', { last4: data.last4 }),
        error: err => this.logger.error('Failed to add card', err),
      }),
    );
  }

  setDefault(cardId: number, userid: string, type: 'solo' | 'team') {
    this.logger.info('Setting default card', { cardId, type });
    return this.http.patch<MutateCardResponse>(`${environment.apiUrl}/cards/${cardId}/default`, { userid, type }).pipe(
      tap({
        next: () => this.logger.info('Default card updated', { cardId }),
        error: err => this.logger.error('Failed to set default card', err),
      }),
    );
  }

  deleteCard(cardId: number, userid: string) {
    this.logger.warn('Deleting card', { cardId, userid });
    const params = new HttpParams().set('userid', userid);
    return this.http.delete<MutateCardResponse>(`${environment.apiUrl}/cards/${cardId}`, { params }).pipe(
      tap({
        next: () => this.logger.info('Card deleted', { cardId }),
        error: err => this.logger.error('Failed to delete card', err),
      }),
    );
  }
}

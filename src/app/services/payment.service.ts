import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { PaymentHistoryResponse } from '../models/payment.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private http = inject(HttpClient);
  private logger = inject(LoggingService);

  getPaymentHistory(userid: string, type: 'solo' | 'team') {
    this.logger.debug('Fetching payment history', { userid, type });
    const params = new HttpParams().set('userid', userid).set('type', type);
    return this.http.get<PaymentHistoryResponse>(`${environment.apiUrl}/payment/history`, { params }).pipe(
      tap({
        next: res => this.logger.debug('Payment history loaded', { count: res.payments?.length, type }),
        error: err => this.logger.error('Failed to load payment history', err),
      }),
    );
  }
}

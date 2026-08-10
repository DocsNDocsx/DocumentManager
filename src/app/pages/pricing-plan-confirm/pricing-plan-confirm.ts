import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { StripeService } from '../../services/stripe.service';

@Component({
  selector: 'app-pricing-plan-confirm',
  imports: [RouterLink],
  templateUrl: './pricing-plan-confirm.html',
  styleUrl: './pricing-plan-confirm.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPlanConfirmComponent implements OnInit {
  private route      = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);
  private stripeService = inject(StripeService);

  isLoading = signal(true);
  loadError = signal('');
  projectType   = signal('');
  projects      = signal(0);
  collaborators = signal(0);
  documents     = signal(0);
  days          = signal(0);
  amountCharged = signal('');
  customerName  = signal('');
  projectId = signal('');
  projectCode = signal('');
  projectVisibility = signal('');
  timezone = signal('');
  invoiceNumber = signal('');

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const invoiceId = String(params['invoiceId'] || '').trim();
        if (!invoiceId) {
          this.isLoading.set(false);
          this.loadError.set('Payment details could not be verified. Check Payment History or contact support.');
          return;
        }
        this.stripeService.getPaymentConfirmation(invoiceId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: ({ confirmation }) => {
              this.projectType.set(confirmation.projectType === 'team' ? 'Team' : 'Solo');
              this.projects.set(confirmation.projects);
              this.collaborators.set(confirmation.collaborators);
              this.documents.set(confirmation.documents);
              this.days.set(confirmation.days);
              this.amountCharged.set(confirmation.amountCharged);
              this.customerName.set(confirmation.customerName);
              this.projectId.set(confirmation.projectId);
              this.projectCode.set(confirmation.projectCode ?? '');
              this.projectVisibility.set(confirmation.visibility);
              this.timezone.set(confirmation.timezone);
              this.invoiceNumber.set(confirmation.invoiceNumber);
              this.isLoading.set(false);
            },
            error: err => {
              this.isLoading.set(false);
              this.loadError.set(err?.error?.message ?? 'Payment details could not be verified. Check Payment History or contact support.');
            },
          });
      });
  }
}

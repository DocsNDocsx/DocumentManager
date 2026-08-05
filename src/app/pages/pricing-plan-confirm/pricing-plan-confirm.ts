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

  projectType   = signal('Solo');
  projects      = signal(1);
  collaborators = signal(1);
  documents     = signal(1);
  days          = signal(20);
  amountCharged = signal('0.00');
  customerName  = signal('Customer');
  projectId = signal('Not available');
  projectCode = signal('');
  projectVisibility = signal('');

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        this.projectType.set(
          (params['type'] || 'solo') === 'team' ? 'Team' : 'Solo'
        );
        this.projects.set(+params['projects'] || 1);
        this.collaborators.set(+params['collaborators'] || 1);
        this.documents.set(+params['documents'] || 1);
        this.days.set(+params['days'] || 20);
        this.amountCharged.set(params['total'] || '0.00');
        this.customerName.set(params['name'] || 'Customer');
        this.projectId.set(params['projectId'] || 'Not available');
        this.projectCode.set(params['projectCode'] || '');
        this.projectVisibility.set(params['visibility'] || '');
      });
  }
}

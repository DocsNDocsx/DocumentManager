import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';

const RATE = 0.09; // $ per project · collaborator · day

@Component({
  selector: 'app-pricing-plan',
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  templateUrl: './pricing-plan.html',
  styleUrl: './pricing-plan.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PricingPlanComponent implements OnInit {
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private destroyRef = inject(DestroyRef);

  readonly rate = RATE;

  projectType = signal<'solo' | 'team'>('solo');
  projects    = signal(3);
  collaborators = signal(1);
  documents   = signal(5);
  days        = signal(20);
  subscriptionRequired = signal(false);

  isSolo = computed(() => this.projectType() === 'solo');

  effectiveCollaborators = computed(() => this.collaborators());

  dailyRate = computed(() =>
    this.projects() * this.effectiveCollaborators() * this.documents() * RATE
  );

  monthlyEstimate = computed(() =>
    this.dailyRate() * this.days()
  );

  annualEstimate = computed(() =>
    this.monthlyEstimate() * 12
  );

  perProjectDay = computed(() =>
    this.effectiveCollaborators() * this.documents() * RATE
  );

  ngOnInit(): void {
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(params => {
        const type = params['type'];
        if (type === 'team') {
          this.projectType.set('team');
          if (this.collaborators() < 2) this.collaborators.set(2);
        }
        this.subscriptionRequired.set(params['subscriptionRequired'] === '1');
      });
  }

  setType(type: 'solo' | 'team'): void {
    this.projectType.set(type);
  }

  setProjects(event: Event): void {
    this.projects.set(+(event.target as HTMLInputElement).value);
  }

  setCollaborators(event: Event): void {
    this.collaborators.set(+(event.target as HTMLInputElement).value);
  }

  setDocuments(event: Event): void {
    this.documents.set(+(event.target as HTMLInputElement).value);
  }

  setDays(event: Event): void {
    this.days.set(+(event.target as HTMLInputElement).value);
  }

  subscribe(): void {
    this.router.navigate(['/pricing-plan-ccard-information'], {
      queryParams: {
        type: this.projectType(),
        projects: this.projects(),
        collaborators: this.effectiveCollaborators(),
        documents: this.documents(),
        days: this.days(),
        monthly: this.monthlyEstimate().toFixed(2),
      },
    });
  }

  fmt(value: number): string {
    return '$' + value.toFixed(2);
  }
}

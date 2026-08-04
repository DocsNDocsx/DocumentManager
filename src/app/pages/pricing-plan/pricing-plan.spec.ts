import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { PricingPlanComponent } from './pricing-plan';

describe('PricingPlanComponent', () => {
  let component: PricingPlanComponent;
  let fixture: ComponentFixture<PricingPlanComponent>;
  let queryParams$: BehaviorSubject<Record<string, string>>;
  let router: Router;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Record<string, string>>({});

    await TestBed.configureTestingModule({
      imports: [PricingPlanComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingPlanComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('calculates usage pricing from collaborators, documents, and days', () => {
    component.collaborators.set(2);
    component.documents.set(5);
    component.days.set(20);

    expect(component.dailyRate()).toBeCloseTo(0.9);
    expect(component.monthlyEstimate()).toBeCloseTo(18);
    expect(component.annualEstimate()).toBeCloseTo(216);
    expect(component.fmt(component.monthlyEstimate())).toBe('$18.00');
  });

  it('labels the duration as project days and supports up to one year', () => {
    component.days.set(45);
    fixture.detectChanges();

    const slider = fixture.nativeElement.querySelector('#days-slider') as HTMLInputElement;
    const label = fixture.nativeElement.querySelector('label[for="days-slider"]') as HTMLElement;
    const value = slider.closest('.slider-row')?.querySelector('.slider-val') as HTMLElement;

    expect(label.textContent?.trim()).toBe('Project duration');
    expect(slider.max).toBe('365');
    expect(slider.getAttribute('aria-label')).toBe('Project duration in days');
    expect(value.textContent?.trim()).toBe('45 days');
  });

  it('reads team and subscription-required query params', () => {
    queryParams$.next({ type: 'team', subscriptionRequired: '1' });
    component.ngOnInit();

    expect(component.projectType()).toBe('team');
    expect(component.collaborators()).toBe(2);
    expect(component.subscriptionRequired()).toBe(true);
  });

  it('updates inputs and navigates to billing page on subscribe', () => {
    component.setType('team');
    component.setCollaborators({ target: { value: '3' } } as unknown as Event);
    component.setDocuments({ target: { value: '4' } } as unknown as Event);
    component.setDays({ target: { value: '10' } } as unknown as Event);

    component.subscribe();

    expect(router.navigate).toHaveBeenCalledWith(['/pricing-plan-ccard-information'], {
      queryParams: {
        type: 'team',
        projects: 1,
        collaborators: 3,
        documents: 4,
        days: 10,
        monthly: '10.80',
      },
    });
  });
});

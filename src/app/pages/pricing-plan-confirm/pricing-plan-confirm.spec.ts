import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { StripeService } from '../../services/stripe.service';

import { PricingPlanConfirmComponent } from './pricing-plan-confirm';

describe('PricingPlanConfirmComponent', () => {
  let component: PricingPlanConfirmComponent;
  let fixture: ComponentFixture<PricingPlanConfirmComponent>;
  let queryParams$: BehaviorSubject<Record<string, string>>;
  let stripeService: { getPaymentConfirmation: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Record<string, string>>({});
    stripeService = { getPaymentConfirmation: vi.fn() };
    await TestBed.configureTestingModule({
      imports: [PricingPlanConfirmComponent, RouterModule.forRoot([])],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingPlanConfirmComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows verification failure instead of defaults when invoice id is missing', () => {
    component.ngOnInit();

    expect(component.loadError()).toContain('could not be verified');
    expect(stripeService.getPaymentConfirmation).not.toHaveBeenCalled();
  });

  it('loads authoritative billing confirmation by invoice id', () => {
    stripeService.getPaymentConfirmation.mockReturnValue(of({ success: true, confirmation: {
      invoiceId: 'in_123', invoiceNumber: 'INV-123', projectId: 'project-123', projectCode: 'PRJ-2TJS-FYD7',
      projectType: 'solo', visibility: 'public', projects: 1, collaborators: 5, documents: 7, days: 30,
      amountCharged: '94.50', currency: 'USD', customerName: 'Mridul Mishra', timezone: 'America/Chicago',
      paidAt: '2026-08-09T12:00:00.000Z',
    }}));
    queryParams$.next({ invoiceId: 'in_123' });
    component.ngOnInit();

    expect(stripeService.getPaymentConfirmation).toHaveBeenCalledWith('in_123');
    expect(component.projectType()).toBe('Solo');
    expect(component.projects()).toBe(1);
    expect(component.collaborators()).toBe(5);
    expect(component.documents()).toBe(7);
    expect(component.days()).toBe(30);
    expect(component.amountCharged()).toBe('94.50');
    expect(component.customerName()).toBe('Mridul Mishra');
    expect(component.projectId()).toBe('project-123');
    expect(component.projectCode()).toBe('PRJ-2TJS-FYD7');
    expect(component.timezone()).toBe('America/Chicago');
    expect(component.invoiceNumber()).toBe('INV-123');
  });

  it('does not display the internal project id for a solo private confirmation', () => {
    stripeService.getPaymentConfirmation.mockReturnValue(of({ success: true, confirmation: {
      invoiceId: 'in_private', invoiceNumber: 'INV-P', projectId: 'private-project-uuid', projectCode: null,
      projectType: 'solo', visibility: 'private', projects: 1, collaborators: 1, documents: 1, days: 2,
      amountCharged: '0.49', currency: 'USD', customerName: 'Mridul Mishra', timezone: 'America/New_York',
      paidAt: '2026-08-09T12:00:00.000Z',
    }}));
    queryParams$.next({ invoiceId: 'in_private' });
    component.ngOnInit();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(component.projectVisibility()).toBe('private');
    expect(text).not.toContain('Project ID');
    expect(text).not.toContain('private-project-uuid');
  });

  it('shows the backend verification error', () => {
    stripeService.getPaymentConfirmation.mockReturnValue(throwError(() => ({ error: { message: 'Payment has not been completed' } })));
    queryParams$.next({ invoiceId: 'in_unpaid' });
    component.ngOnInit();
    expect(component.loadError()).toBe('Payment has not been completed');
  });
});

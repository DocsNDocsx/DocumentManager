import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { BehaviorSubject } from 'rxjs';

import { PricingPlanConfirmComponent } from './pricing-plan-confirm';

describe('PricingPlanConfirmComponent', () => {
  let component: PricingPlanConfirmComponent;
  let fixture: ComponentFixture<PricingPlanConfirmComponent>;
  let queryParams$: BehaviorSubject<Record<string, string>>;

  beforeEach(async () => {
    queryParams$ = new BehaviorSubject<Record<string, string>>({});
    await TestBed.configureTestingModule({
      imports: [PricingPlanConfirmComponent, RouterModule.forRoot([])],
      providers: [
        { provide: ActivatedRoute, useValue: { queryParams: queryParams$.asObservable() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingPlanConfirmComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses default confirmation values when query params are missing', () => {
    component.ngOnInit();

    expect(component.projectType()).toBe('Solo');
    expect(component.projects()).toBe(1);
    expect(component.collaborators()).toBe(1);
    expect(component.documents()).toBe(1);
    expect(component.days()).toBe(20);
    expect(component.amountCharged()).toBe('0.00');
    expect(component.customerName()).toBe('Customer');
    expect(component.projectId()).toBe('Not available');
  });

  it('reads billing confirmation details from query params', () => {
    queryParams$.next({
      type: 'team',
      projects: '2',
      collaborators: '5',
      documents: '7',
      days: '30',
      total: '94.50',
      name: 'Mridul Mishra',
      projectId: 'project-123',
      projectCode: 'PRJ-2TJS-FYD7',
    });
    component.ngOnInit();

    expect(component.projectType()).toBe('Team');
    expect(component.projects()).toBe(2);
    expect(component.collaborators()).toBe(5);
    expect(component.documents()).toBe(7);
    expect(component.days()).toBe(30);
    expect(component.amountCharged()).toBe('94.50');
    expect(component.customerName()).toBe('Mridul Mishra');
    expect(component.projectId()).toBe('project-123');
    expect(component.projectCode()).toBe('PRJ-2TJS-FYD7');
  });

  it('does not display the internal project id for a solo private confirmation', () => {
    queryParams$.next({ type: 'solo', visibility: 'private', projectId: 'private-project-uuid' });
    component.ngOnInit();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent;
    expect(component.projectVisibility()).toBe('private');
    expect(text).not.toContain('Project ID');
    expect(text).not.toContain('private-project-uuid');
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { HomeComponent } from './home';

describe('HomeComponent', () => {
  let component: HomeComponent;
  let fixture: ComponentFixture<HomeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(HomeComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows assignment-based paid pricing without stale pricing promises', () => {
    fixture.detectChanges();
    const pricing = fixture.nativeElement.querySelector('#pricing') as HTMLElement;

    expect(pricing.textContent).toContain('$0.09');
    expect(pricing.textContent).toContain('document assignments');
    expect(pricing.textContent).toContain('Public projects:');
    expect(pricing.textContent).toContain('Private projects:');
    expect(pricing.textContent).toContain('Payment required before activation');
    expect(pricing.textContent).not.toContain('Unlimited projects');
    expect(pricing.textContent).not.toContain('Priority support');
    expect(pricing.textContent).not.toContain('Cancel anytime');
  });

  it('uses the centered email-style logo strip and paid sign-in actions', () => {
    fixture.detectChanges();
    const navbar = fixture.nativeElement.querySelector('.navbar') as HTMLElement;
    const logo = navbar.querySelector('.logo-image') as HTMLImageElement;
    const signInLinks = fixture.nativeElement.querySelectorAll('a[href="/sign-in"]');

    expect(logo.getAttribute('src')).toBe('docsndocslogo-light-v2.png');
    expect(signInLinks.length).toBe(2);
    expect(fixture.nativeElement.textContent).not.toContain('Free Trial');
    expect(fixture.nativeElement.textContent).not.toContain('Get Started Free');
  });
});

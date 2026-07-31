import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SignUpComponent } from './sign-up';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

describe('SignUpComponent', () => {
  let component: SignUpComponent;
  let fixture: ComponentFixture<SignUpComponent>;
  let authService: any;
  let router: Router;

  beforeEach(async () => {
    authService = {
      register: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SignUpComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: LoggingService, useValue: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignUpComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('marks the form touched and does not register when invalid', () => {
    component.onSubmit();

    expect(authService.register).not.toHaveBeenCalled();
    expect(component.form.touched).toBe(true);
  });

  it('computes password requirements', () => {
    component.form.controls.password.setValue('weak');
    expect(component.reqLength()).toBe(false);
    expect(component.reqUpper()).toBe(false);
    expect(component.reqNumber()).toBe(false);
    expect(component.reqSpecial()).toBe(false);

    component.form.controls.password.setValue('Strong1!');
    expect(component.reqLength()).toBe(true);
    expect(component.reqUpper()).toBe(true);
    expect(component.reqNumber()).toBe(true);
    expect(component.reqSpecial()).toBe(true);
  });

  it('registers a valid user and navigates to passcode', () => {
    authService.register.mockReturnValue(of({ success: true, message: 'Verification code sent' }));
    component.form.setValue({
      firstName: 'Mridul',
      lastName: 'Mishra',
      email: 'mridul@example.com',
      password: 'Strong1!',
      ageRequirement: true,
    });

    component.onSubmit();

    expect(authService.register).toHaveBeenCalledWith('Mridul', 'Mishra', 'mridul@example.com', 'Strong1!');
    expect(component.isSubmitting()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/sign-up-passcode'], { state: { email: 'mridul@example.com' } });
  });

  it('shows the backend registration error', () => {
    authService.register.mockReturnValue(throwError(() => ({ error: { message: 'Email already exists' } })));
    component.form.setValue({
      firstName: 'Mridul',
      lastName: 'Mishra',
      email: 'mridul@example.com',
      password: 'Strong1!',
      ageRequirement: true,
    });

    component.onSubmit();

    expect(component.isSubmitting()).toBe(false);
    expect(component.serverError()).toBe('Email already exists');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('toggles password visibility', () => {
    component.togglePassword();

    expect(component.showPassword()).toBe(true);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ForgotPasswordComponent } from './forgot-password';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let authService: { forgotPassword: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(async () => {
    authService = {
      forgotPassword: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: LoggingService, useValue: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not submit when email is invalid', () => {
    component.form.setValue({ email: 'not-an-email' });

    component.onSubmit();

    expect(authService.forgotPassword).not.toHaveBeenCalled();
  });

  it('requests a reset code and navigates to passcode', () => {
    authService.forgotPassword.mockReturnValue(of({ success: true, message: 'OTP Email Sent' }));
    component.form.setValue({ email: 'mridul@example.com' });

    component.onSubmit();

    expect(authService.forgotPassword).toHaveBeenCalledWith('mridul@example.com');
    expect(component.isLoading()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/forpassword-passcode'], { state: { email: 'mridul@example.com' } });
  });

  it('shows an error when reset code request fails', () => {
    authService.forgotPassword.mockReturnValue(throwError(() => ({ status: 500 })));
    component.form.setValue({ email: 'mridul@example.com' });

    component.onSubmit();

    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Could not send reset code. Please check the email and try again.');
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

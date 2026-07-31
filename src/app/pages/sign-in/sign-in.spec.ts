import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';

import { SignInComponent } from './sign-in';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

describe('SignInComponent', () => {
  let component: SignInComponent;
  let fixture: ComponentFixture<SignInComponent>;
  let authService: any;
  let router: Router;

  beforeEach(async () => {
    authService = {
      login: vi.fn(),
      saveToken: vi.fn(),
      saveUserId: vi.fn(),
      saveUserFirstname: vi.fn(),
      saveUserLastname: vi.fn(),
      saveUserEmail: vi.fn(),
      saveUserAvatar: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [SignInComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
        { provide: LoggingService, useValue: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(SignInComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('does not submit when the form is invalid', () => {
    component.onSubmit();

    expect(authService.login).not.toHaveBeenCalled();
    expect(component.isLoading()).toBe(false);
  });

  it('logs in, saves session data, and navigates to dashboard', () => {
    authService.login.mockReturnValue(of({
      token: 'jwt-token',
      userid: 123,
      firstname: 'Mridul',
      lastname: 'Mishra',
      email: 'mridul@example.com',
      avatarPath: 'https://blob.example.com/avatar.png',
    }));
    component.form.setValue({ email: 'mridul@example.com', password: 'Secret123!' });

    component.onSubmit();

    expect(authService.login).toHaveBeenCalledWith('mridul@example.com', 'Secret123!');
    expect(authService.saveToken).toHaveBeenCalledWith('jwt-token');
    expect(authService.saveUserId).toHaveBeenCalledWith(123);
    expect(authService.saveUserFirstname).toHaveBeenCalledWith('Mridul');
    expect(authService.saveUserLastname).toHaveBeenCalledWith('Mishra');
    expect(authService.saveUserEmail).toHaveBeenCalledWith('mridul@example.com');
    expect(authService.saveUserAvatar).toHaveBeenCalledWith('https://blob.example.com/avatar.png');
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
    expect(component.isLoading()).toBe(false);
  });

  it('shows a login error when credentials are rejected', () => {
    authService.login.mockReturnValue(throwError(() => ({ status: 401 })));
    component.form.setValue({ email: 'mridul@example.com', password: 'wrong' });

    component.onSubmit();

    expect(component.isLoading()).toBe(false);
    expect(component.errorMessage()).toBe('Invalid email or password. Please try again.');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('toggles password visibility', () => {
    expect(component.showPassword()).toBe(false);

    component.togglePassword();

    expect(component.showPassword()).toBe(true);
  });
});

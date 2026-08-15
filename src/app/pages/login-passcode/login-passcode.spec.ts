import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LoginPasscodeComponent } from './login-passcode';
import { AuthService } from '../../services/auth.service';

describe('LoginPasscodeComponent', () => {
  let auth: any;
  let router: Router;

  beforeEach(async () => {
    history.replaceState({ email: 'user@example.com', challengeId: 'challenge-1' }, '');
    auth = {
      verifyLoginPasscode: vi.fn(),
      resendLoginPasscode: vi.fn(() => of({ success: true })),
      saveLogin: vi.fn(() => true),
    };
    await TestBed.configureTestingModule({
      imports: [LoginPasscodeComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    }).compileComponents();
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('verifies the login challenge, saves the trusted device, and opens dashboard', () => {
    auth.verifyLoginPasscode.mockReturnValue(of({ token: 'jwt', userid: 1, email: 'user@example.com', deviceToken: 'device' }));
    const fixture = TestBed.createComponent(LoginPasscodeComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    component.passcode.set('123456');

    component.submit(new Event('submit'));

    expect(auth.verifyLoginPasscode).toHaveBeenCalledWith('challenge-1', '123456');
    expect(auth.saveLogin).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });

  it('shows an invalid-code response without signing in', () => {
    auth.verifyLoginPasscode.mockReturnValue(throwError(() => ({ error: { message: 'Invalid passcode.' } })));
    const fixture = TestBed.createComponent(LoginPasscodeComponent);
    const component = fixture.componentInstance;
    component.ngOnInit();
    component.passcode.set('000000');

    component.submit(new Event('submit'));

    expect(component.errorMessage()).toBe('Invalid passcode.');
    expect(auth.saveLogin).not.toHaveBeenCalled();
  });
});

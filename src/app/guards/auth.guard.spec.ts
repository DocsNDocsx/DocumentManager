import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';

import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

describe('authGuard', () => {
  let authService: { hasValidToken: ReturnType<typeof vi.fn> };
  let router: Router;

  beforeEach(() => {
    authService = {
      hasValidToken: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authService },
      ],
    });
    router = TestBed.inject(Router);
  });

  function runGuard() {
    return TestBed.runInInjectionContext(() => authGuard({} as never, {} as never));
  }

  it('allows activation when the current token is valid', () => {
    authService.hasValidToken.mockReturnValue(true);

    expect(runGuard()).toBe(true);
    expect(authService.hasValidToken).toHaveBeenCalled();
  });

  it('redirects to sign-in when no valid token exists', () => {
    authService.hasValidToken.mockReturnValue(false);

    const result = runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(router.serializeUrl(result as UrlTree)).toBe('/sign-in');
  });
});

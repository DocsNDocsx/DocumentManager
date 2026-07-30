import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { AuthService } from './auth.service';

function jwtWithPayload(payload: Record<string, unknown>): string {
  return ['header', btoa(JSON.stringify(payload)), 'signature'].join('.');
}

describe('AuthService session helpers', () => {
  let service: AuthService;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AuthService);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('returns false when no token is stored', () => {
    expect(service.hasValidToken()).toBe(false);
  });

  it('returns true for a stored token with a future expiry', () => {
    const token = jwtWithPayload({ exp: Math.floor(Date.now() / 1000) + 3600 });
    localStorage.setItem('auth_token', token);

    expect(service.hasValidToken()).toBe(true);
    expect(localStorage.getItem('auth_token')).toBe(token);
  });

  it('returns true for a stored token without exp for backward compatibility', () => {
    const token = jwtWithPayload({ email: 'user@example.com' });
    localStorage.setItem('auth_token', token);

    expect(service.hasValidToken()).toBe(true);
  });

  it('logs out and returns false for an expired token', () => {
    localStorage.setItem('auth_token', jwtWithPayload({ exp: Math.floor(Date.now() / 1000) - 60 }));
    localStorage.setItem('user_email', 'user@example.com');

    expect(service.hasValidToken()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(localStorage.getItem('user_email')).toBeNull();
  });

  it('logs out and returns false for a malformed token', () => {
    localStorage.setItem('auth_token', 'not-a-jwt');

    expect(service.hasValidToken()).toBe(false);
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});

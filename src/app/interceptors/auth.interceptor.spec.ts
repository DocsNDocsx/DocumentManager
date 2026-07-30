import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';

import { authInterceptor } from './auth.interceptor';
import { AuthService } from '../services/auth.service';

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let router: Router;
  let authService: {
    getToken: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    authService = {
      getToken: vi.fn(),
      logout: vi.fn(),
    };

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: authService },
      ],
    });

    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('adds Authorization header when a token exists', () => {
    authService.getToken.mockReturnValue('valid-token');

    http.get('/api/dashboard/storage').subscribe();
    const req = httpMock.expectOne('/api/dashboard/storage');

    expect(req.request.headers.get('Authorization')).toBe('Bearer valid-token');
    req.flush({ success: true });
  });

  it('does not add Authorization header when no token exists', () => {
    authService.getToken.mockReturnValue(null);

    http.get('/api/public').subscribe();
    const req = httpMock.expectOne('/api/public');

    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({ success: true });
  });

  it('logs out and redirects to sign-in when the API returns 401', () => {
    authService.getToken.mockReturnValue('expired-token');

    http.get('/api/dashboard/storage').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/dashboard/storage');
    req.flush({ success: false, message: 'Invalid or expired token' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/sign-in']);
  });

  it('does not logout on non-auth API errors', () => {
    authService.getToken.mockReturnValue('valid-token');

    http.get('/api/dashboard/storage').subscribe({ error: () => {} });
    const req = httpMock.expectOne('/api/dashboard/storage');
    req.flush({ success: false }, { status: 500, statusText: 'Server Error' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});

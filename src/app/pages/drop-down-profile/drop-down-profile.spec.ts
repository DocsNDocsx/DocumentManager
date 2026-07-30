import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { DropDownProfileComponent } from './drop-down-profile';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

describe('DropDownProfileComponent', () => {
  let component: DropDownProfileComponent;
  let fixture: ComponentFixture<DropDownProfileComponent>;
  let authService: any;

  beforeEach(async () => {
    authService = {
      currentUserFirstname: signal('Cypress'),
      currentUserLastname: signal('Tester'),
      currentUserEmail: signal('cypress@example.com'),
      currentUserAvatar: signal(''),
      uploadAvatar: vi.fn(),
      saveUserAvatar: vi.fn(),
      updateProfile: vi.fn(),
      saveUserFirstname: vi.fn(),
      saveUserLastname: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DropDownProfileComponent, RouterModule.forRoot([])],
      providers: [
        { provide: AuthService, useValue: authService },
        {
          provide: LoggingService,
          useValue: {
            debug: vi.fn(),
            info: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DropDownProfileComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => { expect(component).toBeTruthy(); });

  it('uploads a profile photo and saves returned avatar path', () => {
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    authService.uploadAvatar.mockReturnValue(of({ success: true, avatarPath: '/api/auth/profile/avatar/123' }));

    component.onAvatarChange({
      target: { files: [file] },
    } as unknown as Event);

    expect(authService.uploadAvatar).toHaveBeenCalledWith(file, 'cypress@example.com');
    expect(authService.saveUserAvatar).toHaveBeenCalledWith('/api/auth/profile/avatar/123');
    expect(component.avatarLoadError()).toBe(false);
    expect(component.toastVisible()).toBe(true);
    expect(component.toastError()).toBe(false);
    expect(component.toastMsg()).toBe('Photo updated successfully.');
  });

  it('does nothing when no photo is selected', () => {
    component.onAvatarChange({
      target: { files: [] },
    } as unknown as Event);

    expect(authService.uploadAvatar).not.toHaveBeenCalled();
    expect(authService.saveUserAvatar).not.toHaveBeenCalled();
  });

  it('blocks profile photo upload over 2 MB', () => {
    const largeFile = new File(['x'], 'large.png', { type: 'image/png' });
    Object.defineProperty(largeFile, 'size', { value: 2 * 1024 * 1024 + 1 });

    component.onAvatarChange({
      target: { files: [largeFile] },
    } as unknown as Event);

    expect(authService.uploadAvatar).not.toHaveBeenCalled();
    expect(component.toastVisible()).toBe(true);
    expect(component.toastError()).toBe(true);
    expect(component.toastMsg()).toBe('File too large. Maximum size is 2 MB.');
  });

  it('shows an error toast when profile photo upload fails', () => {
    const file = new File(['avatar'], 'avatar.png', { type: 'image/png' });
    authService.uploadAvatar.mockReturnValue(throwError(() => ({ error: { message: 'Upload failed' } })));

    component.onAvatarChange({
      target: { files: [file] },
    } as unknown as Event);

    expect(authService.uploadAvatar).toHaveBeenCalledWith(file, 'cypress@example.com');
    expect(authService.saveUserAvatar).not.toHaveBeenCalled();
    expect(component.toastVisible()).toBe(true);
    expect(component.toastError()).toBe(true);
    expect(component.toastMsg()).toBe('Failed to upload photo.');
  });
});

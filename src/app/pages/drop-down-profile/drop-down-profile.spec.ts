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
      getProfile: vi.fn(() => of({
        success: true,
        profile: {
          firstname: 'Cypress', lastname: 'Tester', email: 'cypress@example.com',
          phone: '', organization: '', timezone: 'UTC-5', notifPref: 'daily',
        },
      })),
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

  it('saves profile fields and updates stored names', () => {
    authService.updateProfile.mockReturnValue(of({ success: true, message: 'Profile updated successfully' }));
    component.firstName.set('Mridul');
    component.lastName.set('Mishra');
    component.phone.set('555-0100');
    component.timezone.set('UTC');
    component.notifPref.set('email');

    component.saveProfile();

    expect(authService.updateProfile).toHaveBeenCalledWith({
      email: 'cypress@example.com',
      firstname: 'Mridul',
      lastname: 'Mishra',
      phone: '555-0100',
      organization: '',
      timezone: 'UTC',
      notifPref: 'email',
    });
    expect(authService.saveUserFirstname).toHaveBeenCalledWith('Mridul');
    expect(authService.saveUserLastname).toHaveBeenCalledWith('Mishra');
    expect(component.isSaving()).toBe(false);
    expect(component.toastError()).toBe(false);
    expect(component.toastMsg()).toBe('Profile saved successfully.');
  });

  it('loads and retains the saved timezone when the profile opens', () => {
    authService.getProfile.mockReturnValueOnce(of({
      success: true,
      profile: {
        firstname: 'Cypress', lastname: 'Tester', email: 'cypress@example.com',
        phone: '555-0100', organization: 'DocsNDocs',
        timezone: 'UTC+1', notifPref: 'email',
      },
    }));

    component.ngOnInit();

    expect(component.timezone()).toBe('UTC+1');
    expect(component.phone()).toBe('555-0100');
    expect(component.org()).toBe('DocsNDocs');
    expect(component.notifPref()).toBe('email');
  });

  it('blocks profile save when new password confirmation does not match', () => {
    component.newPw.set('NewPassword1!');
    component.confirmPw.set('DifferentPassword1!');

    component.saveProfile();

    expect(authService.updateProfile).not.toHaveBeenCalled();
    expect(component.toastError()).toBe(true);
    expect(component.toastMsg()).toBe('Passwords do not match.');
  });

  it('sends password fields when changing password', () => {
    authService.updateProfile.mockReturnValue(of({ success: true, message: 'Profile updated successfully' }));
    component.currentPw.set('old-password');
    component.newPw.set('NewPassword1!');
    component.confirmPw.set('NewPassword1!');

    component.saveProfile();

    expect(authService.updateProfile).toHaveBeenCalledWith(expect.objectContaining({
      currentPw: 'old-password',
      newPw: 'NewPassword1!',
    }));
    expect(component.currentPw()).toBe('');
    expect(component.newPw()).toBe('');
    expect(component.confirmPw()).toBe('');
  });

  it('shows backend profile update errors', () => {
    authService.updateProfile.mockReturnValue(throwError(() => ({ error: { message: 'Current password is incorrect' } })));

    component.saveProfile();

    expect(component.isSaving()).toBe(false);
    expect(component.toastError()).toBe(true);
    expect(component.toastMsg()).toBe('Current password is incorrect');
  });

  it('resets password fields and computes initials', () => {
    component.firstName.set('mridul');
    component.lastName.set('mishra');
    component.currentPw.set('old');
    component.newPw.set('new');
    component.confirmPw.set('new');

    expect(component.initials()).toBe('MM');

    component.resetForm();

    expect(component.currentPw()).toBe('');
    expect(component.newPw()).toBe('');
    expect(component.confirmPw()).toBe('');
    expect(component.toastMsg()).toBe('Changes discarded.');
  });

  it('toggles dropdown open and closed', () => {
    component.toggleDropdown(new MouseEvent('click'));
    expect(component.dropdownOpen()).toBe(true);

    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);
  });
});

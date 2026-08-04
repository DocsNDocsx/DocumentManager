import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

@Component({
  selector: 'app-drop-down-profile',
  imports: [SharedHeaderComponent, SharedSidebarComponent, NgOptimizedImage],
  templateUrl: './drop-down-profile.html',
  styleUrl: './drop-down-profile.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeDropdown()' },
})
export class DropDownProfileComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);

  firstName = signal(this.authService.currentUserFirstname());
  lastName = signal(this.authService.currentUserLastname());

  avatarUrl = this.authService.currentUserAvatar;
  avatarLoadError = signal(false);

  initials = computed(() => {
    const f = this.firstName().trim();
    const l = this.lastName().trim();
    return (f ? f[0].toUpperCase() : '') + (l ? l[0].toUpperCase() : '');
  });
  email = signal(this.authService.currentUserEmail());
  phone = signal('');
  org = signal('');
  timezone = signal('UTC-5');
  notifPref = signal('daily');

  currentPw = signal('');
  newPw = signal('');
  confirmPw = signal('');

  isSaving = signal(false);
  toastMsg = signal('');
  toastError = signal(false);
  toastVisible = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit(): void {
    this.authService.getProfile().subscribe({
      next: ({ profile }) => {
        this.firstName.set(profile.firstname);
        this.lastName.set(profile.lastname);
        this.email.set(profile.email);
        this.phone.set(profile.phone);
        this.org.set(profile.organization);
        this.timezone.set(profile.timezone);
        this.notifPref.set(profile.notifPref);
      },
      error: err => {
        this.logger.error('Profile load failed', err);
        this.showToast(err?.error?.message ?? 'Failed to load profile.', true);
      },
    });
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }


  showToast(msg: string, isError = false): void {
    this.toastMsg.set(msg);
    this.toastError.set(isError);
    this.toastVisible.set(true);
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 3000);
  }

  ngOnDestroy(): void {
    if (this.toastTimer) clearTimeout(this.toastTimer);
  }

  saveProfile(): void {
    if (this.newPw() && this.newPw() !== this.confirmPw()) {
      this.logger.warn('Profile save blocked — passwords do not match');
      this.showToast('Passwords do not match.', true);
      return;
    }

    this.isSaving.set(true);
    this.logger.debug('Saving profile');

    this.authService.updateProfile({
      email: this.email(),
      firstname: this.firstName(),
      lastname: this.lastName(),
      phone: this.phone(),
      organization: this.org(),
      timezone: this.timezone(),
      notifPref: this.notifPref(),
      ...(this.newPw() ? { currentPw: this.currentPw(), newPw: this.newPw() } : {}),
    }).subscribe({
      next: () => {
        this.isSaving.set(false);
        this.authService.saveUserFirstname(this.firstName());
        this.authService.saveUserLastname(this.lastName());
        this.currentPw.set('');
        this.newPw.set('');
        this.confirmPw.set('');
        this.logger.info('Profile saved successfully');
        this.showToast('Profile saved successfully.');
      },
      error: (err) => {
        this.isSaving.set(false);
        this.logger.error('Profile save failed', err);
        this.showToast(err?.error?.message ?? 'Failed to save profile.', true);
      },
    });
  }

  resetForm(): void {
    this.currentPw.set('');
    this.newPw.set('');
    this.confirmPw.set('');
    this.showToast('Changes discarded.');
  }

  triggerAvatarUpload(): void {
    const input = document.getElementById('avatarInput') as HTMLInputElement;
    input?.click();
  }

  onAvatarChange(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      this.showToast('File too large. Maximum size is 2 MB.', true);
      return;
    }
    this.logger.debug('Uploading avatar');
    this.authService.uploadAvatar(file, this.email()).subscribe({
      next: ({ avatarPath }) => {
        this.authService.saveUserAvatar(avatarPath);
        this.avatarLoadError.set(false);
        this.logger.info('Avatar uploaded and saved');
        this.showToast('Photo updated successfully.');
      },
      error: (err) => {
        this.logger.error('Avatar upload failed', err);
        this.showToast('Failed to upload photo.', true);
      },
    });
  }
}

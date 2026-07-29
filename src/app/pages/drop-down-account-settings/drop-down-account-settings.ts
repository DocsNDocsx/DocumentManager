import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { AuthService } from '../../services/auth.service';
import { LoggingService } from '../../services/logging.service';

@Component({
  selector: 'app-drop-down-account-settings',
  templateUrl: './drop-down-account-settings.html',
  styleUrl: './drop-down-account-settings.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, SharedSidebarComponent],
  host: { '(document:click)': 'onDocumentClick()' },
})
export class DropDownAccountSettingsComponent {
  private authService = inject(AuthService);
  private router = inject(Router);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  isDeleting = signal(false);
  errorMessage = signal('');
  showDeleteAccountModal = signal(false);
  confirmDeleteInput = signal('');

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  onDocumentClick(): void {
    this.dropdownOpen.set(false);
  }

  openDeleteAccountModal(): void {
    this.errorMessage.set('');
    this.confirmDeleteInput.set('');
    this.showDeleteAccountModal.set(true);
  }

  closeDeleteAccountModal(): void {
    this.showDeleteAccountModal.set(false);
  }

  confirmDeleteAccount(): void {
    if (this.confirmDeleteInput().trim() !== 'DELETE') return;
    const userid = this.authService.currentUserId();
    if (!userid) return;

    this.isDeleting.set(true);
    this.errorMessage.set('');
    this.logger.warn('User confirming account deletion', { userid });

    this.authService.deleteAccount(userid).subscribe({
      next: () => {
        this.isDeleting.set(false);
        this.logger.info('Account deleted, logging out');
        this.authService.logout();
        this.router.navigate(['/sign-in']);
      },
      error: (err) => {
        this.isDeleting.set(false);
        this.logger.error('Account deletion failed', err);
        this.errorMessage.set(err?.error?.message ?? 'Failed to delete account. Please try again.');
      },
    });
  }

  onModalOverlayClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (target.dataset['modalId'] === 'delete') {
      this.closeDeleteAccountModal();
    }
  }
}

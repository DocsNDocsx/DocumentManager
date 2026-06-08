import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { LoggingService } from '../../services/logging.service';

@Component({
  selector: 'app-left-menu-sign-out-confirm',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  templateUrl: './left-menu-sign-out-confirm.html',
  styleUrl: './left-menu-sign-out-confirm.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuSignOutConfirmComponent {
  private router = inject(Router);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);

  loginTime = signal('Today at 9:30 AM');
  deviceInfo = signal('Chrome on Windows');
  sessionDuration = signal('2 hours 15 minutes');

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }


  confirmSignOut(): void {
    this.logger.info('User confirmed sign-out');
    this.router.navigate(['/left-menu-sign-out']);
  }
}

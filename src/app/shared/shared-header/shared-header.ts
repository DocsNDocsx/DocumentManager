import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { LogoComponent } from '../logo/logo';

@Component({
  selector: 'app-shared-header',
  templateUrl: './shared-header.html',
  styleUrl: './shared-header.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, LogoComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class SharedHeaderComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  dropdownOpen = signal(false);
  currentUserFirstname = this.authService.currentUserFirstname;
  currentUserLastname = this.authService.currentUserLastname;

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/sign-in']);
  }
}

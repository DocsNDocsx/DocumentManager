import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-shared-sidebar',
  templateUrl: './shared-sidebar.html',
  styleUrl: './shared-sidebar.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive],
  host: {
    '[class.collapsed]': 'collapsed()',
  },
})
export class SharedSidebarComponent {
  private authService = inject(AuthService);
  private router = inject(Router);

  collapsed = signal(false);

  toggle(): void {
    this.collapsed.update(v => !v);
  }

  signOut(): void {
    this.authService.logout();
    this.router.navigate(['/sign-in']);
  }
}

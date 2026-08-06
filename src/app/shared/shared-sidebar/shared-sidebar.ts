import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { TEAM_FEATURE_ENABLED } from '../../config/features';

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
  protected readonly teamsEnabled = TEAM_FEATURE_ENABLED;
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

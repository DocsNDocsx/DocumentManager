import { ChangeDetectionStrategy, Component, signal, inject } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';

@Component({
  selector: 'app-left-menu-new-team-project-landing',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  templateUrl: './left-menu-new-team-project-landing.html',
  styleUrl: './left-menu-new-team-project-landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewTeamProjectLandingComponent {
  private readonly router = inject(Router);

  dropdownOpen = signal(false);


  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }
}

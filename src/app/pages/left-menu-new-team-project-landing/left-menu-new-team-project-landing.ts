import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectWizardService } from '../../services/team-project-wizard.service';

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
export class LeftMenuNewTeamProjectLandingComponent implements OnInit {
  private readonly teamWizardService = inject(TeamProjectWizardService);

  dropdownOpen = signal(false);

  ngOnInit(): void {
    this.teamWizardService.reset();
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }
}

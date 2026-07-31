import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectWizardService } from '../../services/project-wizard.service';

@Component({
  selector: 'app-left-menu-new-solo-project-landing',
  templateUrl: './left-menu-new-solo-project-landing.html',
  styleUrl: './left-menu-new-solo-project-landing.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class LeftMenuNewSoloProjectLandingComponent implements OnInit {
  private wizardService = inject(ProjectWizardService);

  dropdownOpen = signal(false);

  ngOnInit(): void {
    this.wizardService.reset();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }
}

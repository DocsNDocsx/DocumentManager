import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';

@Component({
  selector: 'app-top-menu-teams',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  templateUrl: './top-menu-teams.html',
  styleUrl: './top-menu-teams.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class TopMenuTeamsComponent implements OnInit {
  readonly teamsService = inject(TeamsService);

  dropdownOpen = signal(false);
  activeTab = signal<'host' | 'member'>('host');
  searchTerm = signal('');

  filteredTeams = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const teams = this.activeTab() === 'host'
      ? this.teamsService.hostedTeams()
      : this.teamsService.memberTeams();
    return term ? teams.filter(t => t.name.toLowerCase().includes(term)) : teams;
  });

  ngOnInit(): void {
    this.teamsService.load();
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  switchTab(tab: 'host' | 'member'): void {
    this.activeTab.set(tab);
    this.searchTerm.set('');
  }

  onSearch(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }
}

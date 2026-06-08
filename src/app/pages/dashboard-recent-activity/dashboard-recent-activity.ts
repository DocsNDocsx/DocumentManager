import { ChangeDetectionStrategy, Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { DashboardService } from '../../services/dashboard.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard-recent-activity',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  templateUrl: './dashboard-recent-activity.html',
  styleUrl: './dashboard-recent-activity.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class DashboardRecentActivityComponent implements OnInit {
  private auth = inject(AuthService);
  protected dashboard = inject(DashboardService);

  dropdownOpen = signal(false);
  filterProject = signal('');
  filterType = signal('');
  filterDateFrom = signal('');
  filterDateTo = signal('');

  projectNames = computed(() =>
    [...new Set(
      this.dashboard.allActivities()
        .map(a => a.projectName)
        .filter((n): n is string => n !== null && n !== '')
    )].sort()
  );

  filteredActivities = computed(() => {
    const project = this.filterProject().toLowerCase();
    const type = this.filterType();
    const dateFrom = this.filterDateFrom();
    const dateTo = this.filterDateTo();

    return this.dashboard.allActivities().filter(item => {
      const itemDate = item.timestamp.split('T')[0];
      const matchProject = !project || (item.projectName ?? '').toLowerCase().includes(project);
      const matchType = !type || item.type === type;
      const matchFrom = !dateFrom || itemDate >= dateFrom;
      const matchTo = !dateTo || itemDate <= dateTo;
      return matchProject && matchType && matchFrom && matchTo;
    });
  });

  visibleCount = computed(() => this.filteredActivities().length);
  isEmpty = computed(() => this.filteredActivities().length === 0);

  ngOnInit(): void {
    this.dashboard.loadAllActivities();
  }

  getIconFaClass(type: string): string {
    const map: Record<string, string> = {
      upload: 'fas fa-file-upload',
      invite: 'fas fa-envelope',
      team: 'fas fa-users',
      decision: 'fas fa-check-circle',
      delete: 'fas fa-trash-alt',
      settings: 'fas fa-lock',
    };
    return map[type] ?? 'fas fa-bell';
  }

  badgeClass(type: string): string {
    return `activity-type-badge type-${type}`;
  }

  badgeLabel(type: string): string {
    const labels: Record<string, string> = {
      upload: 'Upload',
      invite: 'Invite',
      team: 'Team',
      decision: 'Decision',
      delete: 'Deletion',
      settings: 'Settings',
    };
    return labels[type] ?? type;
  }

  formatTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) {
      return `Yesterday, ${then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  applyFilters(project: string, type: string, dateFrom: string, dateTo: string): void {
    this.filterProject.set(project);
    this.filterType.set(type);
    this.filterDateFrom.set(dateFrom);
    this.filterDateTo.set(dateTo);
  }

  onApplyFilters(
    projectEl: HTMLSelectElement,
    typeEl: HTMLSelectElement,
    dateFromEl: HTMLInputElement,
    dateToEl: HTMLInputElement
  ): void {
    this.applyFilters(projectEl.value, typeEl.value, dateFromEl.value, dateToEl.value);
  }

  onResetFilters(
    projectEl: HTMLSelectElement,
    typeEl: HTMLSelectElement,
    dateFromEl: HTMLInputElement,
    dateToEl: HTMLInputElement
  ): void {
    projectEl.value = '';
    typeEl.value = '';
    dateFromEl.value = '';
    dateToEl.value = '';
    this.applyFilters('', '', '', '');
  }
}

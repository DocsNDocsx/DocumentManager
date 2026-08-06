import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamSelectorComponent, TeamOption } from '../../shared/team-selector/team-selector';
import { DashboardService } from '../../services/dashboard.service';
import { StorageDataSet } from '../../models/dashboard.models';
import { TEAM_FEATURE_ENABLED } from '../../config/features';

const EMPTY_STATUS = { count: '0 projects · 0 documents', size: '0 B', percent: '0%', percentNum: 0 };
const EMPTY_DATA: StorageDataSet = {
  title: 'Storage Details',
  subtitle: 'Monitor storage usage from submitted files',
  totalUsed: '0 B',
  totalUsedSub: 'of 10 GB (0%)',
  totalProjects: 0,
  totalProjectsSub: '0 Active, 0 Other',
  totalDocs: 0,
  totalDocsSub: 'Across matching projects',
  statuses: {
    active: EMPTY_STATUS,
    draft: EMPTY_STATUS,
    completed: EMPTY_STATUS,
    notCompleted: EMPTY_STATUS,
    deleted: EMPTY_STATUS,
  },
};

@Component({
  selector: 'app-drop-down-storage',
  imports: [SharedHeaderComponent, SharedSidebarComponent, TeamSelectorComponent],
  templateUrl: './drop-down-storage.html',
  styleUrl: './drop-down-storage.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeDropdown()' },
})
export class DropDownStorageComponent implements OnInit {
  protected readonly teamsEnabled = TEAM_FEATURE_ENABLED;
  private dashboard = inject(DashboardService);

  dropdownOpen = signal(false);
  currentView = signal<'solo' | 'team'>('solo');
  currentTeam = signal('all');
  soloData = signal<StorageDataSet>(EMPTY_DATA);
  teamData = signal<StorageDataSet>(EMPTY_DATA);
  teamOptions = signal<TeamOption[]>([{ value: 'all', label: 'All Teams Combined' }]);
  isLoading = signal(false);
  errorMessage = signal('');

  data = computed<StorageDataSet>(() =>
    this.currentView() === 'solo' ? this.soloData() : this.teamData()
  );

  ngOnInit(): void {
    this.loadStorage();
  }

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  switchView(view: 'solo' | 'team'): void {
    this.currentView.set(view);
    if (view === 'team') this.loadStorage(this.currentTeam());
  }

  switchTeam(value: string): void {
    this.currentTeam.set(value);
    this.loadStorage(value);
  }

  private loadStorage(teamId = this.currentTeam()): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.dashboard.getStorageSummary(teamId).subscribe({
      next: res => {
        this.soloData.set(res.solo);
        this.teamData.set(res.team);
        this.teamOptions.set(res.teams);
        this.isLoading.set(false);
      },
      error: err => {
        this.errorMessage.set(err?.error?.message ?? 'Failed to load storage usage.');
        this.isLoading.set(false);
      },
    });
  }
}

import { ChangeDetectionStrategy, Component, signal, computed } from '@angular/core';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamSelectorComponent, TeamOption } from '../../shared/team-selector/team-selector';

interface StatusData {
  count: string;
  size: string;
  percent: string;
  percentNum: number;
}

interface StorageDataSet {
  title: string;
  subtitle: string;
  totalUsed: string;
  totalUsedSub: string;
  totalProjects: number;
  totalProjectsSub: string;
  totalDocs: number;
  totalDocsSub: string;
  statuses: {
    active: StatusData;
    draft: StatusData;
    completed: StatusData;
    notCompleted: StatusData;
    deleted: StatusData;
  };
}

const STORAGE_DATA: { solo: StorageDataSet; team: Record<string, StorageDataSet> } = {
  solo: {
    title: 'Storage Details — Solo Projects',
    subtitle: 'Monitor your cloud storage usage across all solo projects',
    totalUsed: '3.2 GB', totalUsedSub: 'of 20 GB (16%)',
    totalProjects: 22, totalProjectsSub: '10 Active, 12 Other',
    totalDocs: 476, totalDocsSub: 'Across all projects',
    statuses: {
      active:       { count: '10 projects · 324 documents', size: '1.8 GB',  percent: '56.3%', percentNum: 56.3 },
      draft:        { count: '3 projects · 0 documents',    size: '0 MB',    percent: '0%',    percentNum: 0    },
      completed:    { count: '3 projects · 112 documents',  size: '890 MB',  percent: '27.8%', percentNum: 27.8 },
      notCompleted: { count: '3 projects · 23 documents',   size: '310 MB',  percent: '9.7%',  percentNum: 9.7  },
      deleted:      { count: '3 projects · 17 documents',   size: '200 MB',  percent: '6.3%',  percentNum: 6.3  },
    },
  },
  team: {
    all: {
      title: 'Storage Details — Team Projects',
      subtitle: 'Monitor your cloud storage usage across all team projects',
      totalUsed: '5.8 GB', totalUsedSub: 'of 80 GB (7.3%)',
      totalProjects: 17, totalProjectsSub: '5 Active, 12 Other',
      totalDocs: 549, totalDocsSub: 'Across all teams',
      statuses: {
        active:       { count: '5 projects · 361 documents',  size: '2.9 GB',  percent: '50%',   percentNum: 50   },
        draft:        { count: '3 projects · 0 documents',    size: '0 MB',    percent: '0%',    percentNum: 0    },
        completed:    { count: '3 projects · 158 documents',  size: '1.6 GB',  percent: '27.6%', percentNum: 27.6 },
        notCompleted: { count: '3 projects · 24 documents',   size: '780 MB',  percent: '13.4%', percentNum: 13.4 },
        deleted:      { count: '3 projects · 6 documents',    size: '520 MB',  percent: '9%',    percentNum: 9    },
      },
    },
    alpha: {
      title: 'Storage Details — Alpha Marketing Group',
      subtitle: 'Monitor cloud storage usage for Alpha Marketing Group',
      totalUsed: '2.1 GB', totalUsedSub: 'of 80 GB (2.6%)',
      totalProjects: 5, totalProjectsSub: '2 Active, 3 Other',
      totalDocs: 203, totalDocsSub: 'In this team',
      statuses: {
        active:       { count: '2 projects · 129 documents', size: '1.1 GB',  percent: '52.4%', percentNum: 52.4 },
        draft:        { count: '0 projects · 0 documents',   size: '0 MB',    percent: '0%',    percentNum: 0    },
        completed:    { count: '1 project · 134 documents',  size: '680 MB',  percent: '32.4%', percentNum: 32.4 },
        notCompleted: { count: '1 project · 8 documents',    size: '210 MB',  percent: '10%',   percentNum: 10   },
        deleted:      { count: '1 project · 12 documents',   size: '110 MB',  percent: '5.2%',  percentNum: 5.2  },
      },
    },
    product: {
      title: 'Storage Details — Product Development Team',
      subtitle: 'Monitor cloud storage usage for Product Development Team',
      totalUsed: '1.5 GB', totalUsedSub: 'of 80 GB (1.9%)',
      totalProjects: 4, totalProjectsSub: '1 Active, 3 Other',
      totalDocs: 122, totalDocsSub: 'In this team',
      statuses: {
        active:       { count: '1 project · 11 documents',  size: '580 MB', percent: '38.7%', percentNum: 38.7 },
        draft:        { count: '1 project · 0 documents',   size: '0 MB',   percent: '0%',    percentNum: 0    },
        completed:    { count: '0 projects · 0 documents',  size: '0 MB',   percent: '0%',    percentNum: 0    },
        notCompleted: { count: '1 project · 6 documents',   size: '320 MB', percent: '21.3%', percentNum: 21.3 },
        deleted:      { count: '1 project · 5 documents',   size: '600 MB', percent: '40%',   percentNum: 40   },
      },
    },
    finance: {
      title: 'Storage Details — Finance Department',
      subtitle: 'Monitor cloud storage usage for Finance Department',
      totalUsed: '1.3 GB', totalUsedSub: 'of 80 GB (1.6%)',
      totalProjects: 4, totalProjectsSub: '1 Active, 3 Other',
      totalDocs: 113, totalDocsSub: 'In this team',
      statuses: {
        active:       { count: '1 project · 18 documents', size: '620 MB', percent: '47.7%', percentNum: 47.7 },
        draft:        { count: '1 project · 0 documents',  size: '0 MB',   percent: '0%',    percentNum: 0    },
        completed:    { count: '1 project · 48 documents', size: '450 MB', percent: '34.6%', percentNum: 34.6 },
        notCompleted: { count: '1 project · 9 documents',  size: '230 MB', percent: '17.7%', percentNum: 17.7 },
        deleted:      { count: '0 projects · 0 documents', size: '0 MB',   percent: '0%',    percentNum: 0    },
      },
    },
    research: {
      title: 'Storage Details — Research & Analytics',
      subtitle: 'Monitor cloud storage usage for Research & Analytics',
      totalUsed: '900 MB', totalUsedSub: 'of 80 GB (1.1%)',
      totalProjects: 4, totalProjectsSub: '1 Active, 3 Other',
      totalDocs: 111, totalDocsSub: 'In this team',
      statuses: {
        active:       { count: '1 project · 87 documents',  size: '590 MB', percent: '65.6%', percentNum: 65.6 },
        draft:        { count: '1 project · 0 documents',   size: '0 MB',   percent: '0%',    percentNum: 0    },
        completed:    { count: '1 project · 76 documents',  size: '470 MB', percent: '52.2%', percentNum: 52.2 },
        notCompleted: { count: '0 projects · 0 documents',  size: '0 MB',   percent: '0%',    percentNum: 0    },
        deleted:      { count: '1 project · 18 documents',  size: '310 MB', percent: '34.4%', percentNum: 34.4 },
      },
    },
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
export class DropDownStorageComponent {
  dropdownOpen = signal(false);
  currentView = signal<'solo' | 'team'>('solo');
  currentTeam = signal('all');

  readonly teamOptions: TeamOption[] = [
    { value: 'all',      label: 'All Teams Combined' },
    { value: 'alpha',    label: 'Alpha Marketing Group' },
    { value: 'product',  label: 'Product Development Team' },
    { value: 'finance',  label: 'Finance Department' },
    { value: 'research', label: 'Research & Analytics' },
  ];

  data = computed<StorageDataSet>(() => {
    if (this.currentView() === 'solo') return STORAGE_DATA.solo;
    return STORAGE_DATA.team[this.currentTeam()];
  });

  toggleDropdown(e: MouseEvent): void {
    e.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }


  switchView(view: 'solo' | 'team'): void {
    this.currentView.set(view);
    if (view === 'team') this.currentTeam.set('all');
  }

  switchTeam(value: string): void {
    this.currentTeam.set(value);
  }
}

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';

import { DropDownStorageComponent } from './drop-down-storage';
import { DashboardService } from '../../services/dashboard.service';
import { StorageDataSet } from '../../models/dashboard.models';

const emptyStatus = { count: '0 projects · 0 documents', size: '0 B', percent: '0%', percentNum: 0 };
const soloData: StorageDataSet = {
  title: 'Storage Details - Solo Projects',
  subtitle: 'Solo storage',
  totalUsed: '1 GB',
  totalUsedSub: 'of 10 GB (10%)',
  totalProjects: 2,
  totalProjectsSub: '1 Active, 1 Other',
  totalDocs: 5,
  totalDocsSub: 'Across solo projects',
  statuses: {
    active: { count: '1 project · 3 documents', size: '700 MB', percent: '70%', percentNum: 70 },
    draft: { count: '1 project · 2 documents', size: '300 MB', percent: '30%', percentNum: 30 },
    completed: emptyStatus,
    notCompleted: emptyStatus,
    deleted: emptyStatus,
  },
};
const teamData: StorageDataSet = {
  ...soloData,
  title: 'Storage Details - Team Projects',
  subtitle: 'Team storage',
  totalUsed: '2 GB',
};

describe('DropDownStorageComponent', () => {
  let component: DropDownStorageComponent;
  let fixture: ComponentFixture<DropDownStorageComponent>;
  let dashboardService: { getStorageSummary: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    dashboardService = {
      getStorageSummary: vi.fn().mockReturnValue(of({
        solo: soloData,
        team: teamData,
        teams: [{ value: 'all', label: 'All Teams Combined' }, { value: 'team-1', label: 'Alpha Team' }],
      })),
    };

    await TestBed.configureTestingModule({
      imports: [DropDownStorageComponent, RouterModule.forRoot([])],
      providers: [{ provide: DashboardService, useValue: dashboardService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DropDownStorageComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads storage summary on init', () => {
    component.ngOnInit();

    expect(dashboardService.getStorageSummary).toHaveBeenCalledWith('all');
    expect(component.soloData()).toEqual(soloData);
    expect(component.teamData()).toEqual(teamData);
    expect(component.teamOptions().length).toBe(2);
    expect(component.isLoading()).toBe(false);
  });

  it('switches to team view and loads selected team storage', () => {
    component.switchView('team');

    expect(component.currentView()).toBe('team');
    expect(dashboardService.getStorageSummary).toHaveBeenCalledWith('all');
    expect(component.data()).toEqual(teamData);
  });

  it('loads storage for a selected team', () => {
    component.switchTeam('team-1');

    expect(component.currentTeam()).toBe('team-1');
    expect(dashboardService.getStorageSummary).toHaveBeenCalledWith('team-1');
  });

  it('shows API error message when storage load fails', () => {
    dashboardService.getStorageSummary.mockReturnValueOnce(throwError(() => ({ error: { message: 'Invalid or expired token' } })));

    component.ngOnInit();

    expect(component.errorMessage()).toBe('Invalid or expired token');
    expect(component.isLoading()).toBe(false);
  });

  it('toggles and closes dropdown', () => {
    component.toggleDropdown(new MouseEvent('click'));
    expect(component.dropdownOpen()).toBe(true);

    component.closeDropdown();
    expect(component.dropdownOpen()).toBe(false);
  });
});

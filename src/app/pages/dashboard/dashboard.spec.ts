import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { signal } from '@angular/core';

import { DashboardComponent } from './dashboard';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let dashboardService: any;

  beforeEach(async () => {
    dashboardService = {
      stats: signal({
        activeProjects: 2,
        soloProjects: 1,
        teamProjects: 1,
        documentsCollected: 10,
        documentsThisWeek: 3,
        activeCollaborators: 5,
        storageUsedPercent: 42,
        storageUsedLabel: '4.2 GB',
      }),
      recentProjects: signal([]),
      activities: signal([]),
      isLoading: signal(false),
      error: signal(null),
      load: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent, RouterModule.forRoot([])],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        {
          provide: AuthService,
          useValue: {
            currentUserFirstname: signal('Mridul'),
            currentUserLastname: signal('Mishra'),
            currentUserEmail: signal('mridul@example.com'),
            currentUserAvatar: signal(''),
            logout: vi.fn(),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads dashboard data on init and exposes storage progress', () => {
    component.ngOnInit();

    expect(dashboardService.load).toHaveBeenCalled();
    expect(component.progressWidth()).toBe('42%');
  });

  it('returns badge class and label for project types', () => {
    expect(component.badgeClass('solo', 'private')).toBe('project-badge badge-solo-private');
    expect(component.badgeLabel('team', 'public')).toBe('Team • Public');
  });

  it('routes solo and team projects to the right list pages', () => {
    expect(component.projectRoute({ type: 'solo' } as never)).toBe('/top-menu-solo-projects');
    expect(component.projectRoute({ type: 'team' } as never)).toBe('/top-menu-team-projects');
  });

  it('formats ongoing, normal, and relative activity times', () => {
    expect(component.formatDeadline(null, true)).toBe('Ongoing');
    expect(component.formatDeadline('2026-09-15T00:00:00.000Z', false)).toContain('Sep');

    expect(component.formatTime(new Date().toISOString())).toBe('just now');
    expect(component.formatTime(new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())).toBe('2 hours ago');
  });

  it('maps activity icons', () => {
    expect(component.activityIconClass('team')).toBe('activity-icon team');
    expect(component.activityFaIcon('upload')).toBe('fas fa-file-upload');
  });

  it('copies project id using clipboard when available', () => {
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
    const event = new MouseEvent('click');
    vi.spyOn(event, 'preventDefault');
    vi.spyOn(event, 'stopPropagation');

    component.copyProjectId(event, 'PRJ-123');

    expect(event.preventDefault).toHaveBeenCalled();
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(writeText).toHaveBeenCalledWith('PRJ-123');
  });
});

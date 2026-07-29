import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggingService } from './logging.service';
import {
  DashboardStats,
  DashboardProject,
  ActivityItem,
  DashboardStatsApiResponse,
  DashboardRecentProjectsApiResponse,
  DashboardActivityApiResponse,
  DashboardAllActivityApiResponse,
  StorageSummaryApiResponse,
} from '../models/dashboard.models';

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  stats = signal<DashboardStats | null>(null);
  recentProjects = signal<DashboardProject[]>([]);
  activities = signal<ActivityItem[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);

  allActivities = signal<ActivityItem[]>([]);
  isLoadingAll = signal(false);
  allActivityError = signal<string | null>(null);

  load(): void {
    const userid = this.auth.currentUserId();
    if (!userid) return;
    this.isLoading.set(true);
    this.error.set(null);
    this.logger.debug('Loading dashboard data', { userid });
    const params = new HttpParams().set('userid', userid);

    forkJoin({
      statsRes: this.http.get<DashboardStatsApiResponse>(
        `${environment.apiUrl}/dashboard/stats`, { params }
      ),
      projectsRes: this.http.get<DashboardRecentProjectsApiResponse>(
        `${environment.apiUrl}/dashboard/recent-projects`, { params }
      ),
      activityRes: this.http.get<DashboardActivityApiResponse>(
        `${environment.apiUrl}/dashboard/activity`, { params }
      ),
    }).subscribe({
      next: ({ statsRes, projectsRes, activityRes }) => {
        this.stats.set({
          activeProjects: statsRes.activeProjects,
          soloProjects: statsRes.soloProjects,
          teamProjects: statsRes.teamProjects,
          documentsCollected: statsRes.documentsCollected,
          documentsThisWeek: statsRes.documentsThisWeek,
          activeCollaborators: statsRes.activeCollaborators,
          storageUsedPercent: statsRes.storageUsedPercent,
          storageUsedLabel: statsRes.storageUsedLabel,
        });
        this.recentProjects.set(projectsRes.projects);
        this.activities.set(activityRes.activities);
        this.isLoading.set(false);
        this.logger.info('Dashboard data loaded');
      },
      error: err => {
        this.error.set(err?.error?.message ?? 'Failed to load dashboard data');
        this.isLoading.set(false);
        this.logger.error('Failed to load dashboard data', err);
      },
    });
  }

  loadAllActivities(): void {
    const userid = this.auth.currentUserId();
    if (!userid) return;
    this.isLoadingAll.set(true);
    this.allActivityError.set(null);
    this.logger.debug('Loading all activity', { userid });
    const params = new HttpParams().set('userid', userid);

    this.http.get<DashboardAllActivityApiResponse>(
      `${environment.apiUrl}/dashboard/activity/all`, { params }
    ).subscribe({
      next: res => {
        this.allActivities.set(res.activities);
        this.isLoadingAll.set(false);
        this.logger.info('All activity loaded', { count: res.activities.length });
      },
      error: err => {
        this.allActivityError.set(err?.error?.message ?? 'Failed to load activity');
        this.isLoadingAll.set(false);
        this.logger.error('Failed to load all activity', err);
      },
    });
  }

  getStorageSummary(teamId = 'all') {
    const userid = this.auth.currentUserId();
    const params = new HttpParams()
      .set('userid', userid)
      .set('teamId', teamId);
    return this.http.get<StorageSummaryApiResponse>(
      `${environment.apiUrl}/dashboard/storage`, { params }
    );
  }
}

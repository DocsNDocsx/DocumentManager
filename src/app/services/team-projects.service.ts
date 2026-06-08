import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, forkJoin, tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggingService } from './logging.service';
import {
  TeamProjectItem,
  TeamProjectsApiResponse,
  TeamProjectStatsApiResponse,
} from '../models/team.models';

@Injectable({ providedIn: 'root' })
export class TeamProjectsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  projects = signal<TeamProjectItem[]>([]);
  teams = signal<{ id: string; name: string; role: 'host' | 'member' }[]>([]);
  stats = signal<Omit<TeamProjectStatsApiResponse, 'success'>>({
    totalProjects: 0,
    activeProjects: 0,
    totalDocuments: 0,
    teams: [],
  });
  isLoading = signal(false);
  error = signal<string | null>(null);

  projectsByStatus(status: TeamProjectItem['status']): TeamProjectItem[] {
    return this.projects().filter(p => p.status === status);
  }

  markComplete(projectId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(
      `${environment.apiUrl}/teams/projects/${projectId}`,
      { status: 'completed' },
    ).pipe(
      tap(() => {
        this.projects.update(list =>
          list.map(p => p.id === projectId ? { ...p, status: 'completed' as const } : p)
        );
        this.logger.info('Team project marked complete', { projectId });
      }),
    );
  }

  softDelete(projectId: string): Observable<{ success: boolean }> {
    return this.http.patch<{ success: boolean }>(
      `${environment.apiUrl}/teams/projects/${projectId}`,
      { status: 'deleted' },
    ).pipe(
      tap(() => {
        this.projects.update(list =>
          list.map(p => p.id === projectId ? { ...p, status: 'deleted' as const } : p)
        );
        this.logger.info('Team project soft-deleted', { projectId });
      }),
    );
  }

  hardDelete(projectId: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(
      `${environment.apiUrl}/teams/projects/${projectId}`,
    ).pipe(
      tap(() => {
        this.projects.update(list => list.filter(p => p.id !== projectId));
        this.logger.info('Team project permanently deleted', { projectId });
      }),
    );
  }

  load(): void {
    const userid = this.auth.currentUserId();
    if (!userid) return;
    this.logger.debug('Loading team projects', { userid });
    this.isLoading.set(true);
    this.error.set(null);

    const params = new HttpParams().set('userid', userid);

    forkJoin({
      projectsRes: this.http.get<TeamProjectsApiResponse>(
        `${environment.apiUrl}/teams/projects`,
        { params },
      ),
      statsRes: this.http.get<TeamProjectStatsApiResponse>(
        `${environment.apiUrl}/teams/projects/stats`,
        { params },
      ),
    }).subscribe({
      next: ({ projectsRes, statsRes }) => {
        this.projects.set(projectsRes.projects);
        this.teams.set(projectsRes.teams);
        this.stats.set({
          totalProjects: statsRes.totalProjects,
          activeProjects: statsRes.activeProjects,
          totalDocuments: statsRes.totalDocuments,
          teams: statsRes.teams,
        });
        this.isLoading.set(false);
        this.logger.info('Team projects loaded', { count: projectsRes.projects.length });
      },
      error: err => {
        this.error.set(err?.error?.message ?? 'Failed to load team projects');
        this.isLoading.set(false);
        this.logger.error('Failed to load team projects', err);
      },
    });
  }
}

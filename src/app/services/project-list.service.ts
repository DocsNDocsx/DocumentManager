import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { Project, ProjectsApiResponse } from '../models/project.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class ProjectListService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  projects = signal<Project[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  submissionStats = signal<Record<string, { approved: number; submitted: number }>>({});

  load(): void {
    const userid = this.auth.currentUserId();
    if (!userid) return;
    this.logger.debug('Loading project list', { userid });
    this.isLoading.set(true);
    this.error.set(null);
    const params = new HttpParams().set('userid', userid);
    this.http.get<ProjectsApiResponse>(`${environment.apiUrl}/projects`, { params }).subscribe({
      next: res => {
        this.projects.set(res.projects);
        this.isLoading.set(false);
        this.logger.info('Project list loaded', { count: res.projects.length });
        const activeIds = res.projects.filter(p => p.status === 'active').map(p => p.id);
        this.loadStats(activeIds);
      },
      error: err => {
        const msg = err?.error?.message ?? 'Failed to load projects';
        this.error.set(msg);
        this.isLoading.set(false);
        this.logger.error('Failed to load project list', err);
      },
    });
  }

  loadStats(projectIds: string[]): void {
    if (projectIds.length === 0) { this.submissionStats.set({}); return; }
    this.logger.debug('Loading submission stats', { projectCount: projectIds.length });
    const params = new HttpParams().set('projectIds', projectIds.join(','));
    this.http.get<{ success: boolean; stats: Record<string, { approved: number; submitted: number }> }>(
      `${environment.apiUrl}/submissions/stats`, { params }
    ).subscribe({
      next: res => {
        this.submissionStats.set(res.stats);
        this.logger.debug('Submission stats loaded');
      },
      error: err => this.logger.error('Failed to load submission stats', err),
    });
  }

  updateOne(id: string, partial: Partial<Project>): void {
    this.logger.debug('Updating project in list', { id, ...partial });
    this.projects.update(list => list.map(p => p.id === id ? { ...p, ...partial } : p));
  }
}

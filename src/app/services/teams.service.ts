import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { tap } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { Team, TeamsApiResponse, CreateTeamRequest, UpdateTeamRequest, TeamApiResponse, TeamDetail, TeamDetailApiResponse } from '../models/team.models';
import { LoggingService } from './logging.service';

@Injectable({ providedIn: 'root' })
export class TeamsService {
  private http = inject(HttpClient);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  teams = signal<Team[]>([]);
  isLoading = signal(false);
  error = signal<string | null>(null);
  teamDetails = signal<Record<string, TeamDetail>>({});
  teamDetailsLoading = signal<Record<string, boolean>>({});

  hostedTeams = computed(() => this.teams().filter(t => t.role === 'host'));
  memberTeams = computed(() => this.teams().filter(t => t.role === 'member'));

  load(): void {
    const userid = this.auth.currentUserId();
    if (!userid) return;
    this.logger.debug('Loading teams list', { userid });
    this.isLoading.set(true);
    this.error.set(null);
    const params = new HttpParams().set('userid', userid);
    this.http.get<TeamsApiResponse>(`${environment.apiUrl}/teams`, { params }).subscribe({
      next: res => {
        this.teams.set(res.teams);
        this.isLoading.set(false);
        this.logger.info('Teams loaded', { count: res.teams.length });
      },
      error: err => {
        this.error.set(err?.error?.message ?? 'Failed to load teams');
        this.isLoading.set(false);
        this.logger.error('Failed to load teams', err);
      },
    });
  }

  loadDetail(teamId: string): void {
    if (this.teamDetails()[teamId]) return;
    this.logger.debug('Loading team detail', { teamId });
    this.teamDetailsLoading.update(r => ({ ...r, [teamId]: true }));
    this.http.get<TeamDetailApiResponse>(`${environment.apiUrl}/teams/${teamId}`).subscribe({
      next: res => {
        this.teamDetails.update(r => ({ ...r, [teamId]: res.team }));
        this.teamDetailsLoading.update(r => ({ ...r, [teamId]: false }));
        this.logger.debug('Team detail loaded', { teamId });
      },
      error: err => {
        this.teamDetailsLoading.update(r => ({ ...r, [teamId]: false }));
        this.logger.error('Failed to load team detail', err);
      },
    });
  }

  create(data: CreateTeamRequest) {
    this.logger.info('Creating team', { name: data.name });
    return this.http.post<TeamApiResponse>(`${environment.apiUrl}/teams`, data).pipe(
      tap({
        next: res => this.logger.info('Team created', { id: res.team?.id }),
        error: err => this.logger.error('Failed to create team', err),
      }),
    );
  }

  update(id: string, data: UpdateTeamRequest) {
    this.logger.info('Updating team', { id });
    return this.http.put<TeamApiResponse>(`${environment.apiUrl}/teams/${id}`, data).pipe(
      tap({
        next: () => this.logger.info('Team updated', { id }),
        error: err => this.logger.error('Failed to update team', err),
      }),
    );
  }

  remove(id: string) {
    this.logger.warn('Removing team', { id });
    return this.http.delete<{ success: boolean; message: string }>(`${environment.apiUrl}/teams/${id}`).pipe(
      tap({
        next: () => this.logger.info('Team removed', { id }),
        error: err => this.logger.error('Failed to remove team', err),
      }),
    );
  }

  updateOne(id: string, partial: Partial<Team>): void {
    this.logger.debug('Updating team in list', { id });
    this.teams.update(list => list.map(t => t.id === id ? { ...t, ...partial } : t));
  }
}

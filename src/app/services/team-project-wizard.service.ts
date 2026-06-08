import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggingService } from './logging.service';
import {
  TeamProjectCollaboratorInput,
  TeamProjectDocumentRequirement,
  TeamProjectDraft,
  TeamProjectDraftApiResponse,
} from '../models/team.models';

@Injectable({ providedIn: 'root' })
export class TeamProjectWizardService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private logger = inject(LoggingService);

  project = signal<TeamProjectDraft | null>(null);
  isSaving = signal(false);
  saveError = signal<string | null>(null);
  teamName = signal<string>('');

  projectId = computed(() => this.project()?.id ?? null);
  completedStep = computed(() => this.project()?.completedStep ?? 0);
  projectCode = computed(() => this.project()?.projectCode ?? null);

  saveDetails(data: {
    teamId: string;
    name: string;
    description: string;
    deadline: string;
    type?: 'private' | 'public';
    expectedCollaborators?: number;
    supportStaff?: { firstName: string; lastName: string; email: string; affiliation: string } | null;
  }): Observable<TeamProjectDraft> {
    const body = {
      userId: this.authService.currentUserId(),
      ...data,
      type: data.type ?? 'private',
      completedStep: 1,
      supportStaff: data.supportStaff ?? null,
    };

    const req$ = this.projectId()
      ? this.http.patch<TeamProjectDraftApiResponse>(`${environment.apiUrl}/teams/projects/${this.projectId()}`, body)
      : this.http.post<TeamProjectDraftApiResponse>(`${environment.apiUrl}/teams/projects`, body);

    return this.runSave(req$, 'details');
  }

  saveCollaborators(collaborators: TeamProjectCollaboratorInput[]): Observable<TeamProjectDraft> {
    const id = this.projectId();
    if (!id) return throwError(() => new Error('No project — complete step 1 first'));
    return this.runSave(
      this.http.post<TeamProjectDraftApiResponse>(
        `${environment.apiUrl}/teams/projects/${id}/collaborators`,
        { collaborators },
      ),
      'collaborators',
    );
  }

  saveDocuments(documents: TeamProjectDocumentRequirement[]): Observable<TeamProjectDraft> {
    const id = this.projectId();
    if (!id) return throwError(() => new Error('No project — complete step 1 first'));
    return this.runSave(
      this.http.post<TeamProjectDraftApiResponse>(
        `${environment.apiUrl}/teams/projects/${id}/documents`,
        { documents },
      ),
      'documents',
    );
  }

  saveAssignments(): Observable<TeamProjectDraft> {
    const id = this.projectId();
    if (!id) return throwError(() => new Error('No project — complete step 1 first'));
    return this.runSave(
      this.http.patch<TeamProjectDraftApiResponse>(
        `${environment.apiUrl}/teams/projects/${id}`,
        { completedStep: 4 },
      ),
      'assignments',
    );
  }

  activateProject(): Observable<TeamProjectDraft> {
    const id = this.projectId();
    if (!id) return throwError(() => new Error('No project to activate'));
    this.logger.info('Activating team project', { projectId: id });
    return this.runSave(
      this.http.patch<TeamProjectDraftApiResponse>(
        `${environment.apiUrl}/teams/projects/${id}`,
        { status: 'active', completedStep: 5 },
      ),
      'activation',
    );
  }

  markComplete(): Observable<TeamProjectDraft> {
    const id = this.projectId();
    if (!id) return throwError(() => new Error('No project to complete'));
    this.logger.info('Marking team project complete', { projectId: id });
    return this.runSave(
      this.http.patch<TeamProjectDraftApiResponse>(
        `${environment.apiUrl}/teams/projects/${id}`,
        { status: 'completed' },
      ),
      'completion',
    );
  }

  loadDraft(id: string): Observable<TeamProjectDraft> {
    this.logger.debug(`Loading team project draft ${id}`);
    return this.http.get<TeamProjectDraftApiResponse>(`${environment.apiUrl}/teams/projects/${id}`).pipe(
      tap({
        next: res => {
          this.project.set(res.project);
          this.logger.info('Team project draft loaded', { id });
        },
        error: err => this.logger.error(`Failed to load team project draft ${id}`, err),
      }),
      map(res => res.project),
    );
  }

  reset(): void {
    this.logger.debug('Team project wizard state reset');
    this.project.set(null);
    this.saveError.set(null);
    this.teamName.set('');
  }

  private runSave(req$: Observable<TeamProjectDraftApiResponse>, context = 'step'): Observable<TeamProjectDraft> {
    this.isSaving.set(true);
    this.saveError.set(null);
    this.logger.debug(`Saving team project ${context}...`);
    return new Observable<TeamProjectDraft>(observer => {
      req$.pipe(
        tap(res => {
          this.project.set(res.project);
          this.logger.info(`Saved team project ${context}`, { projectId: res.project.id });
        }),
        catchError(err => {
          const msg = err?.error?.message ?? 'Something went wrong';
          this.saveError.set(msg);
          this.logger.error(`Failed to save team project ${context}`, err);
          return throwError(() => err);
        }),
        finalize(() => this.isSaving.set(false)),
      ).subscribe({
        next: res => observer.next(res.project),
        error: err => observer.error(err),
        complete: () => observer.complete(),
      });
    });
  }
}

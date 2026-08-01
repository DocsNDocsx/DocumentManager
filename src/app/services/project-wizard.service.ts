import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, finalize, map, tap, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { LoggingService } from './logging.service';
import {
  Project,
  ProjectApiResponse,
  ProjectAssignments,
  ProjectAttachment,
  ProjectCollaborator,
  ProjectDocument,
  ProjectStaff,
} from '../models/project.models';

@Injectable({ providedIn: 'root' })
export class ProjectWizardService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private logger = inject(LoggingService);

  project = signal<Project | null>(null);
  isSaving = signal(false);
  saveError = signal<string | null>(null);

  projectId = computed(() => this.project()?.id ?? null);
  completedStep = computed(() => this.project()?.completedStep ?? 0);
  projectCode = computed(() => this.project()?.projectCode ?? null);

  loadDraft(id: string): Observable<Project> {
    this.logger.debug(`Loading draft project ${id}`);
    return this.http.get<ProjectApiResponse>(`${environment.apiUrl}/projects/${id}`).pipe(
      tap({
        next: res => {
          this.project.set(res.project);
          this.logger.info('Draft project loaded', { id });
        },
        error: err => this.logger.error(`Failed to load draft project ${id}`, err),
      }),
      map(res => res.project),
    );
  }

  saveDetails(data: { name: string; description: string; deadline: string; attachments: ProjectAttachment[] }): Observable<Project> {
    const body = {
      userid: this.authService.currentUserId(),
      ...data,
      completedStep: 1,
      type: 'private',
      status: this.project()?.status ?? 'draft',
    };

    const req$ = this.projectId()
      ? this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, body)
      : this.http.post<ProjectApiResponse>(`${environment.apiUrl}/projects`, body);

    return this.runSave(req$, 'details');
  }

  saveCollaborators(data: { collaborators: ProjectCollaborator[] }): Observable<Project> {
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, {
        ...data,
        completedStep: 2,
      }),
      'collaborators',
    );
  }

  saveDocuments(data: { documents: ProjectDocument[] }): Observable<Project> {
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, {
        ...data,
        completedStep: 3,
      }),
      'documents',
    );
  }

  saveAssignments(data: { assignments: ProjectAssignments }): Observable<Project> {
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, {
        ...data,
        completedStep: 4,
      }),
      'assignments',
    );
  }

  savePublicDetails(data: {
    name: string;
    description: string;
    deadline: string;
    attachments: ProjectAttachment[];
    expectedCollaborators: string;
    staff: ProjectStaff | null;
  }): Observable<Project> {
    const body = {
      userid: this.authService.currentUserId(),
      ...data,
      expectedCollaborators: parseInt(data.expectedCollaborators) || null,
      completedStep: 1,
      type: 'public',
      status: this.project()?.status ?? 'draft',
    };
    const req$ = this.projectId()
      ? this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, body)
      : this.http.post<ProjectApiResponse>(`${environment.apiUrl}/projects`, body);
    return this.runSave(req$, 'public details');
  }

  savePublicDocuments(data: { documents: ProjectDocument[] }): Observable<Project> {
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, {
        ...data,
        completedStep: 2,
      }),
      'public documents',
    );
  }

  saveStaff(data: { staff: ProjectStaff | null }): Observable<Project> {
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, {
        ...data,
        completedStep: 5,
      }),
      'staff',
    );
  }

  saveDraft(): Observable<Project> {
    const proj = this.project();
    if (!proj) return throwError(() => new Error('No project in progress'));
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${proj.id}`, {
        name: proj.name,
        description: proj.description,
        deadline: proj.deadline,
        attachments: proj.attachments,
        collaborators: proj.collaborators,
        documents: proj.documents,
        assignments: proj.assignments,
        staff: proj.staff,
      }),
      'draft',
    );
  }

  activateProject(): Observable<Project> {
    this.logger.info('Activating project', { projectId: this.projectId() });
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}/activate`, {}),
      'activation',
    );
  }

  cancelProject(): Observable<Project> {
    this.logger.warn('Cancelling project', { projectId: this.projectId() });
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}/cancel`, {}),
      'cancellation',
    );
  }

  closeProject(): Observable<Project> {
    this.logger.info('Closing project', { projectId: this.projectId() });
    return this.runSave(
      this.http.patch<ProjectApiResponse>(`${environment.apiUrl}/projects/${this.projectId()}`, { status: 'completed' }),
      'closure',
    );
  }

  reset(): void {
    this.logger.debug('Wizard state reset');
    this.project.set(null);
    this.saveError.set(null);
  }

  private runSave(req$: Observable<ProjectApiResponse>, context = 'step'): Observable<Project> {
    this.isSaving.set(true);
    this.saveError.set(null);
    this.logger.debug(`Saving ${context}...`);
    return new Observable<Project>(observer => {
      req$.pipe(
        tap(res => {
          this.project.set(res.project);
          this.logger.info(`Saved ${context}`, { projectId: res.project.id });
        }),
        catchError(err => {
          const msg = err?.error?.message ?? 'Something went wrong';
          this.saveError.set(msg);
          this.logger.error(`Failed to save ${context}`, err);
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

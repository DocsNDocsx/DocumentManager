import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectListService } from '../../services/project-list.service';
import { TeamProjectsService } from '../../services/team-projects.service';
import { Project, Submission as DbSubmission } from '../../models/project.models';
import { environment } from '../../../environments/environment';
import { LoggingService } from '../../services/logging.service';

type SubmissionStatus = 'pending' | 'approved' | 'revision' | 'rejected';
type ProjectTab = 'solo' | 'team';
type DecisionMode = 'approve' | 'revise' | 'reject' | null;

interface Collaborator {
  firstName: string;
  lastName: string;
  email: string;
}

interface ReviewItem {
  id: string;
  collaborator: Collaborator;
  documentType: string;
  fileName: string;
  submittedDate: string;
  status: SubmissionStatus;
  comments: string | null;
  approvedDate?: string;
}

// DB uses 'submitted' for a document awaiting owner review; the UI calls this 'pending'.
const DB_TO_STATUS: Record<string, SubmissionStatus> = {
  submitted: 'pending',
  approved: 'approved',
  revision: 'revision',
};

interface TeamCollaborator {
  id: string;
  index: number;
  firstName: string;
  lastName: string;
  email: string;
  affiliation: string;
  role: 'supervisor' | 'contributor';
}

@Component({
  selector: 'app-check-submissions',
  templateUrl: './check-submissions.html',
  styleUrl: './check-submissions.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SharedHeaderComponent, FormsModule, SharedSidebarComponent],
  host: { '(document:click)': 'onDocumentClick()' },
})
export class CheckSubmissionsComponent implements OnInit {
  private http = inject(HttpClient);
  private route = inject(ActivatedRoute);
  protected listService = inject(ProjectListService);
  protected teamProjectsService = inject(TeamProjectsService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  activeTab = signal<ProjectTab>('solo');
  resultsVisible = signal(false);
  showReviewModal = signal(false);
  isLoadingSubmissions = signal(false);
  reviewError = signal<string | null>(null);
  downloadError = signal<string | null>(null);

  selectedSoloProject = signal('');
  selectedTeamProject = signal('');
  teamCollaborators = signal<TeamCollaborator[]>([]);
  isLoadingCollaborators = signal(false);
  copiedCollabId = signal<string | null>(null);

  statusFilter = signal('all');
  docTypeFilter = signal('all');

  private allSubmissions = signal<ReviewItem[]>([]);
  private currentReviewing = signal<ReviewItem | null>(null);
  decisionMode = signal<DecisionMode>(null);
  reviewComments = signal('');
  showCommentsForm = signal(false);
  modalFooterMode = signal<DecisionMode>(null);

  // Derived from the real API — active projects owned by the logged-in user.
  soloProjects = computed(() =>
    this.listService.projects().filter(p => p.status === 'active')
  );

  teamProjects = computed(() =>
    this.teamProjectsService.projects().filter(
      p => p.status === 'active' || p.status === 'completed' || p.status === 'not_completed'
    )
  );

  filteredSubmissions = computed(() => {
    const statusF = this.statusFilter();
    const docF = this.docTypeFilter();
    return this.allSubmissions().filter(s => {
      const statusOk = statusF === 'all' || s.status === statusF;
      const docOk = docF === 'all' || s.documentType === docF;
      return statusOk && docOk;
    });
  });

  stats = computed(() => {
    const subs = this.allSubmissions();
    return {
      total: subs.length,
      pending: subs.filter(s => s.status === 'pending').length,
      approved: subs.filter(s => s.status === 'approved').length,
      revision: subs.filter(s => s.status === 'revision').length,
    };
  });

  docTypes = computed(() => [...new Set(this.allSubmissions().map(s => s.documentType))]);

  reviewingSubmission = computed(() => this.currentReviewing());

  ngOnInit(): void {
    this.listService.load();
    this.teamProjectsService.load();

    const projectId = this.route.snapshot.queryParamMap.get('projectId');
    if (projectId) {
      this.activeTab.set('team');
      this.selectedTeamProject.set(projectId);
      this.loadTeamProject();
    }
  }

  switchTab(tab: ProjectTab): void {
    this.activeTab.set(tab);
    this.resultsVisible.set(false);
  }

  loadSoloProject(): void {
    const projectId = this.selectedSoloProject();
    if (!projectId) return;

    // Look up the full project object to resolve collaborator/document names
    // from the submission's collaborator_index and document_index.
    const project = this.listService.projects().find(p => p.id === projectId);
    if (!project) return;

    this.isLoadingSubmissions.set(true);
    this.statusFilter.set('all');
    this.docTypeFilter.set('all');
    this.resultsVisible.set(false);
    this.logger.debug('Loading submissions for project', { projectId });

    this.http.get<{ success: boolean; submissions: DbSubmission[] }>(
      `${environment.apiUrl}/projects/${projectId}/submissions`
    ).subscribe({
      next: res => {
        this.allSubmissions.set(this.mapSubmissions(project, res.submissions));
        this.resultsVisible.set(true);
        this.isLoadingSubmissions.set(false);
        this.logger.info('Submissions loaded', { projectId, count: res.submissions.length });
      },
      error: (err) => {
        this.allSubmissions.set([]);
        this.resultsVisible.set(true);
        this.isLoadingSubmissions.set(false);
        this.logger.error('Failed to load submissions', err);
      },
    });
  }

  private mapSubmissions(project: Project, dbSubs: DbSubmission[]): ReviewItem[] {
    return dbSubs.map(s => {
      const collab = project.collaborators[s.collaborator_index];
      const doc = project.documents[s.document_index];
      return {
        id: s.id,
        collaborator: {
          firstName: collab?.firstName ?? 'Unknown',
          lastName: collab?.lastName ?? '',
          email: collab?.email ?? '',
        },
        documentType: doc?.name ?? 'Unknown Document',
        fileName: s.file_name,
        submittedDate: s.submitted_at,
        status: DB_TO_STATUS[s.status] ?? 'pending',
        comments: s.feedback,
      };
    });
  }

  loadTeamProject(): void {
    const projectId = this.selectedTeamProject();
    if (!projectId) return;
    this.isLoadingCollaborators.set(true);
    this.teamCollaborators.set([]);
    this.allSubmissions.set([]);
    this.statusFilter.set('all');
    this.docTypeFilter.set('all');
    this.resultsVisible.set(false);

    forkJoin({
      collabs: this.http.get<{ success: boolean; collaborators: TeamCollaborator[] }>(
        `${environment.apiUrl}/teams/projects/${projectId}/collaborators`
      ),
      subs: this.http.get<{ success: boolean; submissions: ReviewItem[] }>(
        `${environment.apiUrl}/teams/projects/${projectId}/submissions`
      ),
    }).subscribe({
      next: ({ collabs, subs }) => {
        this.teamCollaborators.set(collabs.collaborators);
        this.allSubmissions.set(subs.submissions);
        this.isLoadingCollaborators.set(false);
        this.resultsVisible.set(true);
        this.logger.info('Team project loaded', { projectId, collaborators: collabs.collaborators.length, submissions: subs.submissions.length });
      },
      error: err => {
        this.isLoadingCollaborators.set(false);
        this.resultsVisible.set(true);
        this.logger.error('Failed to load team project', err);
      },
    });
  }

  getTeamCollaboratorUrl(projectId: string, collaboratorId: string): string {
    return `${window.location.origin}/team-project-upload/${projectId}/${collaboratorId}`;
  }

  copyCollabLink(url: string, collabId: string): void {
    navigator.clipboard.writeText(url).then(() => {
      this.copiedCollabId.set(collabId);
      setTimeout(() => this.copiedCollabId.set(null), 2000);
    });
  }

  openReviewModal(submissionId: string): void {
    const sub = this.allSubmissions().find(s => s.id === submissionId) ?? null;
    this.currentReviewing.set(sub);
    this.decisionMode.set(null);
    this.reviewComments.set('');
    this.showCommentsForm.set(false);
    this.modalFooterMode.set(null);
    this.reviewError.set(null);
    this.showReviewModal.set(true);
  }

  closeReviewModal(): void {
    this.showReviewModal.set(false);
    this.currentReviewing.set(null);
    this.decisionMode.set(null);
  }

  onModalOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.closeReviewModal();
    }
  }

  showApprovalForm(): void {
    this.decisionMode.set('approve');
    this.showCommentsForm.set(true);
    this.modalFooterMode.set('approve');
  }

  showRevisionForm(): void {
    this.decisionMode.set('revise');
    this.showCommentsForm.set(true);
    this.modalFooterMode.set('revise');
  }

  showRejectForm(): void {
    this.decisionMode.set('reject');
    this.showCommentsForm.set(true);
    this.modalFooterMode.set('reject');
  }

  submitDecision(): void {
    const mode = this.decisionMode();
    const comments = this.reviewComments().trim();
    if ((mode === 'revise' || mode === 'reject') && !comments) return;

    const reviewing = this.currentReviewing();
    if (!reviewing) return;
    this.reviewError.set(null);

    const dbStatus = mode === 'approve' ? 'approved' : (mode === 'reject' ? 'rejected' : 'revision');
    const isTeam = this.activeTab() === 'team';
    const projectId = isTeam ? this.selectedTeamProject() : this.selectedSoloProject();
    const url = isTeam
      ? `${environment.apiUrl}/teams/projects/${projectId}/submissions/${reviewing.id}`
      : `${environment.apiUrl}/projects/${projectId}/submissions/${reviewing.id}`;

    this.logger.info('Submitting review decision', { submissionId: reviewing.id, decision: dbStatus });
    this.http.patch<{ success: boolean }>(url, { status: dbStatus, feedback: comments || null }).subscribe({
      next: () => {
        const newStatus: SubmissionStatus = mode === 'approve' ? 'approved' : (mode === 'reject' ? 'rejected' : 'revision');
        this.logger.info('Review decision submitted', { submissionId: reviewing.id, status: newStatus });
        this.allSubmissions.update(subs => subs.map(s => {
          if (s.id !== reviewing.id) return s;
          return {
            ...s,
            status: newStatus,
            comments: comments || null,
            ...(mode === 'approve' ? { approvedDate: new Date().toISOString() } : {}),
          };
        }));
        this.closeReviewModal();
      },
      error: err => {
        this.reviewError.set(err?.error?.message ?? 'Could not save the review decision. Please try again.');
        this.logger.error('Failed to submit review decision', err);
      },
    });
  }

  downloadSubmission(submission: ReviewItem): void {
    const projectId = this.activeTab() === 'team' ? this.selectedTeamProject() : this.selectedSoloProject();
    if (!projectId || this.activeTab() === 'team') return;
    this.downloadError.set(null);
    this.http.get(`${environment.apiUrl}/projects/${projectId}/submissions/${submission.id}/download`, {
      responseType: 'blob',
    }).subscribe({
      next: blob => this.saveBlob(blob, submission.fileName),
      error: err => this.downloadError.set(err?.error?.message ?? 'Could not download the document.'),
    });
  }

  downloadAllApproved(): void {
    const projectId = this.selectedSoloProject();
    if (!projectId || this.activeTab() !== 'solo') return;
    this.downloadError.set(null);
    this.http.get(`${environment.apiUrl}/projects/${projectId}/submissions/approved/download`, {
      responseType: 'blob',
    }).subscribe({
      next: blob => this.saveBlob(blob, 'approved-documents.zip'),
      error: err => this.downloadError.set(err?.error?.message ?? 'Could not download approved documents.'),
    });
  }

  private saveBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  getInitials(first: string, last: string): string {
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  }

  getStatusText(status: SubmissionStatus): string {
    const map: Record<SubmissionStatus, string> = {
      pending: 'Pending',
      approved: 'Approved',
      revision: 'Needs Revision',
      rejected: 'Rejected',
    };
    return map[status];
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDateFull(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  }

  toggleDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  onDocumentClick(): void {
    this.dropdownOpen.set(false);
  }
}

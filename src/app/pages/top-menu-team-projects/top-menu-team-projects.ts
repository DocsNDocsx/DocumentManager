import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamProjectsService } from '../../services/team-projects.service';
import { TeamProjectItem } from '../../models/team.models';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { BillingEstimateService } from '../../services/billing-estimate.service';
import { ConfirmModalComponent } from '../../shared/confirm-modal/confirm-modal';

type ProjectStatus = TeamProjectItem['status'];

@Component({
  selector: 'app-top-menu-team-projects',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent, ConfirmModalComponent],
  templateUrl: './top-menu-team-projects.html',
  styleUrl: './top-menu-team-projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class TopMenuTeamProjectsComponent implements OnInit {
  readonly teamProjectsService = inject(TeamProjectsService);
  private readonly router = inject(Router);
  private readonly http = inject(HttpClient);
  private readonly billingEstimate = inject(BillingEstimateService);
  pendingPaymentProject = signal<TeamProjectItem | null>(null);
  private readonly pendingPaymentEffect = effect(() => {
    if (this.teamProjectsService.isLoading() || this.pendingPaymentProject()) return;
    const pending = this.teamProjectsService.projects().find(project => project.status === 'active' && project.userRole === 'host' && project.pendingBillingUpgrade);
    if (pending) this.pendingPaymentProject.set(pending);
  });

  dropdownOpen = signal(false);
  activeStatus = signal<ProjectStatus>('active');
  selectedTeamId = signal<'all' | string>('all');

  filteredProjects = computed(() => {
    const status = this.activeStatus();
    const teamId = this.selectedTeamId();
    return this.teamProjectsService.projects().filter(
      p => p.status === status && (teamId === 'all' || p.teamId === teamId),
    );
  });

  statTotal = computed(() => {
    const teamId = this.selectedTeamId();
    const projects = this.teamProjectsService.projects();
    return teamId === 'all'
      ? projects.length
      : projects.filter(p => p.teamId === teamId).length;
  });

  statActive = computed(() => {
    const teamId = this.selectedTeamId();
    return this.teamProjectsService
      .projects()
      .filter(p => p.status === 'active' && (teamId === 'all' || p.teamId === teamId)).length;
  });

  statDocs = computed(() => {
    const teamId = this.selectedTeamId();
    const projects = this.teamProjectsService.projects();
    const filtered = teamId === 'all' ? projects : projects.filter(p => p.teamId === teamId);
    return filtered.reduce((sum, p) => sum + p.documentCount, 0);
  });

  readonly statusList: ProjectStatus[] = ['active', 'draft', 'completed', 'not_completed', 'deleted'];

  ngOnInit(): void {
    this.teamProjectsService.load();
  }

  discardUnpaidChanges(): void {
    const project = this.pendingPaymentProject();
    if (!project) return;
    this.http.post(`${environment.apiUrl}/teams/projects/${project.id}/discard-pending-upgrade`, {}).subscribe({ next: () => { this.pendingPaymentProject.set(null); this.teamProjectsService.load(); } });
  }

  payForPendingChanges(): void {
    const project = this.pendingPaymentProject();
    const baseline = project?.pendingBillingUpgrade;
    if (!project || !baseline) return;
    const documents = Array.from({ length: project.documentCount }, () => ({ name: '', fileTypes: [], maxSize: '', sizeUnit: '', templateName: '' }));
    const collaboratorCount = project.type === 'public' ? project.expectedCollaborators : project.collabUploadCount;
    const queryParams = this.billingEstimate.buildTeamActivationQuery({ id: project.id, deadline: project.deadline, documents, expectedCollaborators: collaboratorCount });
    if (!queryParams) return;
    const baselineCollaboratorCount = project.type === 'public' ? baseline.expectedCollaborators : baseline.collaborators.length;
    const baselineQuery = this.billingEstimate.buildTeamActivationQuery({
      id: project.id,
      deadline: baseline.deadline,
      documents: baseline.documents,
      expectedCollaborators: baselineCollaboratorCount,
    });
    queryParams['monthly'] = Math.max(0, Number(queryParams['monthly']) - Number(baselineQuery?.['monthly'] ?? 0)).toFixed(2);
    queryParams['upgrade'] = '1';
    queryParams['extensionDays'] = this.billingEstimate.deadlineExtensionDays(baseline.deadline, project.deadline);
    this.pendingPaymentProject.set(null);
    this.router.navigate(['/pricing-plan-ccard-information'], { queryParams });
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  setStatus(status: ProjectStatus): void {
    this.activeStatus.set(status);
  }

  onTeamChange(event: Event): void {
    this.selectedTeamId.set((event.target as HTMLSelectElement).value);
  }

  statusBadgeClass(status: ProjectStatus): string {
    const map: Record<ProjectStatus, string> = {
      active: 'status-active',
      draft: 'status-draft',
      completed: 'status-completed',
      not_completed: 'status-not-completed',
      deleted: 'status-deleted',
    };
    return map[status] ?? 'status-draft';
  }

  statusLabel(status: ProjectStatus): string {
    const map: Record<ProjectStatus, string> = {
      active: 'Active',
      draft: 'Draft',
      completed: 'Completed',
      not_completed: 'Not Completed',
      deleted: 'Deleted',
    };
    return map[status] ?? status;
  }

  statusFilterIcon(status: ProjectStatus): string {
    const map: Record<ProjectStatus, string> = {
      active: 'fa-play-circle',
      draft: 'fa-file-alt',
      completed: 'fa-check-circle',
      not_completed: 'fa-exclamation-circle',
      deleted: 'fa-trash',
    };
    return map[status];
  }

  formatDeadline(deadline: string | null): string {
    if (!deadline) return 'No deadline';
    const date = new Date(deadline);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  completingProjectId = signal<string | null>(null);
  copiedProjectId = signal<string | null>(null);
  deletingProjectId = signal<string | null>(null);

  onMarkComplete(project: TeamProjectItem, event: Event): void {
    event.preventDefault();
    if (this.completingProjectId()) return;
    this.completingProjectId.set(project.id);
    this.teamProjectsService.markComplete(project.id).subscribe({
      next: () => this.completingProjectId.set(null),
      error: () => this.completingProjectId.set(null),
    });
  }

  canDelete(project: TeamProjectItem): boolean {
    if (project.status === 'active') return false;
    if (project.userRole === 'host') return true;
    return this.teamProjectsService.teams().some(t => t.id === project.teamId && t.role === 'host');
  }

  onDelete(project: TeamProjectItem, event: Event): void {
    event.preventDefault();
    if (this.deletingProjectId()) return;
    const isHard = project.status === 'deleted';
    const confirmed = isHard
      ? confirm(`Permanently delete "${project.name}"? This cannot be undone.`)
      : confirm(`Move "${project.name}" to deleted? You can permanently remove it later.`);
    if (!confirmed) return;
    this.deletingProjectId.set(project.id);
    const action$ = isHard
      ? this.teamProjectsService.hardDelete(project.id)
      : this.teamProjectsService.softDelete(project.id);
    action$.subscribe({
      next: () => this.deletingProjectId.set(null),
      error: () => this.deletingProjectId.set(null),
    });
  }

  onView(project: TeamProjectItem): void {
    this.router.navigate(['/check-submissions'], { queryParams: { projectId: project.id } });
  }

  onEdit(project: TeamProjectItem): void {
    this.router.navigate(['/new-team-project', project.type, project.id, 'details']);
  }

  onUpload(project: TeamProjectItem): void {
    if (!project.myCollaboratorId) return;
    this.router.navigate(['/team-project-upload', project.id, project.myCollaboratorId]);
  }

  hasRole(project: TeamProjectItem, role: NonNullable<TeamProjectItem['roles']>[number]): boolean {
    return project.roles?.includes(role) ?? false;
  }

  canManage(project: TeamProjectItem): boolean {
    return this.hasRole(project, 'host') || this.hasRole(project, 'supervisor');
  }

  collectionProgress(project: TeamProjectItem): number {
    const total = project.documentCount * project.collabUploadCount;
    if (total === 0) return 0;
    if (project.type === 'public') {
      return Math.min(100, Math.round(((project.submittedCount + project.approvedCount) / total) * 100));
    }
    const score = project.submittedCount * 0.25 + project.approvedCount * 0.75;
    return Math.min(100, Math.round((score / total) * 100));
  }

  onCopyProjectCode(project: TeamProjectItem, event: Event): void {
    event.stopPropagation();
    if (!project.projectCode) return;
    navigator.clipboard.writeText(project.projectCode).then(() => {
      this.copiedProjectId.set(project.id);
      setTimeout(() => this.copiedProjectId.set(null), 2000);
    });
  }

  onCopyInviteCode(project: TeamProjectItem, event: Event): void {
    event.preventDefault();
    const code = project.projectCode;
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      this.copiedProjectId.set(project.id);
      setTimeout(() => this.copiedProjectId.set(null), 2000);
    });
  }
}

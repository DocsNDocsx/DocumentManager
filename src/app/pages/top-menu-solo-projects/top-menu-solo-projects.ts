import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { ProjectListService } from '../../services/project-list.service';
import { AuthService } from '../../services/auth.service';
import { Project } from '../../models/project.models';
import { environment } from '../../../environments/environment';
import { LoggingService } from '../../services/logging.service';

type FilterTab = 'Active' | 'Draft' | 'Completed' | 'Not Completed' | 'Deleted';

@Component({
  selector: 'app-top-menu-solo-projects',
  imports: [SharedHeaderComponent, SharedSidebarComponent, RouterLink],
  templateUrl: './top-menu-solo-projects.html',
  styleUrl: './top-menu-solo-projects.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'closeDropdown()' },
})
export class TopMenuSoloProjectsComponent implements OnInit {
  private http = inject(HttpClient);
  protected listService = inject(ProjectListService);
  private auth = inject(AuthService);
  private logger = inject(LoggingService);

  dropdownOpen = signal(false);
  activeFilter = signal<FilterTab>('Active');
  viewingProject = signal<Project | null>(null);

  private nonCancelledProjects = computed(() => this.listService.projects().filter(p => p.status !== 'cancelled'));
  private activeOnlyProjects   = computed(() => this.nonCancelledProjects().filter(p => p.status === 'active' && this.daysFromNow(p.deadline) >= 0));

  filteredProjects = computed(() => {
    const all = this.listService.projects();
    switch (this.activeFilter()) {
      case 'Active':        return this.activeOnlyProjects();
      case 'Draft':         return all.filter(p => p.status === 'draft');
      case 'Completed':     return all.filter(p => p.status === 'completed');
      case 'Not Completed': return all.filter(p => p.status === 'active' && this.daysFromNow(p.deadline) < 0);
      case 'Deleted':       return all.filter(p => p.status === 'cancelled');
      default:              return [];
    }
  });

  totalProjects = computed(() => this.nonCancelledProjects().length);
  activeCount   = computed(() => this.activeOnlyProjects().length);
  totalDocSlots = computed(() => this.nonCancelledProjects().reduce((s, p) => s + (p.documents?.length ?? 0), 0));

  overallCompletionRate = computed(() => {
    const active = this.activeOnlyProjects();
    const totalSlots = active.reduce((s, p) => s + this.totalSlots(p), 0);
    if (totalSlots === 0) return 0;
    const weighted = active.reduce((s, p) => {
      const stat = this.listService.submissionStats()[p.id];
      return s + (stat?.approved ?? 0) + (stat?.submitted ?? 0) * 0.25;
    }, 0);
    return Math.round((weighted / totalSlots) * 100);
  });

  progressPctMap = computed(() => {
    const stats = this.listService.submissionStats();
    return Object.fromEntries(
      this.listService.projects().map(p => {
        const total = this.totalSlots(p);
        if (total === 0) return [p.id, 0];
        const stat = stats[p.id];
        return [p.id, Math.round(((stat?.approved ?? 0) + (stat?.submitted ?? 0) * 0.25) / total * 100)];
      })
    );
  });

  userRolesMap = computed(() => {
    const uid = this.auth.currentUserId();
    return Object.fromEntries(
      this.listService.projects().map(p => {
        const roles: ('host' | 'collaborator' | 'support')[] = [];
        if (String(p.userId) === uid) roles.push('host');
        return [p.id, roles];
      })
    );
  });

  ngOnInit(): void {
    this.listService.load();
  }

  applyFilter(f: FilterTab): void { this.activeFilter.set(f); }
  toggleDropdown(e: MouseEvent): void { e.stopPropagation(); this.dropdownOpen.update(v => !v); }
  closeDropdown(): void { this.dropdownOpen.set(false); }

  onView(project: Project, e: Event): void {
    e.stopPropagation();
    this.viewingProject.set(project);
  }

  closeViewModal(): void { this.viewingProject.set(null); }

  onViewModalOverlayClick(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('modal-overlay')) this.closeViewModal();
  }

  getCollaboratorUrl(projectId: string, index: number): string {
    return `${window.location.origin}/collaborator-view/${projectId}/${index}`;
  }

  getInitials(first: string, last: string): string {
    return (first.charAt(0) + last.charAt(0)).toUpperCase();
  }

  copyToClipboard(text: string, btn: EventTarget | null): void {
    if (!(btn instanceof HTMLButtonElement)) return;
    const flash = (b: HTMLButtonElement) => {
      const orig = b.innerHTML;
      b.innerHTML = '<i class="fas fa-check" aria-hidden="true"></i> Copied!';
      b.style.background = '#22c55e';
      setTimeout(() => { b.innerHTML = orig; b.style.background = ''; }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(() => flash(btn));
    } else {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      try { document.execCommand('copy'); } finally { document.body.removeChild(ta); }
      flash(btn);
    }
  }

  daysFromNow(dateStr: string | null | undefined): number {
    if (!dateStr) return 0;
    const ms = new Date(dateStr).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0);
    return Math.round(ms / 86_400_000);
  }

  formatDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  statusLabel(project: Project): string {
    if (project.status === 'active' && this.daysFromNow(project.deadline) < 0) return 'Expired';
    if (project.status === 'cancelled') return 'Deleted';
    const map: Record<string, string> = { draft: 'Draft', active: 'Active', completed: 'Completed' };
    return map[project.status] ?? project.status;
  }

  statusClass(project: Project): string {
    if (project.status === 'active' && this.daysFromNow(project.deadline) < 0) return 'status-badge status-expired';
    if (project.status === 'cancelled') return 'status-badge status-deleted';
    const map: Record<string, string> = { draft: 'status-badge status-draft', active: 'status-badge status-active', completed: 'status-badge status-completed' };
    return map[project.status] ?? 'status-badge';
  }

  onActivate(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.info('Activating project', { id: project.id });
    this.http.patch<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects/${project.id}/activate`, {}).subscribe({
      next: res => {
        this.logger.info('Project activated', { id: project.id });
        this.listService.updateOne(project.id, { status: res.project.status, projectCode: res.project.projectCode });
      },
      error: err => this.logger.error('Failed to activate project', err),
    });
  }

  onMarkComplete(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.info('Marking project complete', { id: project.id });
    this.http.patch<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects/${project.id}`, { status: 'completed' }).subscribe({
      next: () => {
        this.logger.info('Project marked complete', { id: project.id });
        this.listService.updateOne(project.id, { status: 'completed' });
      },
      error: err => this.logger.error('Failed to mark project complete', err),
    });
  }

  onSoftDelete(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.warn('Soft-deleting project', { id: project.id });
    this.http.patch<{ success: boolean }>(`${environment.apiUrl}/projects/${project.id}/cancel`, {}).subscribe({
      next: () => {
        this.logger.info('Project soft-deleted', { id: project.id });
        this.listService.updateOne(project.id, { status: 'cancelled' });
      },
      error: err => this.logger.error('Failed to soft-delete project', err),
    });
  }

  onRestore(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.info('Restoring project', { id: project.id });
    this.http.patch<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects/${project.id}`, { status: 'draft' }).subscribe({
      next: () => {
        this.logger.info('Project restored to draft', { id: project.id });
        this.listService.updateOne(project.id, { status: 'draft' });
      },
      error: err => this.logger.error('Failed to restore project', err),
    });
  }

  onDuplicate(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.info('Duplicating project', { id: project.id });
    const body = {
      userid: this.auth.currentUserId(),
      name: project.name + ' (Copy)',
      description: project.description,
      deadline: project.deadline ? project.deadline.split('T')[0] : null,
      type: project.type,
      collaborators: project.collaborators,
      documents: project.documents,
      assignments: project.assignments,
      attachments: project.attachments,
      staff: project.staff,
      expectedCollaborators: project.expectedCollaborators,
    };
    this.http.post<{ success: boolean; project: Project }>(`${environment.apiUrl}/projects`, body).subscribe({
      next: res => {
        this.logger.info('Project duplicated', { id: res.project.id });
        this.listService.projects.update(list => [res.project, ...list]);
      },
      error: err => this.logger.error('Failed to duplicate project', err),
    });
  }

  onHardDelete(project: Project, e: Event): void {
    e.stopPropagation();
    this.logger.warn('Hard-deleting project', { id: project.id });
    this.http.delete<{ success: boolean }>(`${environment.apiUrl}/projects/${project.id}`).subscribe({
      next: () => {
        this.logger.info('Project permanently deleted', { id: project.id });
        this.listService.projects.update(list => list.filter(p => p.id !== project.id));
      },
      error: err => this.logger.error('Failed to delete project', err),
    });
  }

  totalSlots(project: Project): number {
    return Object.values(project.assignments).reduce((s, docs) => s + docs.length, 0);
  }

}

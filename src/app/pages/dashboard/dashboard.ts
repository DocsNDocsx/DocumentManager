import { ChangeDetectionStrategy, Component, OnInit, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { AuthService } from '../../services/auth.service';
import { DashboardService } from '../../services/dashboard.service';
import { ActivityIconType, DashboardProject } from '../../models/dashboard.models';
import { TEAM_FEATURE_ENABLED } from '../../config/features';

@Component({
  selector: 'app-dashboard',
  imports: [SharedHeaderComponent, RouterLink, SharedSidebarComponent],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardComponent implements OnInit {
  private auth = inject(AuthService);
  protected dashboard = inject(DashboardService);

  userFirstname = this.auth.currentUserFirstname;
  progressWidth = computed(() => `${this.dashboard.stats()?.storageUsedPercent ?? 0}%`);
  visibleRecentProjects = computed(() => this.dashboard.recentProjects().filter(project =>
    TEAM_FEATURE_ENABLED || project.type === 'solo'
  ));

  ngOnInit(): void {
    this.dashboard.load();
  }

  badgeClass(type: 'solo' | 'team', visibility: 'public' | 'private'): string {
    return `project-badge badge-${type}-${visibility}`;
  }

  badgeLabel(type: 'solo' | 'team', visibility: 'public' | 'private'): string {
    return `${type === 'solo' ? 'Solo' : 'Team'} • ${visibility === 'public' ? 'Public' : 'Private'}`;
  }

  projectRoute(project: DashboardProject): string {
    return project.type === 'solo' ? '/top-menu-solo-projects' : '/top-menu-team-projects';
  }

  formatDeadline(deadline: string | null, isOngoing: boolean): string {
    if (isOngoing || !deadline) return 'Ongoing';
    const d = new Date(deadline);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  activityIconClass(type: ActivityIconType): string {
    const map: Record<ActivityIconType, string> = {
      upload: 'activity-icon upload',
      invite: 'activity-icon invite',
      team: 'activity-icon team',
      decision: 'activity-icon invite',
      delete: 'activity-icon upload',
      settings: 'activity-icon team',
    };
    return map[type] ?? 'activity-icon upload';
  }

  activityFaIcon(type: ActivityIconType): string {
    const map: Record<ActivityIconType, string> = {
      upload: 'fas fa-file-upload',
      invite: 'fas fa-envelope',
      team: 'fas fa-users',
      decision: 'fas fa-check-circle',
      delete: 'fas fa-trash-alt',
      settings: 'fas fa-lock',
    };
    return map[type] ?? 'fas fa-bell';
  }

  formatTime(timestamp: string): string {
    const now = new Date();
    const then = new Date(timestamp);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays === 1) {
      return `Yesterday at ${then.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
    }
    return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  copyProjectId(e: MouseEvent, projectId: string): void {
    e.preventDefault();
    e.stopPropagation();
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(projectId);
    } else {
      const ta = document.createElement('textarea');
      ta.value = projectId;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
  }
}

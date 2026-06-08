import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { TitleCasePipe } from '@angular/common';
import { SharedHeaderComponent } from '../../shared/shared-header/shared-header';
import { SharedSidebarComponent } from '../../shared/shared-sidebar/shared-sidebar';
import { TeamsService } from '../../services/teams.service';
import { TeamDetail, TeamProject } from '../../models/team.models';

@Component({
  selector: 'app-top-menu-teams-view-teams',
  imports: [SharedHeaderComponent, RouterLink, TitleCasePipe, SharedSidebarComponent],
  templateUrl: './top-menu-teams-view-teams.html',
  styleUrl: './top-menu-teams-view-teams.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(document:click)': 'closeDropdown()',
  },
})
export class TopMenuTeamsViewTeamsComponent implements OnInit {
  readonly teamsService = inject(TeamsService);
  private route = inject(ActivatedRoute);

  dropdownOpen = signal(false);
  expandedIds = signal<Set<string>>(new Set());

  ngOnInit(): void {
    this.teamsService.load();
    const focusId = this.route.snapshot.queryParamMap.get('id');
    if (focusId) {
      this.expandedIds.set(new Set([focusId]));
      this.teamsService.loadDetail(focusId);
    }
  }

  toggleDropdown(event: Event): void {
    event.stopPropagation();
    this.dropdownOpen.update(v => !v);
  }

  closeDropdown(): void {
    this.dropdownOpen.set(false);
  }

  toggleTeam(teamId: string): void {
    this.expandedIds.update(s => {
      const n = new Set(s);
      if (n.has(teamId)) {
        n.delete(teamId);
      } else {
        n.add(teamId);
        this.teamsService.loadDetail(teamId);
      }
      return n;
    });
  }

  getDetail(teamId: string): TeamDetail | undefined {
    return this.teamsService.teamDetails()[teamId];
  }

  getProjects(teamId: string): TeamProject[] {
    return this.getDetail(teamId)?.projects ?? [];
  }

  getMemberCount(teamId: string): number {
    return (this.getDetail(teamId)?.members.length ?? 0) + 1;
  }

  getActiveCount(teamId: string): number {
    return this.getProjects(teamId).filter(p => p.status === 'active').length;
  }

  getCompletedCount(teamId: string): number {
    return this.getProjects(teamId).filter(p => p.status === 'completed').length;
  }

  getDraftCount(teamId: string): number {
    return this.getProjects(teamId).filter(p => p.status === 'draft').length;
  }

  getTotalCollabs(teamId: string): number {
    return this.getProjects(teamId).reduce((s, p) => s + p.collaboratorCount, 0);
  }

  getInitials(first: string, last: string): string {
    return ((first || '?').charAt(0) + (last || '?').charAt(0)).toUpperCase();
  }

  statusClass(status: string): string {
    const map: Record<string, string> = {
      active: 'status-active',
      draft: 'status-draft',
      completed: 'status-completed',
      pending: 'status-pending',
    };
    return map[status] || 'status-pending';
  }

  isDetailLoading(teamId: string): boolean {
    return this.teamsService.teamDetailsLoading()[teamId] ?? false;
  }
}
